const io = require('socket.io-client');
const os = require('os');
const { exec } = require('child_process');

// Replace this with the IPv4 address of the PC hosting server.js
// Example: 'http://192.168.1.15:3000'
const SERVER_URL = process.env.SERVER_URL || 'http://10.54.67.156:3000';

const BANNED_APPS = ['discord', 'chatgpt', 'whatsapp', 'telegram', 'cheatengine',  'gemini'];
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

    // Prevent duplicated timers if client disconnects and reconnects
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

  const psCmd = `powershell -NoProfile -NonInteractive -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 { [DllImport(\\\"user32.dll\\\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\\\"user32.dll\\\", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount); }'; $hwnd = [Win32]::GetForegroundWindow(); $title = New-Object System.Text.StringBuilder 256; [Win32]::GetWindowText($hwnd, $title, 256) | Out-Null; $title.ToString()"`;

  exec(psCmd, (err, stdout) => {
    if (err || !stdout) return;

    const windowTitle = stdout.trim();
    let status = 'green';
    const lowerTitle = windowTitle.toLowerCase();

    for (const appName of BANNED_APPS) {
      if (lowerTitle.includes(appName)) {
        status = 'dark-red';
        break;
      }
    }

    if (status !== 'dark-red' && !lowerTitle.includes('exam') && !lowerTitle.includes('chrome')) {
      status = 'red';
    }

    socket.emit('student-telemetry', {
      currentApp: windowTitle || 'Desktop Environment',
      status: status
    });
  });
}

// Automatically start tracking when running directly
if (require.main === module) {
  startTracker();
}

module.exports = { startTracker };