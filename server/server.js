const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const activePCs = new Map();

function createStudentPayload(socketId, studentData = {}, data = {}) {
  return {
    id: socketId,
    socketId: socketId,
    pcName: studentData.pcName || `PC-${socketId.substring(0, 5)}`,
    studentName: studentData.studentName || 'Student User',
    course: studentData.course || 'B.Tech CS',
    semester: studentData.semester || '6th Sem',
    examTime: studentData.examTime || '09:00 AM - 12:00 PM',
    status: data.status || 'green',
    currentApp: data.currentApp || 'Exam Window Active',
    logs: []
  };
}

// Function to helper output the local network IPv4 address
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id} from IP: ${socket.handshake.address}`);

  // Admin Connect / Verification by Lab ID
  socket.on('admin-login', (payload = {}, callback) => {
    const { labId = 'LAB-101' } = payload;
    socket.join('admins');
    console.log(`[Admin Connected] ID: ${socket.id} assigned to ${labId}`);

    if (typeof callback === 'function') {
      callback({
        success: true,
        message: `Connected to ${labId}`,
        activePcs: Array.from(activePCs.values())
      });
    }
  });

  // Student Registration
  socket.on('student-register', (studentData = {}) => {
    console.log(`[Student Registered]: ${studentData.pcName || socket.id}`);
    const pcData = createStudentPayload(socket.id, studentData);
    activePCs.set(socket.id, pcData);

    io.to('admins').emit('pc-connected', pcData);
  });

  // Telemetry Stream
  socket.on('student-telemetry', (data = {}) => {
    if (!activePCs.has(socket.id)) {
      const autoPcData = createStudentPayload(socket.id, {}, data);
      activePCs.set(socket.id, autoPcData);
      io.to('admins').emit('pc-connected', autoPcData);
    }

    const pc = activePCs.get(socket.id);
    pc.currentApp = data.currentApp || 'Desktop Environment';
    pc.status = data.status || 'green';

    const logEntry = `[${new Date().toLocaleTimeString()}] App: ${pc.currentApp}`;
    pc.logs.unshift(logEntry);
    if (pc.logs.length > 50) pc.logs.pop();

    console.log(`[Telemetry] ${pc.pcName}: ${pc.currentApp} (${pc.status})`);

    io.to('admins').emit('pc-telemetry-update', {
      id: socket.id,
      status: pc.status,
      currentApp: pc.currentApp,
      logEntry: logEntry
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    if (activePCs.has(socket.id)) {
      activePCs.delete(socket.id);
      io.to('admins').emit('pc-disconnected', { id: socket.id });
    }
  });
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Bind to all local interfaces to receive remote connections

server.listen(PORT, HOST, () => {
  const localIP = getLocalIPAddress();
  console.log(`🚀 Central WebSocket Server running!`);
  console.log(`📍 Local access: http://localhost:${PORT}`);
  console.log(`🌐 Network access for Client PCs: http://${localIP}:${PORT}`);
});