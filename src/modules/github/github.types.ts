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
};

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
  lastSyncedAt: string | null;
};

export type IssueSummary = {
  untriaged: number;
  highPriority: number;
  stale: number;
};
