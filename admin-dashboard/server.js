require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const activeWorkstations = new Map();

async function authenticateAssistant(identifier, password, clientIp) {
  if (!identifier || !password) {
    return { status: 400, response: { success: false, message: 'Email/Staff ID and Password are required.' } };
  }

  const cleanIdentifier = String(identifier).trim();
  const cleanPassword = String(password).trim();

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
        COALESCE(l.lab_name, 'Lab Station') AS lab_name,
        COALESCE(l.room_number, 'Room 101') AS room_number,
        COALESCE(l.capacity, 40) AS capacity
      FROM lab_assistants la
      LEFT JOIN labs l ON la.lab_id = l.lab_id
      WHERE LOWER(la.email) = LOWER($1) OR UPPER(la.staff_id) = UPPER($1)
      LIMIT 1;
    `;
    const result = await client.query(query, [cleanIdentifier]);

    if (result.rows.length === 0) {
      console.warn(`❌ [Auth]: No user found matching identifier: "${cleanIdentifier}"`);
      return { status: 401, response: { success: false, message: 'Invalid credentials provided.' } };
    }

    const user = result.rows[0];

    // 1. Check account active status
    if (!user.is_active) {
      return { status: 403, response: { success: false, message: 'Account is deactivated. Contact admin.' } };
    }

    // 2. Check lockout expiration
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const lockExpiry = new Date(user.locked_until).toLocaleTimeString();
      console.warn(`🔒 [Auth]: User "${user.staff_id}" is locked out until ${lockExpiry}`);
      return { 
        status: 423, 
        response: { success: false, message: `Account locked due to 5 failed attempts. Unlocks at ${lockExpiry}.` } 
      };
    }

    // 3. Password Verification with strict trimming
    const storedHash = (user.password_hash || '').trim();
    let isPasswordValid = false;

    if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
      isPasswordValid = await bcrypt.compare(cleanPassword, storedHash);
    } else {
      // Plaintext fallback (if manually inserted without hash)
      isPasswordValid = (cleanPassword === storedHash);
      if (isPasswordValid) {
        const freshHash = await bcrypt.hash(cleanPassword, 10);
        await client.query(`UPDATE lab_assistants SET password_hash = $1 WHERE user_id = $2`, [freshHash, user.user_id]);
      }
    }

    console.log(`🔑 [Auth Debug] Checking user: ${user.staff_id} | Password Match: ${isPasswordValid}`);

    // 4. Handle wrong password
    if (!isPasswordValid) {
      const nextAttempts = (user.failed_login_attempts || 0) + 1;
      const lockSql = nextAttempts >= 5 ? ", locked_until = NOW() + INTERVAL '15 minutes'" : '';
      
      await client.query(
        `UPDATE lab_assistants SET failed_login_attempts = $1 ${lockSql} WHERE user_id = $2`,
        [nextAttempts, user.user_id]
      );

      return { 
        status: 401, 
        response: { 
          success: false, 
          message: nextAttempts >= 5 
            ? 'Account locked for 15 minutes due to 5 failed attempts.' 
            : `Invalid password. Attempt ${nextAttempts} of 5.` 
        } 
      };
    }

    // 5. Successful Login: Clear all lockouts and failed attempts
    await client.query(`
      UPDATE lab_assistants 
      SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(), last_login_ip = $1
      WHERE user_id = $2
    `, [clientIp || '127.0.0.1', user.user_id]);

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

    console.log(`✅ [Auth Success]: Assistant "${formattedUser.name}" logged in successfully.`);

    return {
      status: 200,
      response: {
        success: true,
        user: formattedUser
      }
    };
  } finally {
    client.release();
  }
}

// Socket handlers
io.on('connection', (socket) => {
  const clientIp = socket.handshake.address;

  socket.on('admin-login', async (credentials, ack = () => {}) => {
    try {
      const { identifier, password } = credentials || {};
      const authResult = await authenticateAssistant(identifier, password, clientIp);

      if (!authResult.response.success) {
        return ack(authResult.response);
      }

      const user = authResult.response.user;
      const labRoom = `lab_${user.assignedLab.id}`;

      socket.join(labRoom);
      socket.data.assistantUser = user;
      socket.data.labRoom = labRoom;

      const currentLabPcs = [];
      for (const workstation of activeWorkstations.values()) {
        if (Number(workstation.labId) === Number(user.assignedLab.id)) {
          currentLabPcs.push(workstation);
        }
      }

      return ack({
        success: true,
        user: user,
        activePcs: currentLabPcs
      });
    } catch (err) {
      console.error('Socket admin-login error:', err);
      return ack({ success: false, message: 'Internal server database error.' });
    }
  });

  socket.on('disconnect', () => {
    if (socket.data.isStudentNode) {
      const pc = activeWorkstations.get(socket.id);
      if (pc) {
        io.to(`lab_${pc.labId}`).emit('pc-disconnected', { id: socket.id });
        activeWorkstations.delete(socket.id);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Sentinel Master Server running on http://localhost:${PORT}`);
});