// ============================================================
// MemoryKeep ENGRAM — Active Stream & Token Governance (§5)
// Ephemeral session buffer with token budget enforcement
// ============================================================
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class ActiveStream {
    constructor() {
        this.sessions = new Map();
    }

    // ── Create a new session ──
    async create(userId = 'anonymous') {
        const id = uuidv4();
        const session = {
            id,
            userId,
            messages: [],
            tokenCount: 0,
            createdAt: new Date()
        };

        await db.query(
            'INSERT INTO sessions (id, user_id, stream_buffer, token_count, status) VALUES (?, ?, ?, ?, ?)',
            [id, userId, JSON.stringify([]), 0, 'active']
        );

        this.sessions.set(id, session);
        return session;
    }

    // ── Get or create session ──
    async getOrCreate(sessionId, userId = 'anonymous') {
        if (sessionId && this.sessions.has(sessionId)) {
            return this.sessions.get(sessionId);
        }

        if (sessionId) {
            const [rows] = await db.query(
                'SELECT * FROM sessions WHERE id = ? AND status = ?',
                [sessionId, 'active']
            );
            if (rows.length > 0) {
                const row = rows[0];
                const session = {
                    id: row.id,
                    userId: row.user_id,
                    messages: typeof row.stream_buffer === 'string'
                        ? JSON.parse(row.stream_buffer)
                        : (row.stream_buffer || []),
                    tokenCount: row.token_count,
                    createdAt: row.started_at
                };
                this.sessions.set(row.id, session);
                return session;
            }
        }

        return this.create(userId);
    }

    // ── Add message to stream ──
    async addMessage(sessionId, role, content) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;

        const tokenEstimate = Math.ceil(content.length / 4);
        const message = {
            role,
            content,
            tokens: tokenEstimate,
            timestamp: new Date().toISOString()
        };

        session.messages.push(message);
        session.tokenCount += tokenEstimate;

        await db.query(
            'UPDATE sessions SET stream_buffer = ?, token_count = ?, last_activity = NOW() WHERE id = ?',
            [JSON.stringify(session.messages), session.tokenCount, sessionId]
        );

        return { message, needsConsolidation: this.checkConsolidationTrigger(session) };
    }

    // ── Check if consolidation needed ──
    checkConsolidationTrigger(session) {
        const cap = parseInt(process.env.ENGRAM_APP_TOKEN_CAP) || 100000;
        const threshold = parseFloat(process.env.ENGRAM_CONSOLIDATION_THRESHOLD) || 0.85;
        return session.tokenCount >= (cap * threshold);
    }

    // ── Get stream content for context ──
    getStreamContent(sessionId, maxTokens = 4000) {
        const session = this.sessions.get(sessionId);
        if (!session || session.messages.length === 0) return '';

        const messages = [];
        let tokens = 0;
        for (let i = session.messages.length - 1; i >= 0; i--) {
            const msg = session.messages[i];
            if (tokens + msg.tokens > maxTokens) break;
            messages.unshift(msg);
            tokens += msg.tokens;
        }

        return messages.map(m => `${m.role}: ${m.content}`).join('\n');
    }

    // ── Mark session as consolidated ──
    async markConsolidated(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.messages = [];
            session.tokenCount = 0;
        }

        await db.query(
            'UPDATE sessions SET status = ?, stream_buffer = ?, token_count = 0, ended_at = NOW() WHERE id = ?',
            ['consolidated', JSON.stringify([]), sessionId]
        );

        this.sessions.delete(sessionId);
    }

    // ── Get token budget status ──
    getTokenBudget(sessionId, coreTokens = 0, retrievalTokens = 0) {
        const session = this.sessions.get(sessionId);
        const cap = parseInt(process.env.ENGRAM_APP_TOKEN_CAP) || 100000;
        const streamTokens = session ? session.tokenCount : 0;

        return {
            core: coreTokens,
            stream: streamTokens,
            retrieval: retrievalTokens,
            total: coreTokens + streamTokens + retrievalTokens,
            cap,
            remaining: cap - (coreTokens + streamTokens + retrievalTokens),
            utilizationPercent: ((coreTokens + streamTokens + retrievalTokens) / cap * 100).toFixed(1)
        };
    }
}

module.exports = new ActiveStream();
