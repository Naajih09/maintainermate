// Tiny GitHub REST client using built-in fetch (no dependencies).

function client(token) {
  async function gh(method, path, body) {
    const res = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "maintainermate",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`GitHub ${method} ${path} -> ${res.status}: ${await res.text()}`);
    }
    return res.status === 204 ? null : res.json();
  }

  return {
    getPull: (repo, n) => gh("GET", `/repos/${repo}/pulls/${n}`),
    getPullFiles: (repo, n) => gh("GET", `/repos/${repo}/pulls/${n}/files?per_page=100`),
    getIssue: (repo, n) => gh("GET", `/repos/${repo}/issues/${n}`),
    listComments: (repo, n) => gh("GET", `/repos/${repo}/issues/${n}/comments?per_page=100`),
    createComment: (repo, n, body) => gh("POST", `/repos/${repo}/issues/${n}/comments`, { body }),
    updateComment: (repo, id, body) => gh("PATCH", `/repos/${repo}/issues/comments/${id}`, { body }),
    addLabels: (repo, n, labels) => gh("POST", `/repos/${repo}/issues/${n}/labels`, { labels }),
  };
}

module.exports = { client };
