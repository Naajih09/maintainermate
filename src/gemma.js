// Minimal Gemma client via the Google AI Studio (Gemini API) REST endpoint.
// Gemma models don't support system instructions or JSON mode, so we ask for
// JSON in the prompt and parse it defensively.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

async function askGemma(prompt, { apiKey, model }) {
  const res = await fetch(`${API_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemma API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  return parseJson(text);
}

function parseJson(text) {
  // Strip markdown fences and grab the outermost {...} block.
  const cleaned = text.replace(/```(?:json)?/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Gemma did not return JSON:\n${text}`);
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

module.exports = { askGemma };
