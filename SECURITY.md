# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a vulnerability

Please do not open a public issue for security problems.

Report vulnerabilities privately through GitHub's private vulnerability reporting: go to the **Security** tab of this repository and choose **Report a vulnerability**. If that isn't available, email naajihsiraj@gmail.com with the subject line "MaintainerMate security report".

Please include:
- A description of the issue and its impact
- Steps to reproduce, or a proof of concept
- The version or commit you tested

You can expect an acknowledgment within 72 hours and an initial assessment within 7 days. We'll keep you updated until the issue is fixed, and we're happy to credit you in the release notes if you'd like.

## Scope

In scope: the GitHub Action, the local CLI, the static scanner, and the prompt-handling code.

Out of scope: false positives or false negatives from the heuristic scanner, unless they come from a bypass that a more careful attacker could use to hide malware. Those are welcome as bug reports or pull requests.
