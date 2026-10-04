require('dotenv').config();
const io = require('socket.io-client');
const os = require('os');
const { exec } = require('child_process');

// Target server URL (configurable via .env or CLI environment)
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

// Student workstation configuration
const AGENT_CONFIG = {
  labId: parseInt(process.env.LAB_ID || '1', 10),
  pcName: process.env.PC_NAME || os.hostname(),
  rollNo: process.env.STUDENT_ROLL || 'CS-2024-089',
  studentName: process.env.STUDENT_NAME || 'Harsh Sharma',
  course: process.env.STUDENT_COURSE || 'B.Tech CSE',
  semester: process.env.STUDENT_SEM || '6th Sem',
  examTime: process.env.EXAM_TIME || '09:00 AM - 12:00 PM',
};

// Application classification rules
const BANNED_APPS = [
  'discord',
  'chatgpt',
  'whatsapp',
  'telegram',
  'cheatengine',
  'gemini',
  'claude',
  'copilot',
  'stackoverflow',
  'reddit'
];

const ALLOWED_KEYWORDS = [
  'exam',
  'chrome',
  'code',
  'vsc',
  'visual studio',
  'cmd',
  'powershell',
  'terminal',
  'python',
  'idle'
];

let socket = null;
let trackingInterval = null;
let isChecking = false; // Prevents overlapping PowerShell process spawns
let lastReportedApp = '';
let lastReportedStatus = '';

function startTracker(serverAddress = SERVER_URL) {
  console.log(`====================================================`);
  console.log(`📡 Connecting Student Agent to: ${serverAddress}`);
  console.log(`💻 Station: ${AGENT_CONFIG.pcName} | Student: ${AGENT_CONFIG.studentName} (${AGENT_CONFIG.rollNo})`);
  console.log(`🏫 Assigned Lab ID: ${AGENT_CONFIG.labId}`);
  console.log(`====================================================`);

  socket = io(serverAddress, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    timeout: 5000,
  });

  socket.on('connect', () => {
    console.log(`✅ Connected to Central Server. Socket ID: ${socket.id}`);

    // Register station with student details
    socket.emit('student-register', AGENT_CONFIG, (ack) => {
      if (ack && ack.success) {
        console.log('✅ Registration acknowledged by Sentinel Server.');
      }
    });

    // Start polling window telemetry every 2 seconds
    if (trackingInterval) clearInterval(trackingInterval);
    trackingInterval = setInterval(checkForegroundWindow, 2000);
  });

  socket.on('disconnect', (reason) => {
    console.warn(`⚠️ Disconnected from Monitoring Server (${reason}). Waiting to reconnect...`);
    if (trackingInterval) clearInterval(trackingInterval);
  });

  socket.on('connect_error', (err) => {
    console.error('❌ Connection error to server:', err.message);
  });
}

function checkForegroundWindow() {
  if (!socket || !socket.connected) return;
  if (isChecking) return; // Skip tick if previous check is still running

  isChecking = true;

  // Lightweight PowerShell query using user32.dll GetForegroundWindow
  const psCmd = `powershell -NoProfile -NonInteractive -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 { [DllImport(\\\"user32.dll\\\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\\\"user32.dll\\\", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount); }'; $h=[Win32]::GetForegroundWindow(); $b=New-Object System.Text.StringBuilder 256; [Win32]::GetWindowText($h, $b, 256) | Out-Null; $b.ToString()"`;

  exec(psCmd, { timeout: 3000 }, (err, stdout) => {
    isChecking = false;

    if (err) {
      return;
    }

    const windowTitle = (stdout || '').trim();
    const activeApp = windowTitle.length > 0 ? windowTitle : 'Desktop Environment';
    const lowerTitle = activeApp.toLowerCase();

    let status = 'green';

    // 1. Critical Flag: Banned process/app
    for (const appName of BANNED_APPS) {
      if (lowerTitle.includes(appName)) {
        status = 'dark-red';
        break;
      }
    }

    // 2. Moderate Flag: Outside allowed application scope
    if (status !== 'dark-red' && activeApp !== 'Desktop Environment') {
      const isAllowed = ALLOWED_KEYWORDS.some((kw) => lowerTitle.includes(kw));
      if (!isAllowed) {
        status = 'red';
      }
    }

    // Emit telemetry
    socket.emit('student-telemetry', {
      currentApp: activeApp,
      status: status
    });

    // Log transitions in terminal
    if (activeApp !== lastReportedApp || status !== lastReportedStatus) {
      console.log(`[Focus Change] Status: [${status.toUpperCase()}] -> App: "${activeApp}"`);
      lastReportedApp = activeApp;
      lastReportedStatus = status;
    }
  });
}

// Clean process exit
process.on('SIGINT', () => {
  if (trackingInterval) clearInterval(trackingInterval);
  if (socket) socket.disconnect();
  console.log('\n🛑 Student Agent terminated.');
  process.exit(0);
});

if (require.main === module) {
  startTracker();
}

module.exports = { startTracker };