/**
 * lib/color_mapper.js
 * ────────────────────
 * 4-stage color mapping pipeline:
 *   Stage 1: Dictionary exact lookup
 *   Stage 2: NLP fuzzy match (keyword + Levenshtein)
 *   Stage 3: GPT-4o Vision analysis
 *   Stage 4: Consensus
 *
 * Priority: override > dictionary > nlp > vision > unclassified
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Load taxonomy config ─────────────────────────────────────────────────────
const TAX_PATH = path.resolve(__dirname, '..', 'config', 'color_taxonomy.json');
const colorTax = JSON.parse(fs.readFileSync(TAX_PATH, 'utf8'));

const FAMILIES       = colorTax.families;       // [{ name, slug, hex, keywords, synonyms }]
const KNOWN_MAPPINGS = colorTax.known_mappings;  // { raw → family_name }
const UNMAPPABLE     = new Set(colorTax.unmappable_flags.map(s => s.toLowerCase()));
const FAMILY_NAMES   = FAMILIES.map(f => f.name);

// Build keyword → family index
const KEYWORD_TO_FAMILY = {};
for (const f of FAMILIES) {
  for (const kw of [...f.keywords, ...f.synonyms]) {
    KEYWORD_TO_FAMILY[kw.toLowerCase()] = f.name;
  }
}

// ─── Stage 1: Dictionary Lookup ───────────────────────────────────────────────
function stage1Dictionary(rawColor) {
  if (!rawColor || rawColor.trim().length === 0) return null;
  const raw = rawColor.trim();

  if (UNMAPPABLE.has(raw.toLowerCase())) return null;

  // Exact match
  if (KNOWN_MAPPINGS[raw]) {
    return { family: KNOWN_MAPPINGS[raw], confidence: 1.0, source: 'dictionary' };
  }

  // Case-insensitive match
  const rawLower = raw.toLowerCase();
  for (const [k, v] of Object.entries(KNOWN_MAPPINGS)) {
    if (k.toLowerCase() === rawLower) {
      return { family: v, confidence: 1.0, source: 'dictionary' };
    }
  }

  return null;
}

// ─── Stage 2: NLP Fuzzy Match ─────────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function stage2NLP(rawColor) {
  if (!rawColor || rawColor.trim().length === 0) return null;
  const raw = rawColor.trim();

  if (UNMAPPABLE.has(raw.toLowerCase())) return null;

  // Keyword match (exact word match)
  const words = raw.toLowerCase().split(/[\s,\/\-\|&]+/).filter(w => w.length > 2);
  for (const word of words) {
    if (KEYWORD_TO_FAMILY[word]) {
      return { family: KEYWORD_TO_FAMILY[word], confidence: 0.8, source: 'nlp_keyword' };
    }
  }

  // Substring match
  const rawLower = raw.toLowerCase();
  for (const [kw, family] of Object.entries(KEYWORD_TO_FAMILY)) {
    if (kw.length > 3 && rawLower.includes(kw)) {
      return { family, confidence: 0.7, source: 'nlp_substring' };
    }
  }

  // Levenshtein fuzzy match on individual words
  let bestMatch = null;
  let bestDist = Infinity;
  for (const word of words) {
    if (word.length < 3) continue;
    for (const [kw, family] of Object.entries(KEYWORD_TO_FAMILY)) {
      if (kw.length < 3) continue;
      const dist = levenshtein(word, kw);
      const maxLen = Math.max(word.length, kw.length);
      const similarity = 1 - dist / maxLen;
      if (similarity >= 0.75 && dist < bestDist) {
        bestDist = dist;
        bestMatch = { family, confidence: 0.5 + similarity * 0.3, source: 'nlp_fuzzy' };
      }
    }
  }

  return bestMatch;
}

// ─── Stage 3: GPT-4o Vision Analysis ──────────────────────────────────────────
async function stage3Vision(imageUrl, openaiKey) {
  if (!imageUrl || !openaiKey) return null;

  const familyList = FAMILY_NAMES.join(', ');
  const prompt = `You are a professional interior design expert classifying products for a luxury home décor catalog.

Analyze this product image and determine the PRIMARY dominant color family.
Choose EXACTLY ONE from this list:
${familyList}

Also provide a SECONDARY color family if the product has a noticeable second color.

Rules:
- For metallic/bronze/brass/copper finishes → "Metallic"
- For wood tones → match to closest warm neutral (Camel, Taupe, Natural)
- For upholstered furniture showing fabric → classify the fabric color
- For white/off-white ceramics → "White" or "Ivory"
- For multi-colored patterns → "Multi"
- For natural/raw materials (wood, rattan, stone) → "Natural"

Return ONLY valid JSON (no markdown, no code fences):
{"primary": "FamilyName", "secondary": "FamilyName or null", "confidence": 0.0-1.0, "reasoning": "brief explanation"}`;

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } }
            ]
          }
        ],
        max_tokens: 200,
        temperature: 0.1
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`  Vision API error (${resp.status}): ${errText.substring(0, 200)}`);
      return null;
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    // Parse JSON (handle possible markdown wrapping)
    const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonStr);

    // Validate family name
    if (!FAMILY_NAMES.includes(result.primary)) {
      // Try case-insensitive match
      const match = FAMILY_NAMES.find(f => f.toLowerCase() === result.primary?.toLowerCase());
      if (match) result.primary = match;
      else {
        console.error(`  Vision returned invalid family: "${result.primary}"`);
        return null;
      }
    }

    if (result.secondary && !FAMILY_NAMES.includes(result.secondary)) {
      const match2 = FAMILY_NAMES.find(f => f.toLowerCase() === result.secondary?.toLowerCase());
      result.secondary = match2 || null;
    }

    return {
      family: result.primary,
      secondary: result.secondary || null,
      confidence: Math.min(1.0, Math.max(0.0, result.confidence || 0.7)),
      source: 'vision',
      reasoning: result.reasoning || ''
    };
  } catch (err) {
    console.error(`  Vision error: ${err.message}`);
    return null;
  }
}

// ─── Stage 4: Consensus ──────────────────────────────────────────────────────
function consensus(dict, nlp, vision) {
  // Collect non-null results
  const results = [dict, nlp, vision].filter(Boolean);

  if (results.length === 0) {
    return { family: null, secondary: null, confidence: 0, source: 'unclassified' };
  }

  if (results.length === 1) {
    const r = results[0];
    return {
      family: r.family,
      secondary: r.secondary || null,
      confidence: r.confidence,
      source: r.source
    };
  }

  // Check agreement
  const families = results.map(r => r.family);
  const allAgree = families.every(f => f === families[0]);

  if (allAgree) {
    // All agree → boost confidence
    const maxConf = Math.max(...results.map(r => r.confidence));
    return {
      family: families[0],
      secondary: results.find(r => r.secondary)?.secondary || null,
      confidence: Math.min(1.0, maxConf + 0.1),
      source: 'consensus_unanimous'
    };
  }

  // Majority wins (if 2/3 agree)
  const counts = {};
  for (const f of families) counts[f] = (counts[f] || 0) + 1;
  const majority = Object.entries(counts).find(([, c]) => c > 1);
  if (majority) {
    const majorityFamily = majority[0];
    const majorityResults = results.filter(r => r.family === majorityFamily);
    const maxConf = Math.max(...majorityResults.map(r => r.confidence));
    return {
      family: majorityFamily,
      secondary: results.find(r => r.secondary)?.secondary || null,
      confidence: maxConf,
      source: 'consensus_majority'
    };
  }

  // No agreement — use highest confidence single result
  results.sort((a, b) => b.confidence - a.confidence);
  const best = results[0];
  return {
    family: best.family,
    secondary: best.secondary || null,
    confidence: Math.max(0.3, best.confidence - 0.1), // penalize slightly for disagreement
    source: `${best.source}_solo`
  };
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────
/**
 * Run the full color mapping pipeline for a product.
 * @param {object} product - { rawColor, imageUrl, overrideColor, title, productType }
 * @param {string} openaiKey - OpenAI API key  
 * @param {object} opts - { skipVision: bool, forceVision: bool }
 * @returns {{ family, secondary, confidence, source, reasoning }}
 */
