// ============================================================
// MemoryKeep ENGRAM — Memory Graph CRUD (§7)
// Directed typed property graph: nodes and edges
// ============================================================
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class MemoryGraph {
    // ── Create Node ──
    async createNode({ type, label, properties = {}, confidence = 0.5, provenance = {} }) {
        // Check for existing node with same label and type (canonicalization)
        const [existing] = await db.query(
            'SELECT id, confidence, mention_count FROM memory_nodes WHERE label = ? AND type = ?',
            [label, type]
        );

        if (existing.length > 0) {
            // Reinforce existing node
            const node = existing[0];
            const newConfidence = Math.min(1.0, node.confidence * 1.0 + 0.05);
            await db.query(
                'UPDATE memory_nodes SET confidence = ?, mention_count = mention_count + 1, last_accessed = NOW() WHERE id = ?',
                [newConfidence, node.id]
            );
            return { id: node.id, updated: true, confidence: newConfidence };
        }

        const id = uuidv4();
        await db.query(
            `INSERT INTO memory_nodes (id, type, label, properties, confidence, provenance, created_at, valid_from)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [id, type, label, JSON.stringify(properties), confidence, JSON.stringify(provenance)]
        );

        return { id, updated: false, confidence };
    }

    // ── Create Edge ──
    async createEdge({ sourceId, targetId, relationshipType, weight = 0.5, confidence = 0.5, provenance = {} }) {
        // Check for existing edge
        const [existing] = await db.query(
            'SELECT id, weight, confidence FROM memory_edges WHERE source_id = ? AND target_id = ? AND relationship_type = ?',
            [sourceId, targetId, relationshipType]
        );

        if (existing.length > 0) {
            const edge = existing[0];
            const newWeight = Math.min(1.0, edge.weight * 1.0 + 0.05);
            const newConf = Math.min(1.0, edge.confidence * 1.0 + 0.03);
            await db.query(
                'UPDATE memory_edges SET weight = ?, confidence = ? WHERE id = ?',
                [newWeight, newConf, edge.id]
            );
            return { id: edge.id, updated: true };
        }

        const id = uuidv4();
        await db.query(
            `INSERT INTO memory_edges (id, source_id, target_id, relationship_type, weight, confidence, provenance, created_at, valid_from)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [id, sourceId, targetId, relationshipType, weight, confidence, JSON.stringify(provenance)]
        );

        return { id, updated: false };
    }

    // ── Get Node by ID ──
    async getNode(id) {
        const [rows] = await db.query('SELECT * FROM memory_nodes WHERE id = ?', [id]);
        if (rows.length === 0) return null;
        await db.query('UPDATE memory_nodes SET last_accessed = NOW() WHERE id = ?', [id]);
        return this._parseNode(rows[0]);
    }

    // ── Find Nodes by Label (LIKE search) ──
    async findNodes(searchTerm, limit = 10) {
        // Split search term into words for better matching
        const words = searchTerm.trim().split(/\s+/).filter(w => w.length > 1);

        if (words.length === 0) {
            const [rows] = await db.query(
                'SELECT * FROM memory_nodes WHERE confidence >= ? ORDER BY confidence DESC LIMIT ?',
                [parseFloat(process.env.ENGRAM_MIN_CONFIDENCE) || 0.1, limit]
            );
            return rows.map(r => this._parseNode(r));
        }

        // Build a LIKE query that matches any word
        const conditions = words.map(() => 'label LIKE ?').join(' OR ');
        const params = words.map(w => `%${w}%`);
        params.push(parseFloat(process.env.ENGRAM_MIN_CONFIDENCE) || 0.1);
        params.push(limit);

        const [rows] = await db.query(
            `SELECT *, 1.0 as relevance FROM memory_nodes
             WHERE (${conditions})
             AND confidence >= ?
             ORDER BY confidence DESC
             LIMIT ?`,
            params
        );
        return rows.map(r => this._parseNode(r));
    }

    // ── Find Nodes by Type ──
    async findNodesByType(type, limit = 20) {
        const [rows] = await db.query(
            'SELECT * FROM memory_nodes WHERE type = ? AND confidence >= ? ORDER BY confidence DESC, last_accessed DESC LIMIT ?',
            [type, parseFloat(process.env.ENGRAM_MIN_CONFIDENCE) || 0.1, limit]
        );
        return rows.map(r => this._parseNode(r));
    }

    // ── k-Hop Traversal (§9) ──
    async traverse(startNodeId, maxHops = 3, minConfidence = 0.3) {
        const visited = new Set();
        const result = { nodes: [], edges: [] };
        const self = this;

        async function hop(nodeIds, depth) {
            if (depth > maxHops || nodeIds.length === 0) return;

            const newNodeIds = nodeIds.filter(id => !visited.has(id));
            if (newNodeIds.length === 0) return;

            newNodeIds.forEach(id => visited.add(id));

            // Get edges from these nodes
            const placeholders = newNodeIds.map(() => '?').join(',');
            const [edges] = await db.query(
                `SELECT e.*, sn.label as source_label, tn.label as target_label
                 FROM memory_edges e
                 JOIN memory_nodes sn ON e.source_id = sn.id
                 JOIN memory_nodes tn ON e.target_id = tn.id
                 WHERE (e.source_id IN (${placeholders}) OR e.target_id IN (${placeholders}))
                 AND e.confidence >= ?`,
                [...newNodeIds, ...newNodeIds, minConfidence]
            );

            const nextNodeIds = new Set();
            for (const edge of edges) {
                result.edges.push(edge);
                if (!visited.has(edge.source_id)) nextNodeIds.add(edge.source_id);
                if (!visited.has(edge.target_id)) nextNodeIds.add(edge.target_id);
            }

            // Get the nodes
            if (newNodeIds.length > 0) {
                const nodePlaceholders = newNodeIds.map(() => '?').join(',');
                const [nodes] = await db.query(
                    `SELECT * FROM memory_nodes WHERE id IN (${nodePlaceholders})`,
                    newNodeIds
                );
                result.nodes.push(...nodes.map(n => self._parseNode(n)));
            }

            if (nextNodeIds.size > 0) {
                await hop([...nextNodeIds], depth + 1);
            }
        }

        await hop([startNodeId], 1);
        return result;
    }

    // ── Get Full Graph (for visualization) ──
    async getFullGraph(limit = 200) {
        const [nodes] = await db.query(
            'SELECT * FROM memory_nodes WHERE confidence >= ? ORDER BY confidence DESC, mention_count DESC LIMIT ?',
            [parseFloat(process.env.ENGRAM_MIN_CONFIDENCE) || 0.1, limit]
        );
        const [edges] = await db.query(
            'SELECT e.*, sn.label as source_label, tn.label as target_label FROM memory_edges e JOIN memory_nodes sn ON e.source_id = sn.id JOIN memory_nodes tn ON e.target_id = tn.id WHERE e.confidence >= ? LIMIT ?',
            [parseFloat(process.env.ENGRAM_MIN_CONFIDENCE) || 0.1, limit * 3]
        );

        return {
            nodes: nodes.map(n => this._parseNode(n)),
            edges
        };
    }

    // ── Get Graph Stats ──
    async getStats() {
        const [[nodeCount]] = await db.query('SELECT COUNT(*) as count FROM memory_nodes');
        const [[edgeCount]] = await db.query('SELECT COUNT(*) as count FROM memory_edges');
        const [typeCounts] = await db.query('SELECT type, COUNT(*) as count FROM memory_nodes GROUP BY type ORDER BY count DESC');
        const [[avgConfidence]] = await db.query('SELECT AVG(confidence) as avg FROM memory_nodes');

        return {
            totalNodes: nodeCount.count,
            totalEdges: edgeCount.count,
            nodesByType: typeCounts,
            averageConfidence: avgConfidence.avg ? parseFloat(avgConfidence.avg).toFixed(3) : 0
        };
    }

    // ── Apply Confidence Decay (§10) ──
    async applyDecay() {
        const decayRate = parseFloat(process.env.ENGRAM_CONFIDENCE_DECAY_RATE) || 0.005;
        const minConfidence = parseFloat(process.env.ENGRAM_MIN_CONFIDENCE) || 0.1;

        await db.query(
            `UPDATE memory_nodes
             SET confidence = GREATEST(?, confidence - ?)
             WHERE last_accessed < DATE_SUB(NOW(), INTERVAL 7 DAY)
             AND confidence > ?`,
            [minConfidence, decayRate, minConfidence]
        );

        await db.query(
            `UPDATE memory_edges
             SET confidence = GREATEST(?, confidence - ?)
             WHERE confidence > ?`,
            [minConfidence, decayRate * 0.5, minConfidence]
        );
    }

    // ── Parse node row ──
    _parseNode(row) {
        return {
            ...row,
            properties: typeof row.properties === 'string' ? JSON.parse(row.properties) : (row.properties || {}),
            provenance: typeof row.provenance === 'string' ? JSON.parse(row.provenance) : (row.provenance || {})
        };
    }
}

module.exports = new MemoryGraph();
