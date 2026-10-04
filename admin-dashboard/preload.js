const { contextBridge } = require('electron');
const io = require('socket.io-client');

let serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
let socket = null;

// Registry of persistent event callbacks across socket reconnects
const eventListeners = {
  pcConnected: null,
  pcTelemetryUpdate: null,
  pcDisconnected: null,
};

function initializeSocket(targetUrl) {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  serverUrl = targetUrl;
  socket = io(serverUrl, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 7000,
  });

  socket.on('connect', () => {
    console.log('✅ Admin Socket Connected to:', serverUrl);
  });

  socket.on('connect_error', (err) => {
    console.error('❌ Socket Connection Error:', err.message);
  });

  // Re-attach active listeners if socket re-initialized
  if (eventListeners.pcConnected) {
    socket.on('pc-connected', eventListeners.pcConnected);
  }
  if (eventListeners.pcTelemetryUpdate) {
    socket.on('pc-telemetry-update', eventListeners.pcTelemetryUpdate);
  }
  if (eventListeners.pcDisconnected) {
    socket.on('pc-disconnected', eventListeners.pcDisconnected);
  }
}

// Initial connection
initializeSocket(serverUrl);

contextBridge.exposeInMainWorld('adminAPI', {
  setServerAddress: (newIp) => {
    const formattedUrl = newIp.startsWith('http') ? newIp : `http://${newIp}:3000`;
    initializeSocket(formattedUrl);
  },

  isConnected: () => Boolean(socket && socket.connected),

  // Authenticate lab assistant via PostgreSQL credentials
  login: (credentials) => {
    return new Promise((resolve, reject) => {
      if (!socket) {
        return reject(new Error('Socket client is not initialized.'));
      }

      // Format payload (handles object or fallback string)
      const payload = typeof credentials === 'string'
        ? { identifier: credentials, password: '' }
        : {
            identifier: credentials?.identifier?.trim(),
            password: credentials?.password || '',
          };

      if (!payload.identifier || !payload.password) {
        return reject(new Error('Identifier and password are required.'));
      }

      const timeoutTimer = setTimeout(() => {
        reject(new Error('Server communication timeout. Check server status and network IP.'));
      }, 7000);

      const performEmit = () => {
        socket.emit('admin-login', payload, (response) => {
          clearTimeout(timeoutTimer);
          if (!response) {
            return reject(new Error('Empty response received from authentication service.'));
          }
          resolve(response);
        });
      };

      // Connect if disconnected, then emit
      if (!socket.connected) {
        socket.connect();
        socket.once('connect', () => performEmit());
      } else {
        performEmit();
      }
    });
  },

  // Leave active lab room and clear telemetry
  logout: () => {
    if (socket && socket.connected) {
      socket.emit('admin-logout');
    }
  },

  // Workstation Telemetry Listeners
  onPcConnected: (callback) => {
    eventListeners.pcConnected = callback;
    if (!socket) return;
    socket.off('pc-connected');
    socket.on('pc-connected', (data) => callback(data));
  },

  onPcTelemetryUpdate: (callback) => {
    eventListeners.pcTelemetryUpdate = callback;
    if (!socket) return;
    socket.off('pc-telemetry-update');
    socket.on('pc-telemetry-update', (data) => callback(data));
  },

  onPcDisconnected: (callback) => {
    eventListeners.pcDisconnected = callback;
    if (!socket) return;
    socket.off('pc-disconnected');
    socket.on('pc-disconnected', (data) => callback(data));
  },
});