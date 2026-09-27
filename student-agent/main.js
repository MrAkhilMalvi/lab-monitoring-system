const io = require('socket.io-client');
const os = require('os');
const { exec } = require('child_process');

// Target server URL (can be provided via environment variable)
const SERVER_URL = process.env.SERVER_URL || 'http://10.36.115.157:3000';

// Restrictive lists for cheating prevention
const BANNED_APPS = ['discord', 'chatgpt', 'whatsapp', 'telegram', 'cheatengine', 'gemini', 'claude', 'copilot'];
const ALLOWED_KEYWORDS = ['exam', 'chrome', 'code', 'vsc', 'cmd', 'powershell', 'terminal'];

let socket;
let trackingInterval = null;

function startTracker(serverAddress = SERVER_URL) {
  console.log(`Connecting Student Agent to: ${serverAddress}...`);

  socket = io(serverAddress, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000
  });

  socket.on('connect', () => {
    console.log('✅ Student Agent Connected with Socket ID:', socket.id);
    socket.emit('student-register', {
      pcName: os.hostname(),
      studentName: 'Student User',
      course: 'B.Tech CS',
      semester: '6th Sem',
      examTime: '09:00 AM - 12:00 PM'
    });

    if (trackingInterval) clearInterval(trackingInterval);
    trackingInterval = setInterval(checkForegroundWindow, 2000);
  });

  socket.on('disconnect', () => {
    console.warn('⚠️ Disconnected from Monitoring Server. Waiting to reconnect...');
    if (trackingInterval) clearInterval(trackingInterval);
  });

  socket.on('connect_error', (err) => {
    console.error('❌ Student Connection Error:', err.message);
  });
}

function checkForegroundWindow() {
  if (!socket || !socket.connected) return;

  // PowerShell Win32 API Call to inspect current active foreground window title
  const psCmd = `powershell -NoProfile -NonInteractive -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 { [DllImport(\\\"user32.dll\\\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\\\"user32.dll\\\", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount); }'; $hwnd = [Win32]::GetForegroundWindow(); $title = New-Object System.Text.StringBuilder 256; [Win32]::GetWindowText($hwnd, $title, 256) | Out-Null; $title.ToString()"`;

  exec(psCmd, (err, stdout) => {
    if (err || !stdout) return;

    const windowTitle = stdout.trim();
    let status = 'green';
    const lowerTitle = windowTitle.toLowerCase();

    // Critical Flagging: Check for Banned Applications
    for (const appName of BANNED_APPS) {
      if (lowerTitle.includes(appName)) {
        status = 'dark-red';
        break;
      }
    }

    // Moderate Flagging: Check if Active Window is Outside Allowed Tools
    if (status !== 'dark-red') {
      const isAllowed = ALLOWED_KEYWORDS.some(keyword => lowerTitle.includes(keyword));
      if (!isAllowed && windowTitle.length > 0) {
        status = 'red';
      }
    }

    socket.emit('student-telemetry', {
      currentApp: windowTitle || 'Desktop Environment',
      status: status
    });
  });
}

if (require.main === module) {
  startTracker();
}

module.exports = { startTracker };