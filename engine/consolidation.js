// ============================================================
// MemoryKeep ENGRAM — Consolidation & Pattern Engine (§8)
// Stream → summary → graph updates
// ============================================================
const db = require('../config/database');
const gemini = require('./gemini');
const graph = require('./graph');
const intake = require('./intake');

class ConsolidationEngine {
    // ── Consolidate a session stream into the graph ──
    async consolidate(sessionId, streamContent) {
        console.log(`🔄 Consolidation started — Session: ${sessionId}`);

        const results = {
            nodesCreated: 0,
            nodesUpdated: 0,
            edgesCreated: 0,
            edgesUpdated: 0,
            patternsDetected: 0,
            summary: ''
        };

        try {
            const summary = await gemini.summarizeStream(streamContent);
            results.summary = summary;

            const intakeResults = await intake.process(summary, sessionId);
            results.nodesCreated = intakeResults.nodesCreated;
            results.nodesUpdated = intakeResults.nodesUpdated;
            results.edgesCreated = intakeResults.edgesCreated;
            results.edgesUpdated = intakeResults.edgesUpdated;

            await graph.applyDecay();

            await db.query(
                `INSERT INTO consolidation_log (session_id, summary, nodes_created, nodes_updated, edges_created, edges_updated, patterns_detected)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [sessionId, summary, results.nodesCreated, results.nodesUpdated, results.edgesCreated, results.edgesUpdated, results.patternsDetected]
            );

            console.log(`✅ Consolidation complete — +${results.nodesCreated} nodes, +${results.edgesCreated} edges`);
        } catch (err) {
            console.error('❌ Consolidation error:', err.message);
        }

        return results;
    }

    // ── Run scheduled consolidation on all active sessions ──
    async runScheduled() {
        const [sessions] = await db.query(
            'SELECT id, stream_buffer, token_count FROM sessions WHERE status = ? AND token_count > ?',
            ['active', 500]
        );

        console.log(`⏰ Scheduled consolidation — ${sessions.length} sessions to process`);

        for (const session of sessions) {
            const buffer = typeof session.stream_buffer === 'string'
                ? JSON.parse(session.stream_buffer)
                : (session.stream_buffer || []);

            if (buffer.length > 0) {
                const content = buffer.map(m => `${m.role}: ${m.content}`).join('\n');
                await this.consolidate(session.id, content);
            }
        }
    }
}

module.exports = new ConsolidationEngine();
