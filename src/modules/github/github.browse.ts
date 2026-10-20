import { installationAccessToken } from "./github.app";
import { githubRepository } from "./github.repository";
import { API, githubFetch } from "./github.sync";
import type {
  RepositoryCommit,
  RepositoryEntry,
  RepositoryOverview,
  RepositoryPull,
  RepositoryTree,
} from "./github.types";

export class GithubBrowseError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Located = {
  id: string;
  owner: string;
  name: string;
  githubRepoId: number;
  defaultBranch: string | null;
  lastSyncedAt: Date | null;
  token: string;
};

async function locate(repositoryId: string): Promise<Located | null> {
  const found = await githubRepository.findRepository(repositoryId);
  if (!found) return null;
  const token = await installationAccessToken(found.installationId);
  return {
    id: found.repository.id,
    owner: found.repository.owner,
    name: found.repository.name,
    githubRepoId: found.repository.githubRepoId,
    defaultBranch: found.repository.defaultBranch,
    lastSyncedAt: found.repository.lastSyncedAt,
    token,
  };
}

async function readJson<T>(url: string, token: string): Promise<T> {
  const response = await githubFetch(url, token);
  if (!response.ok) {
    const message =
      response.status === 403 || response.status === 404
        ? "GitHub denied this request. The app installation may need the Contents and Pull requests read permissions."
        : `GitHub request failed (${response.status})`;
    throw new GithubBrowseError(response.status, message);
  }
  return (await response.json()) as T;
}

type GithubRepo = {
  full_name: string;
  description: string | null;
  default_branch: string;
  private: boolean;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string | null;
};

type GithubCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name?: string; date?: string } | null;
  };
  author: { login?: string; avatar_url?: string } | null;
};

type GithubContent = {
  name: string;
  path: string;
  type: "dir" | "file" | "symlink" | "submodule";
  size: number;
  html_url: string | null;
};

type GithubPull = {
  number: number;
  title: string;
  state: "open" | "closed";
  draft?: boolean;
  merged_at: string | null;
  user: { login?: string; avatar_url?: string } | null;
  head: { ref: string };
  base: { ref: string };
  html_url: string;
  created_at: string;
  updated_at: string;
};

export const githubBrowse = {
  async overview(repositoryId: string): Promise<RepositoryOverview | null> {
    const located = await locate(repositoryId);
    if (!located) return null;
    const repo = await readJson<GithubRepo>(
      `${API}/repos/${located.owner}/${located.name}`,
      located.token,
    );
    return {
      id: located.id,
      githubRepoId: located.githubRepoId,
      owner: located.owner,
      name: located.name,
      lastSyncedAt: located.lastSyncedAt?.toISOString() ?? null,
      fullName: repo.full_name,
      description: repo.description,
      defaultBranch: repo.default_branch,
      isPrivate: repo.private,
      private: repo.private,
      openIssues: repo.open_issues_count,
      htmlUrl: repo.html_url,
      language: repo.language,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      pushedAt: repo.pushed_at,
    };
  },

  async commits(repositoryId: string, perPage = 30): Promise<RepositoryCommit[] | null> {
    const located = await locate(repositoryId);
    if (!located) return null;
    const commits = await readJson<GithubCommit[]>(
      `${API}/repos/${located.owner}/${located.name}/commits?per_page=${perPage}`,
      located.token,
    );
    return commits.map((commit) => ({
      sha: commit.sha,
      shortSha: commit.sha.slice(0, 7),
      message: commit.commit.message,
      authorName: commit.commit.author?.name ?? commit.author?.login ?? "Unknown",
      authorLogin: commit.author?.login ?? null,
      authorAvatarUrl: commit.author?.avatar_url ?? null,
      date: commit.commit.author?.date ?? null,
      htmlUrl: commit.html_url,
    }));
  },

  async contents(repositoryId: string, path: string): Promise<RepositoryEntry[] | null> {
    const located = await locate(repositoryId);
    if (!located) return null;
    const clean = path
      .split("/")
      .filter((part) => part.length > 0 && part !== "." && part !== "..")
      .map((part) => encodeURIComponent(part))
      .join("/");
    const body = await readJson<GithubContent | GithubContent[]>(
      `${API}/repos/${located.owner}/${located.name}/contents/${clean}`,
      located.token,
    );
    const entries = Array.isArray(body) ? body : [body];
    return entries
      .map((entry) => ({
        name: entry.name,
        path: entry.path,
        type: entry.type,
        size: entry.size,
        htmlUrl: entry.html_url,
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  },

  async tree(repositoryId: string, ref = ""): Promise<RepositoryTree | null> {
    const located = await locate(repositoryId);
    if (!located) return null;
    const branch =
      ref ||
      located.defaultBranch ||
      (
        await readJson<GithubRepo>(
          `${API}/repos/${located.owner}/${located.name}`,
          located.token,
        )
      ).default_branch;
    const response = await githubFetch(
      `${API}/repos/${located.owner}/${located.name}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      located.token,
    );
    if (response.status === 409) return { truncated: false, entries: [] };
    if (!response.ok) {
      const message =
        response.status === 403 || response.status === 404
          ? "GitHub denied this request. The app installation may need the Contents and Pull requests read permissions."
          : `GitHub request failed (${response.status})`;
      throw new GithubBrowseError(response.status, message);
    }
    const body = (await response.json()) as {
      truncated?: boolean;
      tree?: Array<{ path?: string; type?: string; size?: number }>;
    };
    return {
      truncated: body.truncated === true,
      entries: (body.tree ?? []).flatMap((item) => {
        if (!item.path) return [];
        const type =
          item.type === "tree" ? "dir" : item.type === "commit" ? "submodule" : "file";
        return [{ path: item.path, type, size: item.size ?? 0 }];
      }),
    };
  },

  async pulls(repositoryId: string): Promise<RepositoryPull[] | null> {
    const located = await locate(repositoryId);
    if (!located) return null;
    const pulls = await readJson<GithubPull[]>(
      `${API}/repos/${located.owner}/${located.name}/pulls?state=all&per_page=50&sort=updated&direction=desc`,
      located.token,
    );
    return pulls.map((pull) => ({
      number: pull.number,
      title: pull.title,
      state: pull.state,
      merged: pull.merged_at != null,
      draft: pull.draft ?? false,
      authorLogin: pull.user?.login ?? "ghost",
      authorAvatarUrl: pull.user?.avatar_url ?? null,
      headRef: pull.head.ref,
      baseRef: pull.base.ref,
      htmlUrl: pull.html_url,
      createdAt: pull.created_at,
      updatedAt: pull.updated_at,
    }));
  },
};
