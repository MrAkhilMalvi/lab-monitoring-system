require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const os = require('os');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// In-memory registry for connected student nodes
const activePCs = new Map();

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

/**
 * Cleans IP addresses for PostgreSQL INET compatibility
 */
function sanitizeIp(ip) {
  if (!ip) return '127.0.0.1';
  let cleaned = String(ip).trim();
  if (cleaned === '::1' || cleaned === '::ffff:127.0.0.1') return '127.0.0.1';
  if (cleaned.startsWith('::ffff:')) return cleaned.replace('::ffff:', '');
  return cleaned;
}

/**
 * Normalizes payload for student PC instances
 */
function createStudentPayload(socketId, studentData = {}, data = {}) {
  return {
    id: socketId,
    socketId: socketId,
    labId: studentData.labId || 1,
    pcName: studentData.pcName || `PC-${socketId.substring(0, 5)}`,
    rollNo: studentData.rollNo || '--',
    studentName: studentData.studentName || 'Student User',
    course: studentData.course || 'B.Tech CS',
    semester: studentData.semester || '6th Sem',
    examTime: studentData.examTime || '09:00 AM - 12:00 PM',
    status: data.status || 'green',
    currentApp: data.currentApp || 'Exam Window Active',
    logs: [`[${new Date().toLocaleTimeString()}] Workstation registered.`]
  };
}

/**
 * Production PostgreSQL Authentication Service
 */
async function authenticateAssistant(identifier, password, rawIp) {
  if (!identifier || !password) {
    return {
      success: false,
      message: 'Email / Staff ID and Password are required.'
    };
  }

  const cleanIdentifier = String(identifier).trim();
  const cleanPassword = String(password).trim();
  const clientIp = sanitizeIp(rawIp);

  const client = await pool.connect();
  try {
    const query = `
      SELECT 
        la.user_id,
        la.lab_id,
        la.staff_id,
        la.email,
        la.full_name,
        la.password_hash,
        la.is_active,
        la.failed_login_attempts,
        la.locked_until,
        COALESCE(l.lab_name, 'Main Station') AS lab_name,
        COALESCE(l.room_number, 'Room 101') AS room_number,
        COALESCE(l.capacity, 40) AS capacity
      FROM lab_assistants la
      LEFT JOIN labs l ON la.lab_id = l.lab_id
      WHERE LOWER(la.email) = LOWER($1) OR UPPER(la.staff_id) = UPPER($1)
      LIMIT 1;
    `;
    const result = await client.query(query, [cleanIdentifier]);

    if (result.rows.length === 0) {
      console.warn(`❌ [Auth]: User not found matching identifier: "${cleanIdentifier}"`);
      return { success: false, message: 'Invalid credentials provided.' };
    }

    const user = result.rows[0];

    // 1. Account status verification
    if (!user.is_active) {
      return { success: false, message: 'This account has been deactivated. Contact Admin.' };
    }

    // 2. Lockout check
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const lockExpiry = new Date(user.locked_until).toLocaleTimeString();
      console.warn(`🔒 [Auth]: User "${user.staff_id}" is locked out until ${lockExpiry}`);
      return { 
        success: false, 
        message: `Account temporarily locked due to failed attempts. Try again after ${lockExpiry}.` 
      };
    }

    // 3. Resilient Password Verification (Handles Bcrypt & Plaintext Fallback)
    const storedHash = String(user.password_hash || '').trim();
    let isPasswordValid = false;

    if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
      isPasswordValid = await bcrypt.compare(cleanPassword, storedHash);
    } else {
      // Plaintext fallback (if manually written into DB without hash)
      if (cleanPassword === storedHash) {
        isPasswordValid = true;
        // Auto-upgrade plain text password to a secure bcrypt hash in DB
        const autoHashed = await bcrypt.hash(cleanPassword, 10);
        await client.query(`UPDATE lab_assistants SET password_hash = $1 WHERE user_id = $2`, [autoHashed, user.user_id]);
        console.log(`🔐 [Security]: Upgraded plaintext password to Bcrypt for ${user.staff_id}`);
      }
    }

    console.log(`🔑 [Auth Check]: Staff "${user.staff_id}" | Password Match: ${isPasswordValid}`);

    // 4. Handle invalid password
    if (!isPasswordValid) {
      const nextAttempts = (user.failed_login_attempts || 0) + 1;
      const lockClause = nextAttempts >= 5 ? ", locked_until = NOW() + INTERVAL '15 minutes'" : '';
      
      await client.query(
        `UPDATE lab_assistants SET failed_login_attempts = $1 ${lockClause} WHERE user_id = $2`,
        [nextAttempts, user.user_id]
      );

      return { 
        success: false, 
        message: nextAttempts >= 5 
          ? 'Account locked for 15 minutes due to 5 failed attempts.' 
          : `Invalid password. Attempt ${nextAttempts} of 5.` 
      };
    }

    // 5. Successful Login: Clear all lockouts and failed attempts
    await client.query(`
      UPDATE lab_assistants 
      SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(), last_login_ip = $1
      WHERE user_id = $2
    `, [clientIp, user.user_id]);

    const formattedUser = {
      userId: user.user_id,
      staffId: user.staff_id,
      email: user.email,
      name: user.full_name || user.staff_id,
      assignedLab: {
        id: user.lab_id || 1,
        name: user.lab_name,
        room: user.room_number,
        capacity: user.capacity
      }
    };

    console.log(`✅ [Auth Success]: Operator "${formattedUser.name}" authenticated.`);

    return {
      success: true,
      message: 'Authentication successful',
      user: formattedUser
    };
  } finally {
    client.release();
  }
}

