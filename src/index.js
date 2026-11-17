// GitHub Action entrypoint. Reads the triggering event and triages the PR or issue.

const fs = require("fs");
const { client } = require("./github");
const { triage } = require("./triage");

// GitHub passes inputs as INPUT_<NAME> with dashes and spaces replaced by underscores.
const input = (name, fallback = "") =>
  (process.env[`INPUT_${name.replace(/[ -]/g, "_").toUpperCase()}`] || fallback).trim();

// The default GITHUB_TOKEN can't call /user, so fall back to the bot identity it posts as.
async function resolveBotLogin(gh) {
  try {
    return await gh.getViewer();
  } catch {
    return "github-actions[bot]";
  }
}

async function main() {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const repo = process.env.GITHUB_REPOSITORY;

  // A comment on a pull request arrives as an issue event with issue.pull_request set.
  let kind = null;
  let number = null;
  if (event.pull_request) {
    kind = "pull";
    number = event.pull_request.number;
  } else if (event.issue?.pull_request) {
    kind = "pull";
    number = event.issue.number;
  } else if (event.issue) {
    kind = "issue";
    number = event.issue.number;
  }
  if (!kind) {
    console.log("Not a pull request or issue event; nothing to do.");
    return;
  }

  const token = input("github-token");
  if (!token) {
    throw new Error("Missing github-token. Add `github-token: ${{ secrets.GITHUB_TOKEN }}` to your workflow.");
  }
  const gh = client(token);
  const botLogin = await resolveBotLogin(gh);

  const gemmaApiKey = input("gemma-api-key");
  if (!gemmaApiKey) {
    throw new Error("Missing required input: gemma-api-key");
  }

  // Clamp to 0-100 and fall back to 70 if the value isn't a number.
  const parsedThreshold = Number(input("spam-threshold", "70"));
  const spamThreshold = Number.isFinite(parsedThreshold)
    ? Math.min(100, Math.max(0, parsedThreshold))
    : 70;

  await triage({
    gh,
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
    botLogin,
  });
}

main().catch((err) => {
  console.log(`::error::${err.message}`);
  if (process.env.MAINTAINERMATE_DEBUG) {
    console.log(err.stack);
  }
  process.exit(1);
});
