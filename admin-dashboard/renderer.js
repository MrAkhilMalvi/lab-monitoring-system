const loginBtn = document.getElementById('loginBtn');
const labNameInput = document.getElementById('labName');
const errorDiv = document.getElementById('errorDiv');
const loginView = document.getElementById('loginView');
const dashboardView = document.getElementById('dashboardView');
const pcGrid = document.getElementById('pcGrid');
const pcCounter = document.getElementById('pcCounter');
const labTitle = document.getElementById('labTitle');

// Inspector Drawer Elements
const inspectorDrawer = document.getElementById('inspectorDrawer');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');
const drawerPcName = document.getElementById('drawerPcName');
const drawerStatusBadge = document.getElementById('drawerStatusBadge');
const drawerStudentName = document.getElementById('drawerStudentName');
const drawerCourseSem = document.getElementById('drawerCourseSem');
const drawerExamTime = document.getElementById('drawerExamTime');
const drawerCurrentApp = document.getElementById('drawerCurrentApp');
const logList = document.getElementById('logList');

window.activePCs = window.activePCs || new Map();
let selectedPcId = null;

// Connect / Login Logic
if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    const labId = labNameInput?.value?.trim();

    if (!labId) {
      if (errorDiv) errorDiv.textContent = 'Please enter a valid Lab Station ID.';
      return;
    }

    if (!window.adminAPI) {
      if (errorDiv) errorDiv.textContent = 'Preload bridge failed to load.';
      return;
    }

    if (errorDiv) errorDiv.textContent = 'Connecting...';

    try {
      const response = await window.adminAPI.login(labId);

      if (response && response.success) {
        if (errorDiv) errorDiv.textContent = '';
        if (labTitle) labTitle.textContent = `Station: ${labId}`;

        window.activePCs.clear();
        if (Array.isArray(response.activePcs)) {
          response.activePcs.forEach(pc => {
            const pcId = pc.id || pc.socketId;
            if (pcId) window.activePCs.set(pcId, pc);
          });
        }

        loginView.style.display = 'none';
        dashboardView.style.display = 'flex';

        bindSocketListeners();
        renderGrid();
      } else {
        if (errorDiv) errorDiv.textContent = response?.message || 'Failed to authenticate.';
      }
    } catch (err) {
      console.error('[Renderer Error]:', err);
      if (errorDiv) errorDiv.textContent = err.message || 'Connection timeout.';
    }
  });
}

// Socket Subscriptions
function bindSocketListeners() {
  window.adminAPI.onPcConnected((pc) => {
    const pcId = pc.id || pc.socketId;
    window.activePCs.set(pcId, pc);
    renderGrid();
    if (selectedPcId === pcId) updateInspectorDrawer(pc);
  });

  window.adminAPI.onPcTelemetryUpdate((data) => {
    const pc = window.activePCs.get(data.id);
    if (pc) {
      pc.status = data.status;
      pc.currentApp = data.currentApp;
      if (data.logEntry) {
        pc.logs = pc.logs || [];
        pc.logs.unshift(data.logEntry);
      }
      renderGrid();
      if (selectedPcId === data.id) updateInspectorDrawer(pc);
    }
  });

  window.adminAPI.onPcDisconnected((data) => {
    window.activePCs.delete(data.id);
    if (selectedPcId === data.id) closeDrawer();
    renderGrid();
  });
}

// Render Grid Cards
function renderGrid() {
  if (!pcGrid) return;
  pcGrid.innerHTML = '';
  if (pcCounter) pcCounter.textContent = window.activePCs.size;

  window.activePCs.forEach((pc, id) => {
    const card = document.createElement('div');
    card.className = `pc-card ${selectedPcId === id ? 'active-selected' : ''}`;

    let color = '#22c55e'; // Green
    if (pc.status === 'red') color = '#f59e0b'; // Amber
    if (pc.status === 'dark-red') color = '#ef4444'; // Red

    card.innerHTML = `
      <div class="pc-header">
        <span class="pc-title">${pc.pcName}</span>
        <span class="status-dot" style="background-color: ${color}; box-shadow: 0 0 8px ${color};"></span>
      </div>
      <div class="pc-meta">
        <p><strong>Student:</strong> ${pc.studentName}</p>
        <p>${pc.course} (${pc.semester})</p>
      </div>
      <div class="pc-app-bar">
        <strong>App:</strong> ${pc.currentApp}
      </div>
    `;

    card.addEventListener('click', () => openInspector(id));
    pcGrid.appendChild(card);
  });
}

// Open and populate side inspector
function openInspector(pcId) {
  const pc = window.activePCs.get(pcId);
  if (!pc) return;

  selectedPcId = pcId;
  renderGrid(); // Highlight active card border

  updateInspectorDrawer(pc);
  inspectorDrawer.classList.add('open');
}

function updateInspectorDrawer(pc) {
  drawerPcName.textContent = pc.pcName;
  drawerStudentName.textContent = pc.studentName;
  drawerCourseSem.textContent = `${pc.course} - ${pc.semester}`;
  drawerExamTime.textContent = pc.examTime || '09:00 AM - 12:00 PM';
  drawerCurrentApp.textContent = pc.currentApp;

  // Status Badge Updates
  drawerStatusBadge.className = 'badge';
  if (pc.status === 'dark-red') {
    drawerStatusBadge.textContent = 'RESTRICTED APP DETECTED';
    drawerStatusBadge.classList.add('danger');
  } else if (pc.status === 'red') {
    drawerStatusBadge.textContent = 'UNAUTHORIZED FOCUS';
    drawerStatusBadge.classList.add('warning');
  } else {
    drawerStatusBadge.textContent = 'NORMAL';
    drawerStatusBadge.classList.add('normal');
  }

  // Render Log Entries
  logList.innerHTML = '';
  const logs = pc.logs || [];
  if (logs.length === 0) {
    logList.innerHTML = '<div class="log-entry">No events logged for this session.</div>';
  } else {
    logs.forEach(log => {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.textContent = log;
      logList.appendChild(entry);
    });
  }
}

// Close Inspector Side Drawer
function closeDrawer() {
  selectedPcId = null;
  inspectorDrawer.classList.remove('open');
  renderGrid();
}

if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', closeDrawer);