import { installationAccessToken } from "./github.app";
import { githubRepository } from "./github.repository";
import type { GithubIssue } from "./github.types";

const API = "https://api.github.com";

function nextPage(link: string | null) {
  if (!link) return null;
  const part = link.split(",").find((item) => item.includes('rel="next"'));
  return part?.match(/<([^>]+)>/)?.[1] ?? null;
}

async function githubFetch(url: string, token: string, attempt = 0): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "IssueNest",
    },
  });

  const remaining = response.headers.get("x-ratelimit-remaining");
  const limited = response.status === 429 || (response.status === 403 && remaining === "0");
  if (!limited || attempt >= 2) return response;

  const retryAfter = response.headers.get("retry-after");
  const reset = response.headers.get("x-ratelimit-reset");
  const waitMs = retryAfter
    ? Number(retryAfter) * 1000
    : reset
      ? Math.max(0, Number(reset) * 1000 - Date.now())
      : 1000;

  await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 60_000)));
  return githubFetch(url, token, attempt + 1);
}

export async function syncRepository(repositoryId: string) {
  const found = await githubRepository.findRepository(repositoryId);
  if (!found) return null;

  const token = await installationAccessToken(found.installationId);
  let url: string | null =
    `${API}/repos/${found.repository.owner}/${found.repository.name}/issues?state=all&per_page=100`;

  while (url) {
    const response = await githubFetch(url, token);
    if (!response.ok) {
      throw new Error(`GitHub sync failed (${response.status})`);
    }

    const issues = (await response.json()) as GithubIssue[];
    for (const issue of issues) {
      await githubRepository.upsertIssue(found.repository.id, issue);
    }

    url = nextPage(response.headers.get("link"));
  }

  await githubRepository.markSynced(repositoryId);
  return githubRepository.findRepository(repositoryId);
}
