const { contextBridge } = require('electron');
const io = require('socket.io-client');

let serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
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

  socket.on('connect', () => console.log('✅ Admin Socket Connected to', serverUrl));
  socket.on('connect_error', (err) => console.error('❌ Socket Error:', err.message));
}

initializeSocket(serverUrl);

contextBridge.exposeInMainWorld('adminAPI', {
  setServerAddress: (newIp) => {
    const formattedUrl = newIp.startsWith('http') ? newIp : `http://${newIp}:3000`;
    initializeSocket(formattedUrl);
  },

  isConnected: () => socket && socket.connected,

  login: (labId) => {
    return new Promise((resolve, reject) => {
      if (!socket.connected) socket.connect();

      const timer = setTimeout(() => {
        reject(new Error('Server communication timeout. Check IP address and port 3000 status.'));
      }, 5000);

      socket.emit('admin-login', { labId }, (response) => {
        clearTimeout(timer);
        response ? resolve(response) : reject(new Error('Empty response received from server.'));
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