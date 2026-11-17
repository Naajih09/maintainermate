#!/usr/bin/env node
// Local CLI for demos and testing:
//   node src/cli.js <owner/repo> <pull|issue> <number> [--post]
// Needs GEMMA_API_KEY and GITHUB_TOKEN env vars. Without --post it only prints (dry run).

const { client } = require("./github");
const { triage } = require("./triage");

const DEFAULT_LABELS = "bug,enhancement,documentation,question,tests,refactor,dependencies";
const DEFAULT_THRESHOLD = 70;

const usage = "Usage: node src/cli.js <owner/repo> <pull|issue> <number> [--post]";

const args = process.argv.slice(2);
const post = args.includes("--post");
const [repo, kind, number] = args.filter((a) => a !== "--post");

if (!repo || !["pull", "issue"].includes(kind) || !number) {
  console.error(usage);
  process.exit(1);
}

if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  console.error("Repo must be in the form owner/repo.");
  process.exit(1);
}

const num = Number(number);
if (!Number.isInteger(num) || num < 1) {
  console.error("The number must be a positive integer.");
  process.exit(1);
}

if (!process.env.GEMMA_API_KEY || !process.env.GITHUB_TOKEN) {
  console.error("Set GEMMA_API_KEY and GITHUB_TOKEN environment variables.");
  process.exit(1);
}

// Same defaults as action.yml, overridable with env vars for local testing.
const labels = (process.env.GEMMA_LABELS || DEFAULT_LABELS)
  .split(",")
  .map((l) => l.trim())
  .filter(Boolean);

const parsedThreshold = Number(process.env.SPAM_THRESHOLD ?? DEFAULT_THRESHOLD);
const spamThreshold = Number.isFinite(parsedThreshold)
  ? Math.min(100, Math.max(0, parsedThreshold))
  : DEFAULT_THRESHOLD;

triage({
  gh: client(process.env.GITHUB_TOKEN),
  repo,
  number: num,
  kind,
  gemma: {
    apiKey: process.env.GEMMA_API_KEY,
    model: process.env.GEMMA_MODEL || "gemma-4-26b-a4b-it",
  },
  labels,
  spamThreshold,
  dryRun: !post,
}).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
