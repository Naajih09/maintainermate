// Minimal Gemma client via the Google AI Studio (Gemini API) REST endpoint.
// Gemma models don't support system instructions or JSON mode, so we ask for
// JSON in the prompt and parse it defensively.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const RETRIES = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function askGemma(prompt, { apiKey, model }) {
  let res;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
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
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  return parseJson(text);
}

function parseJson(text) {
  // Find the first balanced {...} block, ignoring braces inside strings,
  // so extra text or a second object after the JSON doesn't break parsing.
  const start = text.indexOf("{");
  let depth = 0;
  let inString = false;
  for (let i = start; start !== -1 && i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error(`Gemma did not return JSON:\n${text}`);
}

module.exports = { askGemma };
