// ============================================================
// MemoryKeep ENGRAM — Confidence & Trust Modeling (§10)
// Reinforcement, contradiction, correction, temporal decay
// ============================================================
const db = require('../config/database');

class ConfidenceEngine {
    constructor() {
        this.decayRate = parseFloat(process.env.ENGRAM_CONFIDENCE_DECAY_RATE) || 0.005;
        this.minConfidence = parseFloat(process.env.ENGRAM_MIN_CONFIDENCE) || 0.1;
    }

    // ── Reinforce a memory (mentioned again) ──
    async reinforce(nodeId, amount = 0.05) {
        await db.query(
            'UPDATE memory_nodes SET confidence = LEAST(1.0, confidence + ?), mention_count = mention_count + 1, last_accessed = NOW() WHERE id = ?',
            [amount, nodeId]
        );
    }

    // ── Contradict a memory (conflicting info) ──
    async contradict(nodeId, amount = 0.15) {
        await db.query(
            'UPDATE memory_nodes SET confidence = GREATEST(?, confidence - ?), last_accessed = NOW() WHERE id = ?',
            [this.minConfidence, amount, nodeId]
        );
    }

    // ── Explicit correction (user says "actually...") ──
    async correct(nodeId, newProperties = {}) {
        // Read-modify-write for JSON properties
        const [rows] = await db.query('SELECT properties FROM memory_nodes WHERE id = ?', [nodeId]);
        if (rows.length > 0) {
            const existing = typeof rows[0].properties === 'string'
                ? JSON.parse(rows[0].properties)
                : (rows[0].properties || {});
            const merged = { ...existing, ...newProperties };
            await db.query(
                'UPDATE memory_nodes SET properties = ?, confidence = 0.9, last_accessed = NOW() WHERE id = ?',
                [JSON.stringify(merged), nodeId]
            );
        }
    }

    // ── Invalidate a memory (mark as expired) ──
    async invalidate(nodeId) {
        await db.query(
            'UPDATE memory_nodes SET valid_to = NOW(), confidence = ? WHERE id = ?',
            [this.minConfidence, nodeId]
        );
    }

    // ── Get memories below threshold (candidates for pruning) ──
    async getLowConfidence(threshold = 0.2) {
        const [rows] = await db.query(
            'SELECT id, label, type, confidence FROM memory_nodes WHERE confidence <= ? ORDER BY confidence ASC',
            [threshold]
        );
        return rows;
    }

    // ── Prune expired and very low confidence memories ──
    async prune() {
        const [result] = await db.query(
            'DELETE FROM memory_nodes WHERE confidence <= ? AND last_accessed < DATE_SUB(NOW(), INTERVAL 30 DAY)',
            [this.minConfidence]
        );
        if (result.affectedRows > 0) {
            console.log(`🧹 Pruned ${result.affectedRows} low-confidence memories`);
        }
        return result.affectedRows;
    }
}

module.exports = new ConfidenceEngine();
