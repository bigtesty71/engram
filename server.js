// ============================================================
// MemoryKeep ENGRAM — Express Server (Minimal Boot)
// ============================================================
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// ── Global crash handler ──
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED:', reason);
});

// ── Simple diagnostic routes ──
app.get('/ping', (req, res) => {
    res.json({ status: 'alive', port: PORT, node: process.version });
});

// ── Static files ──
app.use(express.static(path.join(__dirname, 'public')));

// ── Root route ──
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Health check ──
app.get('/api/health', async (req, res) => {
    try {
        const db = require('./config/database');
        await db.testConnection();
        res.json({ status: 'healthy', db: 'connected' });
    } catch (err) {
        res.json({ status: 'degraded', error: err.message });
    }
});

// ── Start server (for direct node execution) ──
app.listen(PORT, () => {
    console.log(`ENGRAM listening on port ${PORT}`);
});

// ── Export app for Passenger / Hostinger ──
module.exports = app;
