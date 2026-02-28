// ============================================================
// MemoryKeep ENGRAM — Database Connection (MySQL)
// Hostinger shared MySQL via mysql2 connection pool
// Based on Hostinger's official Node.js + MySQL documentation
// ============================================================
const mysql = require('mysql2');
require('dotenv').config();

let pool;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER || 'u649168233_engram',
            password: process.env.DB_PASS || '',
            database: process.env.DB_NAME || 'u649168233_graph',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            charset: 'utf8mb4',
            timezone: '+00:00'
        });
        console.log(`✅ MySQL pool created — ${process.env.DB_HOST}/${process.env.DB_NAME}`);
    }
    return pool.promise(); // Return promise-based pool for async/await
}

// ── Async query wrapper ──
// Returns [rows] for SELECTs, [{ affectedRows, insertId }] for writes
// This maintains the same interface the engine files expect
async function query(sql, params = []) {
    const p = getPool();

    const trimmed = sql.trim().toUpperCase();
    const isSelect = trimmed.startsWith('SELECT') || trimmed.startsWith('WITH');

    if (isSelect) {
        const [rows] = await p.execute(sql, params);
        return [rows];
    } else {
        const [result] = await p.execute(sql, params);
        return [{ affectedRows: result.affectedRows, insertId: result.insertId }];
    }
}

// ── Initialize schema ──
async function initSchema() {
    const p = getPool();
    const fs = require('fs');
    const path = require('path');
    const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');

    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // MySQL requires executing statements one at a time
        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const stmt of statements) {
            try {
                await p.execute(stmt);
            } catch (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    // Silent — seed data already exists
                } else if (err.code === 'ER_TABLE_EXISTS_ERROR') {
                    // Silent — table already created
                } else {
                    console.error('⚠️  Schema statement error:', err.message);
                    console.error('   Statement:', stmt.substring(0, 100) + '...');
                }
            }
        }
        console.log('📋 Schema initialized');
    }
}

// ── Test connection ──
async function testConnection() {
    const p = getPool();
    const connection = await p.getConnection();
    console.log('✅ MySQL connected successfully');
    connection.release();
}

// ── Graceful shutdown ──
async function close() {
    if (pool) {
        await pool.promise().end();
        pool = null;
        console.log('🔒 MySQL pool closed');
    }
}

module.exports = { query, getPool, initSchema, testConnection, close };
