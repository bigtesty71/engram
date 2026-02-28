// ============================================================
// MemoryKeep ENGRAM — Intake & Structuring Engine (§6)
// Entity extraction, relationship detection, graph operations
// ============================================================
const gemini = require('./gemini');
const graph = require('./graph');

class IntakeEngine {
    // ── Process incoming text: extract entities and build graph ──
    async process(text, sessionId = null) {
        const provenance = {
            source: 'conversation',
            sessionId,
            timestamp: new Date().toISOString()
        };

        // Extract entities and relationships via Gemini
        const extracted = await gemini.extractEntities(text);

        const results = {
            nodesCreated: 0,
            nodesUpdated: 0,
            edgesCreated: 0,
            edgesUpdated: 0,
            nodes: [],
            edges: []
        };

        if (!extracted.nodes || extracted.nodes.length === 0) {
            return results;
        }

        // ── Create/update nodes ──
        const nodeIdMap = new Map(); // label → id

        for (const node of extracted.nodes) {
            try {
                const result = await graph.createNode({
                    type: this._validateType(node.type),
                    label: node.label,
                    properties: node.properties || {},
                    confidence: node.confidence || 0.5,
                    provenance
                });

                nodeIdMap.set(node.label, result.id);
                results.nodes.push({ label: node.label, id: result.id, ...result });

                if (result.updated) {
                    results.nodesUpdated++;
                } else {
                    results.nodesCreated++;
                }
            } catch (err) {
                console.error(`Failed to create node "${node.label}":`, err.message);
            }
        }

        // ── Create/update edges ──
        if (extracted.edges) {
            for (const edge of extracted.edges) {
                const sourceId = nodeIdMap.get(edge.source_label);
                const targetId = nodeIdMap.get(edge.target_label);

                if (!sourceId || !targetId) {
                    // Try to find nodes by label in existing graph
                    const sourceNodes = await graph.findNodes(edge.source_label, 1);
                    const targetNodes = await graph.findNodes(edge.target_label, 1);

                    const sid = sourceId || (sourceNodes[0]?.id);
                    const tid = targetId || (targetNodes[0]?.id);

                    if (!sid || !tid) continue;

                    try {
                        const result = await graph.createEdge({
                            sourceId: sid,
                            targetId: tid,
                            relationshipType: edge.relationship_type || 'RELATED_TO',
                            weight: edge.weight || 0.5,
                            confidence: edge.confidence || 0.5,
                            provenance
                        });
                        results.edges.push({ ...edge, id: result.id, ...result });
                        result.updated ? results.edgesUpdated++ : results.edgesCreated++;
                    } catch (err) {
                        console.error(`Failed to create edge:`, err.message);
                    }
                } else {
                    try {
                        const result = await graph.createEdge({
                            sourceId,
                            targetId,
                            relationshipType: edge.relationship_type || 'RELATED_TO',
                            weight: edge.weight || 0.5,
                            confidence: edge.confidence || 0.5,
                            provenance
                        });
                        results.edges.push({ ...edge, id: result.id, ...result });
                        result.updated ? results.edgesUpdated++ : results.edgesCreated++;
                    } catch (err) {
                        console.error(`Failed to create edge:`, err.message);
                    }
                }
            }
        }

        console.log(`📥 Intake: +${results.nodesCreated} nodes, ↑${results.nodesUpdated} updated, +${results.edgesCreated} edges`);
        return results;
    }

    // ── Validate node type ──
    _validateType(type) {
        const validTypes = ['Person', 'Event', 'Claim', 'Concept', 'Preference', 'Pattern', 'Location', 'Emotion', 'Action'];
        return validTypes.includes(type) ? type : 'Concept';
    }
}

module.exports = new IntakeEngine();
