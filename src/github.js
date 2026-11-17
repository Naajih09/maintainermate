// Tiny GitHub REST client using built-in fetch (no dependencies).

const PER_PAGE = 100;
const MAX_PAGES = 30;

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
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`GitHub ${method} ${path.split("?")[0]} failed with status ${res.status}: ${detail}`);
    }
    return res.status === 204 ? null : res.json();
  }

  // Walks every page of a list endpoint, up to MAX_PAGES pages.
  async function paginate(path) {
    const items = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const batch = await gh("GET", `${path}${sep}per_page=${PER_PAGE}&page=${page}`);
      items.push(...batch);
      if (batch.length < PER_PAGE) break;
    }
    return items;
  }

  return {
    getPull: (repo, n) => gh("GET", `/repos/${repo}/pulls/${n}`),
    getPullFiles: (repo, n) => paginate(`/repos/${repo}/pulls/${n}/files`),
    getIssue: (repo, n) => gh("GET", `/repos/${repo}/issues/${n}`),
    listComments: (repo, n) => paginate(`/repos/${repo}/issues/${n}/comments`),
    createComment: (repo, n, body) => gh("POST", `/repos/${repo}/issues/${n}/comments`, { body }),
    updateComment: (repo, id, body) => gh("PATCH", `/repos/${repo}/issues/comments/${id}`, { body }),
    addLabels: (repo, n, labels) => gh("POST", `/repos/${repo}/issues/${n}/labels`, { labels }),
    getViewer: async () => (await gh("GET", "/user")).login,
  };
}

module.exports = { client };
