/**
 * lib/vision.js
 * ─────────────
 * Vision analysis interface for the image normalization pipeline.
 *
 * Provides subject bounding-box detection + background classification.
 *
 * NON-NEGOTIABLE: No AI image generation / No outpainting / No content synthesis.
 * Vision is used ONLY for analysis (bbox detection, bg classification).
 *
 * Implementations (in priority order):
 *   1. OpenAI GPT-4o Vision  (OPENAI_API_KEY required) — analysis only
 *   2. Local saliency heuristic via `sharp`  (always available)
 *
 * Public API:
 *   analyzeImage(buffer, width, height) → AnalysisResult
 */

'use strict';

const sharp = require('sharp');

// ─── Types (JSDoc for IDE support) ────────────────────────────────────────────
/**
 * @typedef {Object} BBox
 * @property {number} x - Left offset in pixels
 * @property {number} y - Top offset in pixels
 * @property {number} w - Width in pixels
 * @property {number} h - Height in pixels
 */

/**
 * @typedef {'solid'|'gradient'|'textured'|'lifestyle'} BgType
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {BBox}   bbox       - Subject bounding box
 * @property {number} confidence - 0–1 detection confidence
 * @property {BgType} bg_type    - Background classification
 */

// ─── OpenAI Vision Analyzer ──────────────────────────────────────────────────

/**
 * Uses GPT-4o vision to detect the product bounding box and classify background.
 * Requires OPENAI_API_KEY in environment.
 *
 * @param {Buffer} buffer - Image buffer (JPEG/PNG/WebP)
 * @param {number} width  - Image width
 * @param {number} height - Image height
 * @returns {Promise<AnalysisResult|null>} - null if API unavailable or failed
 */
async function analyzeWithOpenAI(buffer, width, height) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const base64 = buffer.toString('base64');
    const mimeType = 'image/jpeg';

    const prompt = `You are an image analysis assistant. Analyze this product photograph and return ONLY a JSON object (no markdown, no explanation) with these fields:

{
  "bbox": { "x": <int>, "y": <int>, "w": <int>, "h": <int> },
  "confidence": <float 0-1>,
  "bg_type": "<solid|gradient|textured|lifestyle>"
}

Rules:
- bbox must tightly enclose the main product/subject in pixel coordinates.
- Image dimensions are ${width}×${height} pixels.
- confidence = how sure you are the bbox is accurate.
- bg_type: "solid" = uniform color, "gradient" = smooth color transition, "textured" = patterned/fabric bg, "lifestyle" = room/scene setting.
- Return valid JSON only.`;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'low' } },
          ],
        }],
      }),
    });

    if (!resp.ok) {
      console.error(`  OpenAI API error: ${resp.status} ${resp.statusText}`);
      return null;
    }

    const json = await resp.json();
    const text = json.choices?.[0]?.message?.content || '';

    // Extract JSON from response (may have markdown fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('  OpenAI returned non-JSON:', text.substring(0, 200));
      return null;
    }

    const result = JSON.parse(jsonMatch[0]);

    // Validate and clamp bbox
    const bbox = {
      x: Math.max(0, Math.min(result.bbox.x, width - 1)),
      y: Math.max(0, Math.min(result.bbox.y, height - 1)),
      w: Math.max(1, Math.min(result.bbox.w, width - result.bbox.x)),
      h: Math.max(1, Math.min(result.bbox.h, height - result.bbox.y)),
    };

    return {
      bbox,
      confidence: Math.max(0, Math.min(1, result.confidence || 0.7)),
      bg_type: ['solid', 'gradient', 'textured', 'lifestyle'].includes(result.bg_type)
        ? result.bg_type
        : 'textured',
    };
  } catch (err) {
    console.error('  OpenAI vision failed:', err.message);
    return null;
  }
}

// ─── Local Saliency Heuristic ─────────────────────────────────────────────────

/**
 * Detect subject bbox using sharp edge-trimming heuristic.
 * Works without any external API — always available.
 *
 * Strategy:
 *   1. Convert to greyscale, find edge-trim bbox (removes uniform border).
 *   2. Classify background by sampling corners and edges.
 *
 * @param {Buffer} buffer - Image buffer
 * @param {number} width  - Image width
 * @param {number} height - Image height
 * @returns {Promise<AnalysisResult>}
 */
