#!/usr/bin/env node
// Local CLI for demos and testing:
//   node src/cli.js <owner/repo> <pull|issue> <number> [--post]
// Needs GEMMA_API_KEY and GITHUB_TOKEN env vars. Without --post it only prints (dry run).

const { client } = require("./github");
const { triage } = require("./triage");

const [repo, kind, number] = process.argv.slice(2);
const post = process.argv.includes("--post");

if (!repo || !["pull", "issue"].includes(kind) || !number) {
  console.error("Usage: node src/cli.js <owner/repo> <pull|issue> <number> [--post]");
  process.exit(1);
}
if (!process.env.GEMMA_API_KEY || !process.env.GITHUB_TOKEN) {
  console.error("Set GEMMA_API_KEY and GITHUB_TOKEN environment variables.");
  process.exit(1);
}

triage({
  gh: client(process.env.GITHUB_TOKEN),
  repo,
  number: Number(number),
  kind,
  gemma: { apiKey: process.env.GEMMA_API_KEY, model: process.env.GEMMA_MODEL || "gemma-4-26b-a4b-it" },
  labels: ["bug", "enhancement", "documentation", "question", "tests", "refactor", "dependencies"],
  spamThreshold: 70,
  dryRun: !post,
}).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