async function mapColor(product, openaiKey, opts = {}) {
  const { rawColor, imageUrl, overrideColor, title } = product;

  // Priority 0: Manual override always wins
  if (overrideColor) {
    return {
      family: overrideColor,
      secondary: null,
      confidence: 1.0,
      source: 'manual_override',
      reasoning: 'Manual override set by curator'
    };
  }

  // Stage 1: Dictionary
  const dict = stage1Dictionary(rawColor);

  // Stage 2: NLP
  const nlp = stage2NLP(rawColor);

  // If we already have a high-confidence match and don't want to burn vision credits
  if (dict && dict.confidence >= 0.9 && !opts.forceVision) {
    return { ...dict, secondary: null, reasoning: 'Dictionary exact match' };
  }

  // Stage 3: Vision (only if image available and needed)
  let vision = null;
  if (!opts.skipVision && imageUrl && openaiKey) {
    // Only call vision if dict/nlp didn't give high confidence
    const bestSoFar = dict || nlp;
    if (!bestSoFar || bestSoFar.confidence < 0.9 || opts.forceVision) {
      vision = await stage3Vision(imageUrl, openaiKey);
    }
  }

  // Stage 4: Consensus
  const result = consensus(dict, nlp, vision);
  result.reasoning = vision?.reasoning || '';

  return result;
}

module.exports = {
  mapColor,
  stage1Dictionary,
  stage2NLP,
  stage3Vision,
  consensus,
  FAMILY_NAMES,
  FAMILIES
};