async function analyzeWithSaliency(buffer, width, height) {
  let bbox = { x: 0, y: 0, w: width, h: height };
  let confidence = 0.3; // baseline for heuristic

  try {
    // Attempt trim-based detection:
    // sharp.trim() removes border pixels similar to the top-left pixel.
    // The resulting offset + dimensions give us the subject bbox.
    const trimInfo = await sharp(buffer)
      .trim({ threshold: 30 })
      .toBuffer({ resolveWithObject: true });

    const info = trimInfo.info;
    // sharp returns trimOffsetLeft, trimOffsetTop in info
    const trimLeft = info.trimOffsetLeft || 0;
    const trimTop  = info.trimOffsetTop  || 0;

    // trimLeft/trimTop can be negative (sharp convention: offset from original origin)
    const tx = Math.abs(trimLeft);
    const ty = Math.abs(trimTop);

    if (info.width > 0 && info.height > 0) {
      bbox = {
        x: tx,
        y: ty,
        w: Math.min(info.width, width - tx),
        h: Math.min(info.height, height - ty),
      };
      // Higher confidence if trim removed significant border
      const trimRatio = (bbox.w * bbox.h) / (width * height);
      confidence = trimRatio < 0.9 ? 0.6 : 0.35;
    }
  } catch (err) {
    // trim() can fail on images with no uniform border — that's OK
    // Fall back to full-image bbox with low confidence
    confidence = 0.2;
  }

  // ─── Background classification ─────────────────────────────────────────
  const bg_type = await classifyBackground(buffer, width, height);

  return { bbox, confidence, bg_type };
}

/**
 * Classify background by sampling corner regions and checking color variance.
 *
 * @param {Buffer} buffer
 * @param {number} width
 * @param {number} height
 * @returns {Promise<BgType>}
 */
async function classifyBackground(buffer, width, height) {
  try {
    const sampleSize = Math.min(50, Math.floor(Math.min(width, height) * 0.1));
    if (sampleSize < 5) return 'solid';

    // Sample four corners
    const corners = [
      { left: 0, top: 0 },                                          // top-left
      { left: Math.max(0, width - sampleSize), top: 0 },            // top-right
      { left: 0, top: Math.max(0, height - sampleSize) },           // bottom-left
      { left: Math.max(0, width - sampleSize), top: Math.max(0, height - sampleSize) }, // bottom-right
    ];

    const cornerStats = [];
    for (const region of corners) {
      const stats = await sharp(buffer)
        .extract({
          left: region.left,
          top: region.top,
          width: sampleSize,
          height: sampleSize,
        })
        .stats();
      cornerStats.push(stats);
    }

    // Check if all corners have similar mean color (low variance = solid/gradient)
    const means = cornerStats.map(s => s.channels.slice(0, 3).map(c => c.mean));

    // Compute cross-corner variance
    const allMeans = [0, 1, 2].map(ch => {
      const vals = means.map(m => m[ch]);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return vals.reduce((a, b) => a + (b - avg) ** 2, 0) / vals.length;
    });
    const totalVariance = allMeans.reduce((a, b) => a + b, 0);

    // Check within-corner variance (texture detection)
    const withinVariance = cornerStats
      .map(s => s.channels.slice(0, 3).reduce((sum, c) => sum + c.stdev, 0) / 3)
      .reduce((a, b) => a + b, 0) / cornerStats.length;

    if (totalVariance < 50 && withinVariance < 10) return 'solid';
    if (totalVariance < 200 && withinVariance < 10) return 'gradient';
    if (totalVariance > 1000 || withinVariance > 40) return 'lifestyle';
    return 'textured';
  } catch {
    return 'textured'; // safe default
  }
}

// ─── Public Interface ─────────────────────────────────────────────────────────

/**
 * Analyze an image to detect the product subject and classify the background.
 * Tries OpenAI vision first (if OPENAI_API_KEY set), falls back to local saliency.
 *
 * @param {Buffer} buffer - Image buffer (JPEG/PNG/WebP)
 * @param {number} width  - Image width
 * @param {number} height - Image height
 * @returns {Promise<AnalysisResult>}
 */
async function analyzeImage(buffer, width, height) {
  // Try OpenAI first
  const openaiResult = await analyzeWithOpenAI(buffer, width, height);
  if (openaiResult) {
    console.log('  Vision: OpenAI (confidence:', openaiResult.confidence.toFixed(2) + ')');
    return openaiResult;
  }

  // Fallback to local saliency
  const localResult = await analyzeWithSaliency(buffer, width, height);
  console.log('  Vision: local saliency (confidence:', localResult.confidence.toFixed(2) + ')');
  return localResult;
}

module.exports = {
  analyzeImage,
  // Exported for testing:
  analyzeWithOpenAI,
  analyzeWithSaliency,
  classifyBackground,
};
