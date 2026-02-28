// ============================================================
// MemoryKeep ENGRAM — API Routes
// ============================================================
const express = require('express');
const router = express.Router();

const coreState = require('../engine/core-state');
const stream = require('../engine/stream');
const intake = require('../engine/intake');
const retrieval = require('../engine/retrieval');
const consolidation = require('../engine/consolidation');
const confidence = require('../engine/confidence');
const graph = require('../engine/graph');
const gemini = require('../engine/gemini');

// ── POST /api/chat — Main chat endpoint ──
router.post('/chat', async (req, res) => {
    try {
        const { message, sessionId, userId } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // 1. Get or create session
        const session = await stream.getOrCreate(sessionId, userId);

        // 2. Add user message to stream
        await stream.addMessage(session.id, 'user', message);

        // 3. Retrieve relevant memories
        const memories = await retrieval.retrieve(message);

        // 4. Build system prompt with core state
        const systemPrompt = gemini.buildSystemPrompt(
            coreState.identity,
            coreState.directives,
            coreState.constraints
        );

        // 5. Get recent stream context
        const streamContext = stream.getStreamContent(session.id, 3000);

        // 6. Combine memory context + stream context
        let fullContext = '';
        if (memories.context) {
            fullContext += memories.context + '\n\n';
        }
        if (streamContext) {
            fullContext += '=== Recent Conversation ===\n' + streamContext;
        }

        // 7. Generate response
        const response = await gemini.generateResponse(systemPrompt, message, fullContext);

        // 8. Add response to stream
        const { needsConsolidation } = await stream.addMessage(session.id, 'assistant', response);

        // 9. Run intake in background (don't block response)
        intake.process(message, session.id).catch(err =>
            console.error('Background intake error:', err.message)
        );

        // 10. Trigger consolidation if needed
        if (needsConsolidation) {
            const content = stream.getStreamContent(session.id);
            consolidation.consolidate(session.id, content).then(() => {
                stream.markConsolidated(session.id);
            }).catch(err =>
                console.error('Consolidation error:', err.message)
            );
        }

        // 11. Get token budget status
        const tokenBudget = stream.getTokenBudget(
            session.id,
            coreState.getTokenEstimate(),
            memories.context ? Math.ceil(memories.context.length / 4) : 0
        );

        res.json({
            response,
            sessionId: session.id,
            memoryScore: memories.score,
            memoriesUsed: memories.nodes.length,
            tokenBudget: {
                utilization: tokenBudget.utilizationPercent + '%',
                remaining: tokenBudget.remaining
            }
        });
    } catch (err) {
        console.error('Chat error:', err);
        res.status(500).json({ error: 'ENGRAM encountered an error', details: err.message });
    }
});

// ── GET /api/graph — Get memory graph for visualization ──
router.get('/graph', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 200;
        const graphData = await graph.getFullGraph(limit);
        res.json(graphData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/graph/stats — Get graph statistics ──
router.get('/graph/stats', async (req, res) => {
    try {
        const stats = await graph.getStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/graph/search — Search memory graph ──
router.get('/graph/search', async (req, res) => {
    try {
        const { q, type, limit = 20 } = req.query;
        let results;

        if (type) {
            results = await graph.findNodesByType(type, parseInt(limit));
        } else if (q) {
            results = await graph.findNodes(q, parseInt(limit));
        } else {
            return res.status(400).json({ error: 'Query (q) or type parameter required' });
        }

        res.json({ results, count: results.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/consolidate — Trigger manual consolidation ──
router.post('/consolidate', async (req, res) => {
    try {
        await consolidation.runScheduled();
        res.json({ success: true, message: 'Consolidation complete' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/health — Health check ──
router.get('/health', async (req, res) => {
    try {
        const stats = await graph.getStats();
        res.json({
            status: 'healthy',
            engine: 'ENGRAM',
            model: gemini.MODEL_ID,
            version: coreState.versionMeta?.engine_version || '1.0.0',
            graph: stats,
            uptime: process.uptime()
        });
    } catch (err) {
        res.json({
            status: 'degraded',
            error: err.message,
            uptime: process.uptime()
        });
    }
});

// ── POST /api/reset — Reset a session (for testing) ──
router.post('/reset', async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (sessionId) {
            await stream.markConsolidated(sessionId);
        }
        res.json({ success: true, message: 'Session reset' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
