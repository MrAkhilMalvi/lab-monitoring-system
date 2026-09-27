const loginBtn = document.getElementById('loginBtn');
const demoBtn = document.getElementById('demoBtn');
const labNameInput = document.getElementById('labName');
const errorDiv = document.getElementById('errorDiv');
const loginView = document.getElementById('loginView');
const dashboardView = document.getElementById('dashboardView');
const pcGrid = document.getElementById('pcGrid');
const pcCounter = document.getElementById('pcCounter');
const labTitle = document.getElementById('labTitle');

// Drawer Inspector Elements
const inspectorDrawer = document.getElementById('inspectorDrawer');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');
const drawerPcName = document.getElementById('drawerPcName');
const drawerStatusBadge = document.getElementById('drawerStatusBadge');
const drawerRollNo = document.getElementById('drawerRollNo');
const drawerStudentName = document.getElementById('drawerStudentName');
const drawerCourseSem = document.getElementById('drawerCourseSem');
const drawerExamTime = document.getElementById('drawerExamTime');
const drawerCurrentApp = document.getElementById('drawerCurrentApp');
const logList = document.getElementById('logList');

window.activePCs = window.activePCs || new Map();
let selectedPcId = null;

// Handle Station Login Initialization
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

// Load bundled sample-data.json so the dashboard UI can be previewed
// without a live server / connected student nodes.
if (demoBtn) {
  demoBtn.addEventListener('click', async () => {
    if (errorDiv) errorDiv.textContent = 'Loading demo data...';
    try {
      const res = await fetch('sample-data.json');
      if (!res.ok) throw new Error('sample-data.json not found');
      const demoPCs = await res.json();

      window.activePCs.clear();
      demoPCs.forEach(pc => {
        const pcId = pc.id || pc.socketId;
        if (pcId) window.activePCs.set(pcId, pc);
      });

      if (errorDiv) errorDiv.textContent = '';
      if (labTitle) labTitle.textContent = 'Station: DEMO MODE';

      loginView.style.display = 'none';
      dashboardView.style.display = 'flex';

      renderGrid();
    } catch (err) {
      console.error('[Demo Data Error]:', err);
      if (errorDiv) errorDiv.textContent = 'Could not load sample-data.json.';
    }
  });
}

// Bind incoming Socket Streams
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

// Render dynamic card view
function renderGrid() {
  if (!pcGrid) return;
  pcGrid.innerHTML = '';
  if (pcCounter) pcCounter.textContent = window.activePCs.size;

  window.activePCs.forEach((pc, id) => {
    const card = document.createElement('div');
    card.className = `pc-card ${selectedPcId === id ? 'active-selected' : ''}`;

    let color = '#16A34A'; // Normal Status Green
    if (pc.status === 'red') color = '#D97706'; // Moderate Flag Amber
    if (pc.status === 'dark-red') color = '#DC2626'; // Restricted Flag Red

    card.innerHTML = `
      <div class="pc-header">
        <span class="pc-title">${pc.pcName}</span>
        <span class="status-dot" style="background-color: ${color}; box-shadow: 0 0 6px ${color};"></span>
      </div>
      <div class="pc-meta">
        <p><strong>${pc.rollNo || '--'}</strong> · ${pc.studentName}</p>
        <p>${pc.course} (${pc.semester})</p>
      </div>
      <div class="pc-app-bar">
        <strong>Active App:</strong> ${pc.currentApp}
      </div>
    `;

    card.addEventListener('click', () => openInspector(id));
    pcGrid.appendChild(card);
  });
}

// Open and update side drawer inspector
function openInspector(pcId) {
  const pc = window.activePCs.get(pcId);
  if (!pc) return;

  selectedPcId = pcId;
  renderGrid();

  updateInspectorDrawer(pc);
  inspectorDrawer.classList.add('open');
}

function updateInspectorDrawer(pc) {
  drawerPcName.textContent = pc.pcName;
  if (drawerRollNo) drawerRollNo.textContent = pc.rollNo || '--';
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

function closeDrawer() {
  selectedPcId = null;
  inspectorDrawer.classList.remove('open');
  renderGrid();
}

if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', closeDrawer);