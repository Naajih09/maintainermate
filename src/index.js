// GitHub Action entrypoint. Reads the triggering event and triages the PR or issue.

const fs = require("fs");
const { client } = require("./github");
const { triage } = require("./triage");

// GitHub passes inputs as INPUT_<NAME> with dashes and spaces replaced by underscores.
const input = (name, fallback = "") =>
  (process.env[`INPUT_${name.replace(/[ -]/g, "_").toUpperCase()}`] || fallback).trim();

async function main() {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const repo = process.env.GITHUB_REPOSITORY;

  const kind = event.pull_request ? "pull" : event.issue ? "issue" : null;
  if (!kind) {
    console.log("Not a pull request or issue event; nothing to do.");
    return;
  }
  const number = (event.pull_request ?? event.issue).number;

  // Fall back to the token GitHub provides to every action run.
  const token = input("github-token") || process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("No GitHub token available. Pass github-token or enable GITHUB_TOKEN.");
  }

  // Clamp to 0-100 and fall back to 70 if the value isn't a number.
  const parsedThreshold = Number(input("spam-threshold", "70"));
  const spamThreshold = Number.isFinite(parsedThreshold)
    ? Math.min(100, Math.max(0, parsedThreshold))
    : 70;

  const gemmaApiKey = input("gemma-api-key");
  if (!gemmaApiKey) {
    throw new Error("Missing required input: gemma-api-key");
  }

  await triage({
    gh: client(token),
    repo,
    number,
    kind,
    gemma: { apiKey: gemmaApiKey, model: input("model", "gemma-4-26b-a4b-it") },
    labels: input("labels", "bug,enhancement,documentation,question,tests,refactor,dependencies")
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean),
    spamThreshold,
    dryRun: false,
  });
}

main().catch((err) => {
  console.log(`::error::${err.message}`);
  if (process.env.MAINTAINERMATE_DEBUG) {
    console.log(err.stack);
  }
  process.exit(1);
});
