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

/**
 * Creates a normalized payload for student instances
 */
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

/**
 * Utility to extract non-internal IPv4 address for local network access
 */
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

  // Admin Verification & Initial Handshake
  socket.on('admin-login', (payload = {}, callback) => {
    const { labId = 'LAB-101' } = payload;
    socket.join('admins');
    console.log(`[Admin Connected] ID: ${socket.id} registered to ${labId}`);

    if (typeof callback === 'function') {
      callback({
        success: true,
        message: `Connected to ${labId}`,
        activePcs: Array.from(activePCs.values())
      });
    }
  });

  // Student Agent Registration
  socket.on('student-register', (studentData = {}) => {
    console.log(`[Student Registered]: ${studentData.pcName || socket.id}`);
    const pcData = createStudentPayload(socket.id, studentData);
    activePCs.set(socket.id, pcData);

    io.to('admins').emit('pc-connected', pcData);
  });

  // Real-Time Telemetry Stream Processing
  socket.on('student-telemetry', (data = {}) => {
    if (!activePCs.has(socket.id)) {
      const autoPcData = createStudentPayload(socket.id, {}, data);
      activePCs.set(socket.id, autoPcData);
      io.to('admins').emit('pc-connected', autoPcData);
    }

    const pc = activePCs.get(socket.id);
    pc.currentApp = data.currentApp || 'Desktop Environment';
    pc.status = data.status || 'green';

    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] App Focus: "${pc.currentApp}" (Status: ${pc.status.toUpperCase()})`;
    
    pc.logs.unshift(logEntry);
    if (pc.logs.length > 100) pc.logs.pop(); // Keep log size manageable

    io.to('admins').emit('pc-telemetry-update', {
      id: socket.id,
      status: pc.status,
      currentApp: pc.currentApp,
      logEntry: logEntry
    });
  });

  // Disconnection Handling
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    if (activePCs.has(socket.id)) {
      activePCs.delete(socket.id);
      io.to('admins').emit('pc-disconnected', { id: socket.id });
    }
  });
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  const localIP = getLocalIPAddress();
  console.log(`====================================================`);
  console.log(`🚀 Central Surveillance Server Active`);
  console.log(`📍 Localhost Address : http://localhost:${PORT}`);
  console.log(`🌐 Subnet Network IP : http://${localIP}:${PORT}`);
  console.log(`====================================================`);
});