// ========================================================
// HTTP REST ENDPOINTS
// ========================================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const result = await authenticateAssistant(identifier, password, clientIp);
    return res.status(result.success ? 200 : 401).json(result);
  } catch (err) {
    console.error('REST Login Error:', err);
    return res.status(500).json({ success: false, message: 'Server database error.' });
  }
});

app.get('/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', dbConnected: true, serverTime: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', dbConnected: false, error: err.message });
  }
});

// ========================================================
// REAL-TIME SOCKET.IO ENGINE
// ========================================================
io.on('connection', (socket) => {
  const clientIp = socket.handshake.address;
  console.log(`[Socket Connected] ID: ${socket.id} from IP: ${clientIp}`);

  // 1. Lab Assistant Login via Socket
  socket.on('admin-login', async (credentials, ack) => {
    const safeAck = typeof ack === 'function' ? ack : () => {};

    try {
      const payload = typeof credentials === 'object' && credentials !== null ? credentials : {};
      const { identifier, password } = payload;

      const authResult = await authenticateAssistant(identifier, password, clientIp);

      if (!authResult.success) {
        return safeAck(authResult);
      }

      socket.join('admins');
      socket.data.assistantUser = authResult.user;

      return safeAck({
        success: true,
        message: 'Authentication successful',
        user: authResult.user,
        activePcs: Array.from(activePCs.values())
      });
    } catch (err) {
      console.error('[Socket Auth Database Error]:', err);
      return safeAck({
        success: false,
        message: 'Internal database authentication failure.'
      });
    }
  });

  // 2. Lab Assistant Logout
  socket.on('admin-logout', () => {
    socket.leave('admins');
    delete socket.data.assistantUser;
    console.log(`[Admin Logged Out] Socket ${socket.id}`);
  });

  // 3. Student Agent Workstation Registration
  socket.on('student-register', (studentData = {}, ack) => {
    const safeAck = typeof ack === 'function' ? ack : () => {};
    console.log(`[Student Registered]: ${studentData.pcName || socket.id}`);
    
    const pcData = createStudentPayload(socket.id, studentData);
    activePCs.set(socket.id, pcData);

    io.to('admins').emit('pc-connected', pcData);
    safeAck({ success: true });
  });

  // 4. Real-Time Student Telemetry Processing
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
    
    pc.logs = pc.logs || [];
    pc.logs.unshift(logEntry);
    if (pc.logs.length > 100) pc.logs.pop();

    io.to('admins').emit('pc-telemetry-update', {
      id: socket.id,
      status: pc.status,
      currentApp: pc.currentApp,
      logEntry: logEntry
    });
  });

  // 5. Disconnect Handler
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    if (activePCs.has(socket.id)) {
      activePCs.delete(socket.id);
      io.to('admins').emit('pc-disconnected', { id: socket.id });
    }
  });
});

// Server Initialization
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  const localIP = getLocalIPAddress();
  console.log(`====================================================`);
  console.log(`🚀 Sentinel Central Surveillance Server Active`);
  console.log(`📍 Localhost Address : http://localhost:${PORT}`);
  console.log(`🌐 Subnet Network IP : http://${localIP}:${PORT}`);
  console.log(`🔌 Database Pool     : Connected via db.js`);
  console.log(`====================================================`);
});