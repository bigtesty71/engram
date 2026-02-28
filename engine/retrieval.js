// ============================================================
// MemoryKeep ENGRAM — Hybrid Retrieval Engine (§9)
// Semantic similarity + structural graph traversal
// Score = α·S + β·W + γ·C + δ·F
// ============================================================
const graph = require('./graph');

// Scoring weights
const ALPHA = 0.3;  // Semantic similarity
const BETA = 0.25;  // Structural weight
const GAMMA = 0.3;  // Confidence
const DELTA = 0.15; // Freshness

class RetrievalEngine {
    // ── Main retrieval: query → ranked memory context ──
    async retrieve(query, maxNodes = 20) {
        // Step 1: Find candidate nodes via full-text search
        const candidates = await graph.findNodes(query, maxNodes * 2);

        if (candidates.length === 0) {
            return { context: '', nodes: [], edges: [], score: 0 };
        }

        // Step 2: Score each candidate
        const scored = candidates.map(node => ({
            ...node,
            score: this._scoreNode(node, query)
        }));

        // Step 3: Sort by score and take top N
        scored.sort((a, b) => b.score - a.score);
        const topNodes = scored.slice(0, maxNodes);

        // Step 4: Traverse graph from top nodes to get related context
        const relatedEdges = [];
        const relatedNodes = new Map();

        for (const node of topNodes.slice(0, 5)) {
            try {
                const subgraph = await graph.traverse(node.id, 2, 0.3);
                for (const n of subgraph.nodes) {
                    if (!relatedNodes.has(n.id)) {
                        relatedNodes.set(n.id, n);
                    }
                }
                relatedEdges.push(...subgraph.edges);
            } catch (err) {
                // Node might not have connections yet
            }
        }

        // Step 5: Build context string for prompt injection
        const context = this._buildContext(topNodes, relatedEdges, [...relatedNodes.values()]);

        return {
            context,
            nodes: topNodes,
            edges: relatedEdges,
            score: topNodes.length > 0 ? topNodes[0].score : 0
        };
    }

    // ── Path Scoring Model (§9) ──
    _scoreNode(node, query) {
        // S: Semantic similarity (approximated by text match relevance)
        const similarity = node.relevance || this._textSimilarity(node.label, query);

        // W: Structural weight (mention count as proxy)
        const weight = Math.min(1.0, (node.mention_count || 1) / 10);

        // C: Confidence
        const confidence = parseFloat(node.confidence) || 0.5;

        // F: Freshness (decay based on age)
        const freshness = this._freshness(node.last_accessed || node.created_at);

        return ALPHA * similarity + BETA * weight + GAMMA * confidence + DELTA * freshness;
    }

    // ── Simple text similarity ──
    _textSimilarity(text1, text2) {
        const words1 = text1.toLowerCase().split(/\s+/);
        const words2 = text2.toLowerCase().split(/\s+/);
        const intersection = words1.filter(w => words2.includes(w));
        const union = new Set([...words1, ...words2]);
        return union.size > 0 ? intersection.length / union.size : 0;
    }

    // ── Freshness score (recent = higher) ──
    _freshness(date) {
        if (!date) return 0.5;
        const now = Date.now();
        const then = new Date(date).getTime();
        const daysSince = (now - then) / (1000 * 60 * 60 * 24);
        return Math.max(0, 1.0 - (daysSince / 365)); // Decays over a year
    }

    // ── Build context string for prompt injection ──
    _buildContext(nodes, edges, relatedNodes) {
        if (nodes.length === 0) return '';

        let context = '=== Known Facts ===\n';

        // Add top nodes
        for (const node of nodes) {
            const props = node.properties && Object.keys(node.properties).length > 0
                ? ` (${Object.entries(node.properties).map(([k, v]) => `${k}: ${v}`).join(', ')})`
                : '';
            context += `- [${node.type}] ${node.label}${props} (confidence: ${parseFloat(node.confidence).toFixed(2)})\n`;
        }

        // Add relationships
        const uniqueEdges = this._dedupeEdges(edges);
        if (uniqueEdges.length > 0) {
            context += '\n=== Relationships ===\n';
            for (const edge of uniqueEdges.slice(0, 15)) {
                context += `- ${edge.source_label} —[${edge.relationship_type}]→ ${edge.target_label}\n`;
            }
        }

        // Add related context
        const extraNodes = relatedNodes.filter(n => !nodes.find(tn => tn.id === n.id));
        if (extraNodes.length > 0) {
            context += '\n=== Related Context ===\n';
            for (const node of extraNodes.slice(0, 10)) {
                context += `- [${node.type}] ${node.label}\n`;
            }
        }

        return context;
    }

    // ── Deduplicate edges ──
    _dedupeEdges(edges) {
        const seen = new Set();
        return edges.filter(e => {
            const key = `${e.source_id}-${e.target_id}-${e.relationship_type}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
}

module.exports = new RetrievalEngine();
