// GitHub Action entrypoint. Reads the triggering event and triages the PR or issue.

const fs = require("fs");
const { client } = require("./github");
const { triage } = require("./triage");

const input = (name, fallback = "") =>
  (process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] || fallback).trim();

async function main() {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const repo = process.env.GITHUB_REPOSITORY;

  const kind = event.pull_request ? "pull" : event.issue ? "issue" : null;
  if (!kind) {
    console.log("Not a pull request or issue event; nothing to do.");
    return;
  }
  const number = (event.pull_request ?? event.issue).number;

  await triage({
    gh: client(input("github-token")),
    repo,
    number,
    kind,
    gemma: { apiKey: input("gemma-api-key"), model: input("model", "gemma-3-27b-it") },
    labels: input("labels", "bug,enhancement,documentation,question,tests,refactor,dependencies")
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean),
    spamThreshold: Number(input("spam-threshold", "70")),
    dryRun: false,
  });
}

main().catch((err) => {
  console.log(`::error::${err.message}`);
  process.exit(1);
});
