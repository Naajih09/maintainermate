// Core triage logic shared by the GitHub Action and the local CLI.

const { askGemma } = require("./gemma");

const MARKER = "<!-- maintainermate -->";
const MAX_DIFF_CHARS = 12000;

function buildDiff(files) {
  let diff = "";
  for (const f of files) {
    const chunk = `--- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})\n${f.patch ?? "(binary or too large)"}\n\n`;
    if (diff.length + chunk.length > MAX_DIFF_CHARS) {
      diff += `\n[diff truncated: ${files.length} files total]\n`;
      break;
    }
    diff += chunk;
  }
  return diff;
}

function prPrompt(pr, diff, labels) {
  return `You are MaintainerMate, an assistant that helps open-source maintainers triage pull requests during Hacktoberfest.

Analyze this pull request and respond with ONLY a JSON object, no other text:
{
  "summary": "2-3 sentence plain-English summary of what the PR does",
  "spam_score": 0-100 (how likely this is spam or a low-effort PR made just to farm contributions; e.g. whitespace-only changes, trivial README edits, adding your name to a list, unrelated changes),
  "spam_reason": "one sentence explaining the spam_score",
  "labels": ["pick 1-3 labels ONLY from this list: ${labels.join(", ")}"],
  "review_checklist": ["3-5 specific things the maintainer should check before merging"],
  "risk_notes": ["any security, breaking-change, or quality concerns; empty array if none"]
}

PR title: ${pr.title}
PR author: ${pr.user?.login}
PR description:
${pr.body || "(no description)"}

Diff:
${diff}`;
}

function issuePrompt(issue, labels) {
  return `You are MaintainerMate, an assistant that helps open-source maintainers triage issues during Hacktoberfest.

Analyze this issue and respond with ONLY a JSON object, no other text:
{
  "summary": "1-2 sentence plain-English summary",
  "spam_score": 0-100 (how likely this is spam or not a real issue),
  "spam_reason": "one sentence explaining the spam_score",
  "labels": ["pick 1-3 labels ONLY from this list: ${labels.join(", ")}"],
  "good_first_issue": true or false (is this small and well-scoped enough for a first-time contributor?),
  "clarified_task": "the issue rewritten as a clear, actionable task",
  "steps": ["3-5 concrete steps a contributor could follow to solve it"],
  "missing_info": ["questions to ask the reporter if the issue is unclear; empty array if none"]
}

Issue title: ${issue.title}
Issue author: ${issue.user?.login}
Issue body:
${issue.body || "(no description)"}`;
}

function spamBadge(score) {
  if (score >= 70) return `🚩 **Likely spam / low-effort** (${score}/100)`;
  if (score >= 40) return `⚠️ **Possibly low-effort** (${score}/100)`;
  return `✅ **Looks genuine** (${score}/100)`;
}

const list = (items) => (items?.length ? items.map((i) => `- ${i}`).join("\n") : "_None_");

function prComment(r) {
  return `${MARKER}
## 🤖 MaintainerMate triage

**Summary:** ${r.summary}

**Spam check:** ${spamBadge(r.spam_score)} — ${r.spam_reason}

**Suggested labels:** ${r.labels.map((l) => `\`${l}\``).join(" ") || "_none_"}

### Review checklist
${(r.review_checklist ?? []).map((i) => `- [ ] ${i}`).join("\n")}

### Risk notes
${list(r.risk_notes)}

<sub>Powered by Gemma · open-weight AI triage for maintainers</sub>`;
}

function issueComment(r) {
  return `${MARKER}
## 🤖 MaintainerMate triage

**Summary:** ${r.summary}

**Spam check:** ${spamBadge(r.spam_score)} — ${r.spam_reason}

**Suggested labels:** ${r.labels.map((l) => `\`${l}\``).join(" ") || "_none_"}${r.good_first_issue ? " · 🌱 **Good first issue!**" : ""}

### Clarified task
${r.clarified_task}

### Suggested steps
${(r.steps ?? []).map((s, i) => `${i + 1}. ${s}`).join("\n")}

### Missing info
${list(r.missing_info)}

<sub>Powered by Gemma · open-weight AI triage for maintainers</sub>`;
}

async function triage({ gh, repo, number, kind, gemma, labels, spamThreshold, dryRun }) {
  let result, body;

  if (kind === "pull") {
    const pr = await gh.getPull(repo, number);
    const files = await gh.getPullFiles(repo, number);
    result = await askGemma(prPrompt(pr, buildDiff(files), labels), gemma);
    body = prComment(result);
  } else {
    const issue = await gh.getIssue(repo, number);
    result = await askGemma(issuePrompt(issue, labels), gemma);
    body = issueComment(result);
  }

  // Only keep labels from the allowed list, plus our own flags.
  const finalLabels = (result.labels ?? []).filter((l) => labels.includes(l));
  if (result.spam_score >= spamThreshold) finalLabels.push("spam-suspected");
  if (result.good_first_issue) finalLabels.push("good first issue");

  if (dryRun) {
    console.log(body);
    console.log(`\nLabels: ${[...new Set(finalLabels)].join(", ")}`);
    return result;
  }

  // Update our previous comment if one exists, so re-runs don't spam the thread.
  const comments = await gh.listComments(repo, number);
  const existing = comments.find((c) => c.body?.includes(MARKER));
  if (existing) await gh.updateComment(repo, existing.id, body);
  else await gh.createComment(repo, number, body);

  if (finalLabels.length) await gh.addLabels(repo, number, [...new Set(finalLabels)]);

  console.log(`Triaged ${kind} #${number} in ${repo}: spam=${result.spam_score}, labels=${finalLabels.join(", ")}`);
  return result;
}

module.exports = { triage };
