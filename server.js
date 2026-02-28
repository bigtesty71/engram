// ============================================================
// MemoryKeep ENGRAM — Express Server
// Graph-Native Memory Architecture for Persistent AI
// ============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// ── Global error handlers (keep process alive for Hostinger) ──
process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION:', err.message);
    console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
    console.error('💥 UNHANDLED REJECTION:', reason);
});

// ── Diagnostics ──
let bootStatus = 'starting';
let bootError = null;

app.get('/ping', (req, res) => {
    res.json({ status: bootStatus, error: bootError, node: process.version, uptime: process.uptime() });
});

// ── Security ──
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://generativelanguage.googleapis.com"]
        }
    }
}));

// ── CORS ──
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, true); // Allow all in development
        }
    },
    credentials: true
}));

// ── Rate Limiting ──
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: { error: 'Too many requests. ENGRAM needs a moment to think.' }
});
app.use('/api/', apiLimiter);

// ── Body Parsing ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static Files ──
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ──
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// ── SPA Fallback for /app ──
app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app', 'index.html'));
});

app.get('/app/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app', 'index.html'));
});

// ── Root serves marketing site ──
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// REBOOT & RECOVERY SEQUENCE (§12)
// ============================================================
async function boot() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║          ENGRAM — MemoryKeep Engine v1.0        ║');
    console.log('║   Graph-Native Memory for Persistent AI         ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');

    try {
        // Step 0: Connect to MySQL & initialize schema
        console.log('⏳ Step 0/4 — Connecting to MySQL database...');
        const db = require('./config/database');
        await db.testConnection();
        await db.initSchema();

        // Step 1: Load Core Cognitive State
        console.log('⏳ Step 1/4 — Loading Core Cognitive State...');
        const coreState = require('./engine/core-state');
        await coreState.load();

        // Step 2: Validate graph integrity
        console.log('⏳ Step 2/4 — Validating graph integrity...');
        const graph = require('./engine/graph');
        const stats = await graph.getStats();
        console.log(`   📊 Graph: ${stats.totalNodes} nodes, ${stats.totalEdges} edges`);

        // Step 3: Apply confidence decay
        console.log('⏳ Step 3/4 — Applying confidence decay...');
        await graph.applyDecay();

        // Step 4: Warm cache
        console.log('⏳ Step 4/4 — Warming subgraph cache...');
        const [lastConsolidation] = await db.query(
            'SELECT consolidated_at FROM consolidation_log ORDER BY consolidated_at DESC LIMIT 1'
        );
        if (lastConsolidation.length > 0) {
            console.log(`   📅 Last consolidation: ${lastConsolidation[0].consolidated_at}`);
        } else {
            console.log('   📅 No previous consolidations found (fresh start)');
        }

        // ── Scheduled tasks ──
        cron.schedule('0 */6 * * *', async () => {
            console.log('⏰ Running scheduled consolidation...');
            const consolidation = require('./engine/consolidation');
            await consolidation.runScheduled();
        });

        cron.schedule('0 0 * * *', async () => {
            console.log('⏰ Running confidence pruning...');
            const confidenceEngine = require('./engine/confidence');
            await confidenceEngine.prune();
        });

        bootStatus = 'healthy';
        console.log('');
        console.log('✅ ENGRAM fully initialized');
        console.log(`   🤖 Model:    ${process.env.ENGRAM_MODEL || 'gemini-2.5-flash'}`);
        console.log(`   🗄️  Database: ${process.env.DB_NAME}@${process.env.DB_HOST}`);
        console.log('');

    } catch (err) {
        bootStatus = 'degraded';
        bootError = err.message;
        console.error('');
        console.error('❌ ENGRAM boot error:', err.message);
        console.error('   Stack:', err.stack);
        console.error('   Server is still running — check /ping for status.');
        console.error('');
        // Do NOT exit — keep server alive
    }
}

// ── Start server FIRST, then boot ──
app.listen(PORT, () => {
    console.log(`✅ Server listening on port ${PORT}`);
    boot();
});

// ── Export for Passenger (Hostinger) ──
module.exports = app;
