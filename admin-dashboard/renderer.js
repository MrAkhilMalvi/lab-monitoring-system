// UI Element References
const loginBtn = document.getElementById('loginBtn');
const identifierInput = document.getElementById('identifier') || document.getElementById('labName');
const passwordInput = document.getElementById('password');
const errorDiv = document.getElementById('errorDiv');
const loginView = document.getElementById('loginView');
const dashboardView = document.getElementById('dashboardView');
const pcGrid = document.getElementById('pcGrid');
const pcCounter = document.getElementById('pcCounter');
const labTitle = document.getElementById('labTitle');
const assistantMeta = document.getElementById('assistantMeta');
const logoutBtn = document.getElementById('logoutBtn');

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

// Global State
window.activePCs = window.activePCs || new Map();
let selectedPcId = null;
let currentSession = null;

// ==========================================
// 1. LAB ASSISTANT AUTHENTICATION
// ==========================================
if (loginBtn) {
  loginBtn.addEventListener('click', async (e) => {
    if (e) e.preventDefault();

    const identifier = identifierInput?.value?.trim();
    const password = passwordInput?.value;

    if (!identifier || !password) {
      showError('Please enter both your Email / Staff ID and Password.');
      return;
    }

    showError('Authenticating credentials...', '#60a5fa');
    loginBtn.disabled = true;

    try {
      const response = await window.adminAPI.login({ identifier, password });
      console.log('🔍 [Login Bridge Response]:', response);

      if (response && response.success && response.user) {
        clearError();
        currentSession = response.user;

        // 1. Populate Lab Header
        if (labTitle) {
          const lab = response.user.assignedLab;
          labTitle.textContent = `${lab.name} (${lab.room})`;
        }

        // 2. Populate Assistant Meta
        if (assistantMeta) {
          assistantMeta.textContent = `Operator: ${response.user.name} · Staff ID: ${response.user.staffId}`;
        }

        // 3. Clear and Render Active Stations
        window.activePCs.clear();
        if (Array.isArray(response.activePcs)) {
          response.activePcs.forEach((pc) => {
            // Safety check: ensure pc is a valid object before accessing properties
            if (pc && typeof pc === 'object') {
              const pcId = pc.id || pc.socketId;
              if (pcId) window.activePCs.set(pcId, pc);
            }
          });
        }

        loginView.style.display = 'none';
        dashboardView.style.display = 'flex';

        bindSocketListeners();
        renderGrid();
      } else {
        showError(response?.message || 'Invalid server response structure.');
      }
    } catch (err) {
      console.error('[Renderer Auth Error]:', err);
      showError(err.message || 'Authentication service connection error.');
    } finally {
      loginBtn.disabled = false;
    }
  });
}

// Allow pressing "Enter" in the password input to submit
if (passwordInput) {
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      loginBtn?.click();
    }
  });
}

// Logout Reset
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    currentSession = null;
    selectedPcId = null;
    window.activePCs.clear();

    if (passwordInput) passwordInput.value = '';
    closeDrawer();

    dashboardView.style.display = 'none';
    loginView.style.display = 'flex';
  });
}

// ==========================================
// 2. REAL-TIME TELEMETRY LISTENERS
// ==========================================
function bindSocketListeners() {
  if (!window.adminAPI) return;

  // New Student PC Connects
  if (typeof window.adminAPI.onPcConnected === 'function') {
    window.adminAPI.onPcConnected((pc) => {
      const pcId = pc.id || pc.socketId;
      if (!pcId) return;
      window.activePCs.set(pcId, pc);
      renderGrid();
      if (selectedPcId === pcId) updateInspectorDrawer(pc);
    });
  }

  // Live Screen / App / Flag Updates
  if (typeof window.adminAPI.onPcTelemetryUpdate === 'function') {
    window.adminAPI.onPcTelemetryUpdate((data) => {
      const pc = window.activePCs.get(data.id);
      if (pc) {
        pc.status = data.status || pc.status;
        pc.currentApp = data.currentApp || pc.currentApp;
        if (data.logEntry) {
          pc.logs = pc.logs || [];
          pc.logs.unshift(data.logEntry);
        }
        renderGrid();
        if (selectedPcId === data.id) updateInspectorDrawer(pc);
      }
    });
  }

  // Workstation Disconnects
  if (typeof window.adminAPI.onPcDisconnected === 'function') {
    window.adminAPI.onPcDisconnected((data) => {
      window.activePCs.delete(data.id);
      if (selectedPcId === data.id) closeDrawer();
      renderGrid();
    });
  }
}

