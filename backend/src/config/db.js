// Shared MySQL connection pool.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'pasarkita',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: ['DATE'], // DATE columns come back as 'YYYY-MM-DD' (no time-zone shifts)
  decimalNumbers: true,  // DECIMAL columns come back as numbers, not strings
});

module.exports = pool;
