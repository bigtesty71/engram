-- ============================================================
-- MemoryKeep ENGRAM — Database Schema (MySQL)
-- Graph-Native Memory Architecture for Persistent AI
-- ============================================================

-- ── Core Cognitive State (§4) ──
-- Always-loaded region: identity, directives, constraints
CREATE TABLE IF NOT EXISTS core_state (
    id INT AUTO_INCREMENT PRIMARY KEY,
    state_key VARCHAR(100) NOT NULL UNIQUE,
    state_value JSON NOT NULL,
    version INT DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Sessions ──
-- Track active and historical sessions
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(255),
    stream_buffer JSON,
    token_count INT DEFAULT 0,
    status ENUM('active', 'consolidated', 'archived') DEFAULT 'active',
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Memory Nodes (§7) ──
-- Graph nodes: Person, Event, Claim, Concept, Preference, Pattern
CREATE TABLE IF NOT EXISTS memory_nodes (
    id VARCHAR(36) PRIMARY KEY,
    type ENUM('Person', 'Event', 'Claim', 'Concept', 'Preference', 'Pattern', 'Location', 'Emotion', 'Action') NOT NULL,
    label VARCHAR(500) NOT NULL,
    properties JSON,
    embedding LONGBLOB,
    confidence DECIMAL(5,3) DEFAULT 0.500,
    provenance JSON,
    access_level ENUM('public', 'private', 'sensitive') DEFAULT 'public',
    mention_count INT DEFAULT 1,
    last_accessed DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    valid_from DATETIME,
    valid_to DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_nodes_type ON memory_nodes(type);
CREATE INDEX idx_nodes_confidence ON memory_nodes(confidence);
CREATE INDEX idx_nodes_label ON memory_nodes(label(255));
CREATE INDEX idx_nodes_created ON memory_nodes(created_at);

-- ── Memory Edges (§7) ──
-- Graph edges: typed, weighted, confidence-scored relationships
CREATE TABLE IF NOT EXISTS memory_edges (
    id VARCHAR(36) PRIMARY KEY,
    source_id VARCHAR(36) NOT NULL,
    target_id VARCHAR(36) NOT NULL,
    relationship_type VARCHAR(100) NOT NULL,
    weight DECIMAL(5,3) DEFAULT 0.500,
    confidence DECIMAL(5,3) DEFAULT 0.500,
    provenance JSON,
    properties JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    valid_from DATETIME,
    valid_to DATETIME,
    FOREIGN KEY (source_id) REFERENCES memory_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES memory_nodes(id) ON DELETE CASCADE,
    UNIQUE KEY unique_edge (source_id, target_id, relationship_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_edges_source ON memory_edges(source_id);
CREATE INDEX idx_edges_target ON memory_edges(target_id);
CREATE INDEX idx_edges_rel_type ON memory_edges(relationship_type);
CREATE INDEX idx_edges_confidence ON memory_edges(confidence);

-- ── Consolidation Log (§8) ──
-- Track when stream data is consolidated into the graph
CREATE TABLE IF NOT EXISTS consolidation_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(36),
    summary TEXT,
    nodes_created INT DEFAULT 0,
    nodes_updated INT DEFAULT 0,
    edges_created INT DEFAULT 0,
    edges_updated INT DEFAULT 0,
    patterns_detected INT DEFAULT 0,
    consolidated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Retrieval Cache ──
-- Hot subgraph cache for frequently accessed memories
CREATE TABLE IF NOT EXISTS retrieval_cache (
    cache_key VARCHAR(255) PRIMARY KEY,
    node_ids JSON,
    edge_ids JSON,
    score DECIMAL(5,3),
    hits INT DEFAULT 1,
    cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Seed Core State ──
INSERT IGNORE INTO core_state (state_key, state_value) VALUES
('identity', '{"name":"ENGRAM","fullName":"Engineered Graph-native Adaptive Memory","version":"1.0.0","description":"A persistent AI assistant powered by MemoryKeep graph-native memory architecture","personality":"Wise, attentive, and genuinely interested in understanding and remembering","creator":"MemoryKeep AI"}');

INSERT IGNORE INTO core_state (state_key, state_value) VALUES
('directives', '{"primary":"Build and maintain a structured, trustworthy memory graph from all interactions","secondary":["Extract entities and relationships from every conversation","Score confidence on all memories and prefer omission over incorrect recall","Consolidate session streams into the persistent graph periodically","Respect temporal validity — memories can expire or be superseded","Maintain token efficiency — never exceed budget constraints"]}');

INSERT IGNORE INTO core_state (state_key, state_value) VALUES
('constraints', '{"maxTokenBudget":100000,"consolidationThreshold":0.85,"minConfidenceForRecall":0.3,"confidenceDecayRate":0.005,"maxRetrievalNodes":20,"maxEdgeHops":3}');

INSERT IGNORE INTO core_state (state_key, state_value) VALUES
('version_meta', '{"schema_version":"1.0.0","engine_version":"1.0.0","last_migration":"2026-02-28"}')
