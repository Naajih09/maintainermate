// Minimal Gemma client via the Google AI Studio (Gemini API) REST endpoint.
// Gemma models don't support system instructions or JSON mode, so we ask for
// JSON in the prompt and parse it defensively.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const RETRIES = 4;
const PARSE_ATTEMPTS = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGemma(prompt, { apiKey, model }) {
  let res;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      }),
    });
    // Retry on rate limits and transient server errors, with exponential backoff.
    if (res.ok || ![429, 500, 503].includes(res.status) || attempt === RETRIES) break;
    console.log(`Gemma returned ${res.status}, retrying (${attempt}/${RETRIES - 1})...`);
    await sleep(2000 * 2 ** (attempt - 1));
  }
  if (!res.ok) {
    throw new Error(`Gemma API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  // Skip "thought" parts if the model returns its reasoning separately.
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
}

async function askGemma(prompt, gemma) {
  // Gemma sometimes thinks out loud and runs out of room before the JSON,
  // so retry once with a firmer reminder if the answer can't be parsed.
  let lastError;
  for (let attempt = 1; attempt <= PARSE_ATTEMPTS; attempt++) {
    const suffix = attempt > 1 ? "\n\nIMPORTANT: Output the JSON object immediately. Do not explain your reasoning." : "";
    const text = await callGemma(prompt + suffix, gemma);
    try {
      return parseJson(text);
    } catch (err) {
      lastError = err;
      console.log(`Couldn't parse Gemma's answer (attempt ${attempt}/${PARSE_ATTEMPTS}).`);
    }
  }
  throw lastError;
}

function parseJson(text) {
  // Try each "{" in turn and return the first balanced block that parses,
  // ignoring braces inside strings. This skips reasoning text before the
  // JSON and any extra text or second object after it.
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === "\\") i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          break;
        }
      }
    }
  }
  throw new Error(`Gemma did not return JSON:\n${text.slice(0, 2000)}`);
}

module.exports = { askGemma };
