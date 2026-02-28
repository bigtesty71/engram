// ============================================================
// MemoryKeep ENGRAM — Gemini Client (REST API)
// Uses direct REST calls for reliable model access
// ============================================================
require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_ID = process.env.ENGRAM_MODEL || 'gemini-2.5-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// ── Core API Call ──
async function callGemini(model, contents, config = {}) {
    const url = `${BASE_URL}/models/${model}:generateContent?key=${API_KEY}`;

    const body = { contents };
    if (config.systemInstruction) {
        body.systemInstruction = { parts: [{ text: config.systemInstruction }] };
    }
    if (config.generationConfig) {
        body.generationConfig = config.generationConfig;
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Gemini API ${res.status}: ${errorBody.substring(0, 300)}`);
    }

    const data = await res.json();
    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error('No valid response from Gemini');
    }
    return data.candidates[0].content.parts[0].text;
}

// ── Chat Generation ──
async function generateResponse(systemPrompt, userMessage, context = '') {
    const prompt = context
        ? `[MEMORY CONTEXT]\n${context}\n\n[USER MESSAGE]\n${userMessage}`
        : userMessage;

    return callGemini(MODEL_ID, [{ role: 'user', parts: [{ text: prompt }] }], {
        systemInstruction: systemPrompt
    });
}

// ── Entity Extraction ──
async function extractEntities(text) {
    const prompt = `Analyze the following text and extract structured entities and relationships.

Return ONLY valid JSON with this exact structure:
{
  "nodes": [
    {
      "type": "Person|Event|Claim|Concept|Preference|Location|Emotion|Action",
      "label": "short descriptive label",
      "properties": { "key": "value" },
      "confidence": 0.0 to 1.0
    }
  ],
  "edges": [
    {
      "source_label": "label of source node",
      "target_label": "label of target node",
      "relationship_type": "KNOWS|LIKES|DISLIKES|ATTENDED|CREATED|LOCATED_IN|FEELS|SAID|WANTS|HAS|IS_A|RELATED_TO",
      "weight": 0.0 to 1.0,
      "confidence": 0.0 to 1.0
    }
  ]
}

Rules:
- Only extract clearly stated or strongly implied information
- Set confidence lower (0.3-0.6) for implied info, higher (0.7-1.0) for explicit
- Prefer omission over incorrect extraction
- Canonicalize names (e.g., "my mom" → use actual name if known)
- Each node label should be concise (1-5 words)

Text to analyze:
"""
${text}
"""`;

    const responseText = await callGemini(MODEL_ID, [{ role: 'user', parts: [{ text: prompt }] }], {
        generationConfig: { responseMimeType: 'application/json' }
    });

    try {
        return JSON.parse(responseText);
    } catch (e) {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1].trim());
        }
        console.error('Failed to parse entity extraction:', e.message);
        return { nodes: [], edges: [] };
    }
}

// ── Summarization (for consolidation) ──
async function summarizeStream(streamContent) {
    const prompt = `Summarize the following conversation stream into a concise factual summary.
Focus on:
- Key facts learned about users/topics
- Decisions made or preferences expressed
- Important events or claims
- Relationships between entities

Keep it factual and structured. No commentary.

Stream:
"""
${streamContent}
"""`;

    return callGemini(MODEL_ID, [{ role: 'user', parts: [{ text: prompt }] }]);
}

// ── Build System Prompt ──
function buildSystemPrompt(identity, directives, constraints) {
    return `You are ${identity.name} (${identity.fullName}), ${identity.description}.

Personality: ${identity.personality}

Your core directives:
- Primary: ${directives.primary}
${directives.secondary.map(d => `- ${d}`).join('\n')}

Operational constraints:
- Maximum retrieval nodes per query: ${constraints.maxRetrievalNodes}
- Maximum graph traversal hops: ${constraints.maxEdgeHops}
- Minimum confidence for recall: ${constraints.minConfidenceForRecall}

IMPORTANT BEHAVIORAL RULES:
- You have persistent memory through a graph database. You genuinely remember past conversations.
- When you recall information, mention it naturally — don't announce "I found this in my memory."
- If you're unsure about a memory, say so honestly rather than fabricating details.
- You are warm, intelligent, and genuinely interested in understanding and helping.
- You build trust through demonstrated memory and consistent personality.
- Never discuss your internal architecture, token budgets, or technical implementation with users.`;
}

module.exports = {
    generateResponse,
    extractEntities,
    summarizeStream,
    buildSystemPrompt,
    MODEL_ID
};
