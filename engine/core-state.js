// ============================================================
// MemoryKeep ENGRAM — Core Cognitive State (§4)
// Always-loaded region: identity, directives, constraints
// ============================================================
const db = require('../config/database');

class CoreState {
    constructor() {
        this.identity = null;
        this.directives = null;
        this.constraints = null;
        this.versionMeta = null;
        this.loaded = false;
    }

    // ── Load all core state from DB ──
    async load() {
        const [rows] = await db.query('SELECT state_key, state_value FROM core_state');
        for (const row of rows) {
            const val = typeof row.state_value === 'string'
                ? JSON.parse(row.state_value)
                : row.state_value;

            switch (row.state_key) {
                case 'identity':
                    this.identity = val;
                    break;
                case 'directives':
                    this.directives = val;
                    break;
                case 'constraints':
                    this.constraints = val;
                    break;
                case 'version_meta':
                    this.versionMeta = val;
                    break;
            }
        }
        this.loaded = true;
        console.log(`🧠 Core State loaded — ${this.identity?.name} v${this.versionMeta?.engine_version}`);
        return this;
    }

    // ── Update a specific state key ──
    async update(key, value) {
        await db.query(
            'UPDATE core_state SET state_value = ?, version = version + 1, updated_at = NOW() WHERE state_key = ?',
            [JSON.stringify(value), key]
        );
        this[this._keyToProperty(key)] = value;
    }

    // ── Get estimated token count for core state ──
    getTokenEstimate() {
        const text = JSON.stringify({
            identity: this.identity,
            directives: this.directives,
            constraints: this.constraints
        });
        // Rough estimate: 1 token ≈ 4 characters
        return Math.ceil(text.length / 4);
    }

    _keyToProperty(key) {
        const map = {
            'identity': 'identity',
            'directives': 'directives',
            'constraints': 'constraints',
            'version_meta': 'versionMeta'
        };
        return map[key] || key;
    }
}

module.exports = new CoreState();
