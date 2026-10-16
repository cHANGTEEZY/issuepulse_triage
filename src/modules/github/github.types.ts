export const TRIAGE_STATUSES = [
  "inbox",
  "investigating",
  "planned",
  "blocked",
  "done",
] as const;

export const TRIAGE_PRIORITIES = [
  "critical",
  "high",
  "medium",
  "low",
] as const;

export type TriageStatus = (typeof TRIAGE_STATUSES)[number];
export type TriagePriority = (typeof TRIAGE_PRIORITIES)[number];

export type GithubUser = {
  login?: string;
  avatar_url?: string;
  type?: string;
};

export type GithubLabel = {
  name?: string;
  color?: string;
};

export type GithubRepository = {
  id: number;
  name: string;
  full_name?: string;
  private?: boolean;
  description?: string | null;
  default_branch?: string;
  language?: string | null;
  open_issues_count?: number;
  pushed_at?: string | null;
};

export type RepositoryMetadata = {
  isPrivate: boolean;
  description: string | null;
  defaultBranch: string | null;
  language: string | null;
  openIssues: number;
  pushedAt: Date | null;
};

export function repositoryMetadata(repo: GithubRepository): RepositoryMetadata {
  return {
    isPrivate: repo.private ?? false,
    description: repo.description ?? null,
    defaultBranch: repo.default_branch ?? null,
    language: repo.language ?? null,
    openIssues: repo.open_issues_count ?? 0,
    pushedAt: repo.pushed_at ? new Date(repo.pushed_at) : null,
  };
}

export type GithubIssue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  user: GithubUser | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  labels?: Array<GithubLabel | string>;
  pull_request?: unknown;
};

export type GithubInstallation = {
  id: number;
  account?: GithubUser;
};

export type InstallationEvent = {
  action?: string;
  installation?: GithubInstallation;
  repositories?: GithubRepository[];
};

export type InstallationRepositoriesEvent = {
  action?: string;
  installation?: GithubInstallation;
  repositories_added?: GithubRepository[];
  repositories_removed?: GithubRepository[];
};

export type IssuesEvent = {
  action?: string;
  installation?: GithubInstallation;
  repository?: GithubRepository;
  issue?: GithubIssue;
};

export type IssueCommentEvent = {
  action?: string;
  installation?: GithubInstallation;
  repository?: GithubRepository;
  issue?: GithubIssue;
};

export type IssueLabel = {
  name: string;
  color: string;
};

export type IssueOwner = {
  id: string;
  name: string;
  image: string | null;
};

export type IssueRecord = {
  id: string;
  number: number;
  title: string;
  body: string | null;
  state: string;
  authorLogin: string;
  authorAvatarUrl: string | null;
  htmlUrl: string;
  isPullRequest: boolean;
  githubCreatedAt: string;
  githubUpdatedAt: string;
  repository: {
    id: string;
    owner: string;
    name: string;
  };
  labels: IssueLabel[];
  triage: {
    status: TriageStatus;
    priority: TriagePriority;
    notes: string;
    owner: IssueOwner | null;
  };
};

export type RepositoryRecord = {
  id: string;
  githubRepoId: number;
  owner: string;
  name: string;
  isPrivate: boolean;
  description: string | null;
  defaultBranch: string | null;
  language: string | null;
  openIssues: number;
  pushedAt: string | null;
  lastSyncedAt: string | null;
};

export type IssueSummary = {
  untriaged: number;
  highPriority: number;
  stale: number;
};

export type RepositoryOverview = RepositoryRecord & {
  fullName: string;
  description: string | null;
  defaultBranch: string;
  private: boolean;
  htmlUrl: string;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  pushedAt: string | null;
};

export type RepositoryCommit = {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  date: string | null;
  htmlUrl: string;
};

export type RepositoryEntry = {
  name: string;
  path: string;
  type: "dir" | "file" | "symlink" | "submodule";
  size: number;
  htmlUrl: string | null;
};

export type RepositoryPull = {
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  authorLogin: string;
  authorAvatarUrl: string | null;
  headRef: string;
  baseRef: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
};