// ==========================================
// 3. WORKSTATION GRID RENDERING
// ==========================================
function renderGrid() {
  if (!pcGrid) return;
  pcGrid.innerHTML = '';
  if (pcCounter) pcCounter.textContent = window.activePCs.size;

  if (window.activePCs.size === 0) {
    pcGrid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: #888;">
        No active workstation nodes currently transmitting telemetry for this lab station.
      </div>
    `;
    return;
  }

  window.activePCs.forEach((pc, id) => {
    const card = document.createElement('div');
    card.className = `pc-card ${selectedPcId === id ? 'active-selected' : ''}`;

    // Status Indicator Colors
    let color = '#16A34A'; // Normal (Green)
    if (pc.status === 'red') color = '#D97706'; // Warning (Amber)
    if (pc.status === 'dark-red') color = '#DC2626'; // Restricted (Red)

    card.innerHTML = `
      <div class="pc-header">
        <span class="pc-title">${escapeHtml(pc.pcName || `PC-${id}`)}</span>
        <span class="status-dot" style="background-color: ${color}; box-shadow: 0 0 6px ${color};"></span>
      </div>
      <div class="pc-meta">
        <p><strong>${escapeHtml(pc.rollNo || '--')}</strong> · ${escapeHtml(pc.studentName || 'Unassigned')}</p>
        <p>${escapeHtml(pc.course || '--')} ${pc.semester ? `(${escapeHtml(pc.semester)})` : ''}</p>
      </div>
      <div class="pc-app-bar">
        <strong>Active App:</strong> ${escapeHtml(pc.currentApp || 'Desktop')}
      </div>
    `;

    card.addEventListener('click', () => openInspector(id));
    pcGrid.appendChild(card);
  });
}

// ==========================================
// 4. INSPECTOR DRAWER CONTROLS
// ==========================================
function openInspector(pcId) {
  const pc = window.activePCs.get(pcId);
  if (!pc) return;

  selectedPcId = pcId;
  renderGrid();
  updateInspectorDrawer(pc);
  inspectorDrawer?.classList.add('open');
}

function updateInspectorDrawer(pc) {
  if (drawerPcName) drawerPcName.textContent = pc.pcName || 'Workstation';
  if (drawerRollNo) drawerRollNo.textContent = pc.rollNo || '--';
  if (drawerStudentName) drawerStudentName.textContent = pc.studentName || '--';
  if (drawerCourseSem) drawerCourseSem.textContent = `${pc.course || '--'} ${pc.semester ? `(${pc.semester})` : ''}`.trim();
  if (drawerExamTime) drawerExamTime.textContent = pc.examTime || 'Session Active';
  if (drawerCurrentApp) drawerCurrentApp.textContent = pc.currentApp || '--';

  // Status Badge Rendering
  if (drawerStatusBadge) {
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
  }

  // Telemetry Log Feed
  if (logList) {
    logList.innerHTML = '';
    const logs = pc.logs || [];
    if (logs.length === 0) {
      logList.innerHTML = '<div class="log-entry">No events logged for this session.</div>';
    } else {
      logs.forEach((log) => {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.textContent = log;
        logList.appendChild(entry);
      });
    }
  }
}

function closeDrawer() {
  selectedPcId = null;
  inspectorDrawer?.classList.remove('open');
  renderGrid();
}

if (closeDrawerBtn) {
  closeDrawerBtn.addEventListener('click', closeDrawer);
}

// ==========================================
// 5. HELPER UTILITIES
// ==========================================
function showError(message, color = '#ff4d4f') {
  if (!errorDiv) return;
  errorDiv.style.color = color;
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

function clearError() {
  if (!errorDiv) return;
  errorDiv.textContent = '';
  errorDiv.style.display = 'none';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}