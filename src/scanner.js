// Deterministic malware red-flag scanner. Runs before Gemma and doesn't depend on it,
// so a PR that tricks the model with hidden instructions still gets flagged.

const RULES = [
  {
    id: "remote-script-exec",
    severity: "high",
    title: "Downloads and runs a remote script",
    pattern: /(curl|wget)[^\n|]*\|\s*(ba|z)?sh\b|iwr[^\n|]*\|\s*iex\b|Invoke-WebRequest[^\n|]*\|\s*Invoke-Expression|Invoke-Expression\s*\(\s*(New-Object\s+Net\.WebClient|iwr|Invoke-WebRequest)/i,
  },
  {
    id: "install-hook",
    severity: "high",
    title: "Adds an npm install hook (common in malicious packages)",
    pattern: /"(pre|post)?install"\s*:/,
    files: /(^|\/)package\.json$/,
  },
  {
    id: "obfuscated-eval",
    severity: "high",
    title: "Runs decoded or obfuscated code",
    pattern: /eval\s*\(\s*(atob|Buffer\.from|unescape|decodeURIComponent|String\.fromCharCode)|new\s+Function\s*\(\s*(atob|Buffer\.from)|exec\s*\(\s*(base64\.b64decode|bytes\.fromhex|codecs\.decode)|FromBase64String/i,
  },
  {
    id: "secret-access",
    severity: "medium",
    title: "Reads secrets, tokens, or credential files",
    pattern: /(process\.env|os\.environ|getenv)\W{0,3}\w*(TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|CREDENTIAL)|JSON\.stringify\(\s*process\.env\s*\)|dict\(\s*os\.environ\s*\)|\.ssh\/id_|\.npmrc|\.aws\/credentials|secrets\.[A-Z_]+/i,
  },
  {
    id: "network-exfil",
    severity: "medium",
    title: "Sends data to a hardcoded external URL or webhook",
    pattern: /(fetch|axios\.post|requests\.post|http\.request|XMLHttpRequest)\s*\(\s*["'`]https?:\/\/(?!(api\.)?github\.com|localhost)|discord(app)?\.com\/api\/webhooks|webhook\.site|pastebin\.com|ngrok\.io|transfer\.sh/i,
  },
  {
    id: "long-encoded-blob",
    severity: "medium",
    title: "Contains a long encoded blob that could hide a payload",
    pattern: /["'`][A-Za-z0-9+/=]{200,}["'`]|(\\x[0-9a-f]{2}){30,}/i,
  },
  {
    id: "workflow-change",
    severity: "medium",
    title: "Modifies a GitHub Actions workflow (can expose repo secrets)",
    pattern: /./,
    files: /^\.github\/workflows\//,
    once: true,
  },
  {
    id: "crypto-miner",
    severity: "high",
    title: "References crypto-mining software or pools",
    pattern: /xmrig|stratum\+tcp|coinhive|cryptonight|minexmr|nicehash/i,
  },
];

// Popular packages that attackers commonly typosquat.
const POPULAR = [
  "express", "react", "lodash", "axios", "chalk", "commander", "request", "moment",
  "webpack", "typescript", "dotenv", "jsonwebtoken", "mongoose", "socket.io", "next",
  "requests", "numpy", "pandas", "flask", "django", "urllib3", "setuptools", "colorama",
  "beautifulsoup4", "cryptography", "boto3", "pillow", "selenium",
];

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

function findTyposquat(line, filename) {
  let name;
  if (/(^|\/)package\.json$/.test(filename)) name = line.match(/^\s*"([@\w./-]+)"\s*:\s*"[\^~]?\d/)?.[1];
  else if (/requirements.*\.txt$/.test(filename)) name = line.match(/^\s*([\w.-]+)\s*(==|>=|~=|$)/)?.[1];
  if (!name) return null;
  name = name.toLowerCase();
  const target = POPULAR.find((p) => p !== name && editDistance(p, name) === 1);
  return target ? { name, target } : null;
}

// Yields [lineNumber, text] for each added line in a unified diff patch.
function* addedLines(patch) {
  let lineNo = 0;
  for (const raw of patch.split("\n")) {
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) {
      lineNo = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith("+") && !raw.startsWith("+++")) yield [lineNo++, raw.slice(1)];
    else if (!raw.startsWith("-")) lineNo++;
  }
}

function scan(files) {
  const flags = [];
  for (const f of files) {
    if (!f.patch) continue;
    for (const rule of RULES) {
      if (rule.files && !rule.files.test(f.filename)) continue;
      for (const [line, text] of addedLines(f.patch)) {
        if (rule.pattern.test(text)) {
          flags.push({ rule: rule.id, severity: rule.severity, title: rule.title, file: f.filename, line, snippet: text.trim().slice(0, 120) });
          if (rule.once) break;
        }
      }
    }
    for (const [line, text] of addedLines(f.patch)) {
      const hit = findTyposquat(text, f.filename);
      if (hit) {
        flags.push({
          rule: "typosquat",
          severity: "high",
          title: `Dependency "${hit.name}" looks like a typosquat of "${hit.target}"`,
          file: f.filename,
          line,
          snippet: text.trim().slice(0, 120),
        });
      }
    }
  }
  return flags;
}

module.exports = { scan };
