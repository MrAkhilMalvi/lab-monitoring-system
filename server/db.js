require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || '10.83.228.156',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'mydb',
  user: process.env.DB_USER || 'rohan',
  password: process.env.DB_PASSWORD || 'rohan@123',
  max: 20,                         // Maximum active connections in pool
  idleTimeoutMillis: 30000,        // Close idle connections after 30s
  connectionTimeoutMillis: 2000,   // Return an error after 2s if connection cannot be established
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

module.exports = pool;