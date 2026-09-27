const { contextBridge } = require('electron');
const io = require('socket.io-client');

// Default target server URL (change to your Server PC IP)
let serverUrl = process.env.SERVER_URL || 'http://192.168.1.15:3000';
let socket = null;

function initializeSocket(targetUrl) {
  if (socket) {
    socket.disconnect();
  }

  serverUrl = targetUrl;
  socket = io(serverUrl, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    timeout: 5000
  });

  socket.on('connect', () => console.log('✅ Admin Socket Connected to', serverUrl, 'ID:', socket.id));
  socket.on('connect_error', (err) => console.error('❌ Socket Error:', err.message));
}

// Initialize socket instance on script load
initializeSocket(serverUrl);

contextBridge.exposeInMainWorld('adminAPI', {
  // Config option to switch server IP dynamically from front-end interface
  setServerAddress: (newIp) => {
    const formattedUrl = newIp.startsWith('http') ? newIp : `http://${newIp}:3000`;
    initializeSocket(formattedUrl);
  },

  isConnected: () => socket && socket.connected,

  login: (labId) => {
    return new Promise((resolve, reject) => {
      if (!socket.connected) socket.connect();

      const timer = setTimeout(() => {
        reject(new Error('Server did not respond in time. Check IP address and port 3000 firewall rules.'));
      }, 5000);

      socket.emit('admin-login', { labId }, (response) => {
        clearTimeout(timer);
        response ? resolve(response) : reject(new Error('Empty server response.'));
      });
    });
  },

  onPcConnected: (callback) => {
    if (!socket) return;
    socket.off('pc-connected');
    socket.on('pc-connected', (data) => callback(data));
  },

  onPcTelemetryUpdate: (callback) => {
    if (!socket) return;
    socket.off('pc-telemetry-update');
    socket.on('pc-telemetry-update', (data) => callback(data));
  },

  onPcDisconnected: (callback) => {
    if (!socket) return;
    socket.off('pc-disconnected');
    socket.on('pc-disconnected', (data) => callback(data));
  }
});