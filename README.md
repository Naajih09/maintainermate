# 🤖 MaintainerMate

**Gemma-powered triage for open-source maintainers.**

Every Hacktoberfest, maintainers get flooded with pull requests, and many of them are low-effort or spam. MaintainerMate is a GitHub Action that reads each new PR and issue with Google's open-weight **Gemma** model, then:

- 🚩 **Scores spam and low-effort PRs** (whitespace-only changes, typo farming, "add my name" PRs)
- 🏷️ **Suggests labels** from *your* label list
- 📝 **Summarizes the change** in plain English
- ✅ **Writes a review checklist** and flags risky changes
- 🌱 **Spots good first issues** and rewrites vague issues as clear, step-by-step tasks

It posts one comment per PR or issue and updates it on later runs, so it doesn't clutter the thread.

## Why Gemma?

Gemma is open-weight, so maintainers aren't locked into a paid API. The same prompts work against a self-hosted Gemma, which keeps triage free and private for small open-source projects.

## Setup (2 minutes)

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. In your repo, go to **Settings → Secrets and variables → Actions** and add `GEMMA_API_KEY`.
3. Add `.github/workflows/maintainermate.yml`:

```yaml
name: MaintainerMate
on:
  pull_request_target:
    types: [opened, edited, reopened, synchronize]
  issues:
    types: [opened, edited, reopened]
permissions:
  issues: write
  pull-requests: write
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: Naajih09/maintainermate@main
        with:
          gemma-api-key: ${{ secrets.GEMMA_API_KEY }}
```

### Options

| Input | Default | Description |
|---|---|---|
| `gemma-api-key` | (required) | Google AI Studio key |
| `model` | `gemma-3-27b-it` | Any Gemma model on the Gemini API |
| `labels` | `bug,enhancement,documentation,question,tests,refactor,dependencies` | Labels Gemma may choose from |
| `spam-threshold` | `70` | Score at or above which `spam-suspected` is added |

## Try it locally

No install needed (zero dependencies, Node 20+):

```bash
export GEMMA_API_KEY=your-key
export GITHUB_TOKEN=$(gh auth token)

# Dry run: prints the triage without posting
node src/cli.js owner/repo pull 123
node src/cli.js owner/repo issue 45

# Post the comment and labels for real
node src/cli.js owner/repo pull 123 --post
```

## Security note

The workflow uses `pull_request_target` so it can comment on PRs from forks. That is safe here because MaintainerMate never checks out or runs PR code; it only reads the diff through the GitHub API.

## License

MIT
