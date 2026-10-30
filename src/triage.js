// Core triage logic shared by the GitHub Action and the local CLI.

const { askGemma } = require("./gemma");
const { scan } = require("./scanner");
const { buildDiff, prPrompt, finalThreatLevel } = require("./prompt");

const MARKER = "<!-- maintainermate -->";

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
  if (score >= 70) return `👻 **Ghost PR detected:** likely spam / low-effort (${score}/100)`;
  if (score >= 40) return `🕯️ **Something feels off:** possibly low-effort (${score}/100)`;
  return `✅ **A living, breathing contribution:** looks genuine (${score}/100)`;
}

const list = (items) => (items?.length ? items.map((i) => `- ${i}`).join("\n") : "_None_");

function threatBadge(level) {
  return {
    high: "👹 **POSSESSED: possible malware.** Do not merge until a human has reviewed the flagged code.",
    medium: "🕯️ **Something is lurking:** suspicious code that needs a careful look.",
    low: "🔦 **Mostly clear:** minor concerns only.",
    none: "✅ **Clean:** no signs of malicious code.",
  }[level];
}

function possessionSection(r, flags) {
  const flagList = flags.length
    ? flags.map((f) => `- **[${f.severity}]** ${f.title}: \`${f.file}:${f.line}\`\n  \`${f.snippet.replace(/`/g, "'")}\``).join("\n")
    : "_No red flags from the static scanner._";
  return `### 👹 Possession check
${threatBadge(r.threat_level)}

${r.threat_explanation ? `**What this code would do:** ${r.threat_explanation}\n\n` : ""}**Static scanner red flags:**
${flagList}
`;
}

function prComment(r, flags) {
  return `${MARKER}
## 🤖 MaintainerMate triage

**Summary:** ${r.summary}

${possessionSection(r, flags)}
**Spam check:** ${["medium", "high"].includes(r.threat_level) ? "_Skipped: a security threat matters more than effort. See the possession check above._" : `${spamBadge(r.spam_score)} — ${r.spam_reason}`}

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
  let securityReview = false;

  if (kind === "pull") {
    const pr = await gh.getPull(repo, number);
    const files = await gh.getPullFiles(repo, number);
    const flags = scan(files);
    result = await askGemma(prPrompt(pr, buildDiff(files), labels, flags), gemma);

    result.threat_level = finalThreatLevel(flags, result.threat_level);
    securityReview = result.threat_level === "high";

    body = prComment(result, flags);
  } else {
    const issue = await gh.getIssue(repo, number);
    result = await askGemma(issuePrompt(issue, labels), gemma);
    body = issueComment(result);
  }

  // Only keep labels from the allowed list, plus our own flags.
  const finalLabels = (result.labels ?? []).filter((l) => labels.includes(l));
  if (result.spam_score >= spamThreshold) finalLabels.push("spam-suspected");
  if (result.good_first_issue) finalLabels.push("good first issue");
  if (securityReview) finalLabels.push("security-review");

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
