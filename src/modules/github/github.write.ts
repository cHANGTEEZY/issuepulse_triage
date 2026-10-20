import { installationAccessToken } from "./github.app";
import { githubRepository } from "./github.repository";
import { API } from "./github.sync";
import type {
  CheckRun,
  CommitChecks,
  CommitResult,
  CommitStatus,
  GithubIssue,
  GithubPerson,
  IssueComment,
  IssueThread,
  PullDetail,
  PullReview,
  RepositoryBranch,
  RepositoryFile,
  RepositoryLabel,
  WorkflowRun,
} from "./github.types";
import { GithubReconnectError, userGithubToken } from "./github.user-token";

export class GithubWriteError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT";

type GithubErrorBody = {
  message?: string;
  errors?: Array<{ message?: string; code?: string; field?: string } | string>;
};

function errorDetail(body: GithubErrorBody | null) {
  const first = body?.errors?.[0];
  const extra = typeof first === "string" ? first : first?.message;
  if (body?.message && extra) return `${body.message}: ${extra}`;
  return body?.message ?? extra ?? null;
}

async function send<T>(
  token: string,
  method: Method,
  path: string,
  options: { body?: unknown; asUser?: boolean } = {},
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "IssueNest",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.ok) {
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  const body = (await response.json().catch(() => null)) as GithubErrorBody | null;
  const detail = errorDetail(body);

  if (response.status === 401 && options.asUser) throw new GithubReconnectError();
  if (response.status === 403) {
    const missing = detail?.includes("Resource not accessible");
    throw new GithubWriteError(
      403,
      "GITHUB_FORBIDDEN",
      missing
        ? "GitHub denied this. The GitHub App needs the matching permission, and you need access to this repository."
        : (detail ?? "GitHub denied this request"),
    );
  }
  if (response.status === 404) {
    throw new GithubWriteError(
      404,
      "GITHUB_NOT_FOUND",
      detail && detail !== "Not Found"
        ? detail
        : "GitHub could not find this, or the App lacks permission for it",
    );
  }
  if (response.status === 405 || response.status === 409) {
    throw new GithubWriteError(409, "GITHUB_CONFLICT", detail ?? "GitHub reported a conflict");
  }
  if (response.status === 422) {
    throw new GithubWriteError(422, "VALIDATION", detail ?? "GitHub rejected the change");
  }
  throw new GithubWriteError(502, "GITHUB_WRITE_FAILED", detail ?? `GitHub request failed (${response.status})`);
}

function cleanPath(path: string) {
  return path
    .split("/")
    .filter((part) => part.length > 0 && part !== "." && part !== "..")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function person(user: { login?: string; avatar_url?: string } | null | undefined): GithubPerson {
  return { login: user?.login ?? "ghost", avatarUrl: user?.avatar_url ?? null };
}

type Target = {
  id: string;
  slug: string;
  installationId: number;
  defaultBranch: string | null;
};

async function repo(repositoryId: string): Promise<Target | null> {
  const found = await githubRepository.findRepository(repositoryId);
  if (!found) return null;
  return {
    id: found.repository.id,
    slug: `/repos/${found.repository.owner}/${found.repository.name}`,
    installationId: found.installationId,
    defaultBranch: found.repository.defaultBranch,
  };
}

async function issueTarget(issueId: string) {
  const issue = await githubRepository.getIssue(issueId);
  if (!issue) return null;
  const target = await repo(issue.repository.id);
  if (!target) return null;
  return { issue, target, path: `${target.slug}/issues/${issue.number}` };
}

function appToken(target: Target) {
  return installationAccessToken(target.installationId);
}

async function defaultBranch(target: Target, token: string) {
  if (target.defaultBranch) return target.defaultBranch;
  const body = await send<{ default_branch: string }>(token, "GET", target.slug);
  return body.default_branch;
}

type GithubComment = {
  id: number;
  body?: string;
  user: { login?: string; avatar_url?: string } | null;
  created_at: string;
  updated_at: string;
  html_url: string;
};

type GithubIssueDetail = GithubIssue & {
  state_reason?: string | null;
  assignees?: Array<{ login?: string; avatar_url?: string }>;
};

function toComment(comment: GithubComment): IssueComment {
  return {
    id: comment.id,
    body: comment.body ?? "",
    author: person(comment.user),
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    htmlUrl: comment.html_url,
  };
}

type GithubPullDetail = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  merged: boolean;
  mergeable: boolean | null;
  mergeable_state?: string;
  draft?: boolean;
  user: { login?: string; avatar_url?: string } | null;
  head: { ref: string; sha: string };
  base: { ref: string };
  additions: number;
  deletions: number;
  changed_files: number;
  commits: number;
  html_url: string;
  created_at: string;
  updated_at: string;
};

type GithubReview = {
  id: number;
  state: string;
  body: string | null;
  user: { login?: string; avatar_url?: string } | null;
  submitted_at?: string | null;
};

export type IssuePatch = {
  state?: "open" | "closed";
  stateReason?: "completed" | "not_planned" | "reopened";
  labels?: string[];
  assignees?: string[];
};

export type CommitInput = {
  path: string;
  content: string;
  message: string;
  branch: string;
  sha?: string;
};

export type PullInput = {
  title: string;
  body?: string;
  head: string;
  base: string;
  draft?: boolean;
};

export type PullPatch = {
  title?: string;
  body?: string;
  state?: "open" | "closed";
  base?: string;
};

export type ReviewInput = {
  event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
  body?: string;
};

export type MergeInput = {
  method: "merge" | "squash" | "rebase";
  commitTitle?: string;
  commitMessage?: string;
};

export type StatusInput = {
  state: "error" | "failure" | "pending" | "success";
  context: string;
  description?: string;
  targetUrl?: string;
};

export const githubWrite = {
  async issueThread(issueId: string): Promise<IssueThread | null> {
    const found = await issueTarget(issueId);
    if (!found) return null;
    const token = await appToken(found.target);
    const [issue, comments] = await Promise.all([
      send<GithubIssueDetail>(token, "GET", found.path),
      send<GithubComment[]>(token, "GET", `${found.path}/comments?per_page=100`),
    ]);
    return {
      state: issue.state === "closed" ? "closed" : "open",
      stateReason: issue.state_reason ?? null,
      assignees: (issue.assignees ?? []).map(person),
      labels: found.issue.labels,
      comments: comments.map(toComment),
    };
  },

  async comment(headers: Headers, issueId: string, body: string) {
    const found = await issueTarget(issueId);
    if (!found) return null;
    const token = await userGithubToken(headers);
    const comment = await send<GithubComment>(token, "POST", `${found.path}/comments`, {
      body: { body },
      asUser: true,
    });
    await githubRepository.touchIssue(found.target.id, found.issue.number, new Date(comment.created_at));
    return toComment(comment);
  },

  async updateIssue(headers: Headers, issueId: string, patch: IssuePatch) {
    const found = await issueTarget(issueId);
    if (!found) return null;
    const token = await userGithubToken(headers);
    const issue = await send<GithubIssue>(token, "PATCH", found.path, {
      body: {
        state: patch.state,
        state_reason: patch.stateReason,
        labels: patch.labels,
        assignees: patch.assignees,
      },
      asUser: true,
    });
    await githubRepository.upsertIssue(found.target.id, issue);
    return githubRepository.getIssue(issueId);
  },

  async labels(repositoryId: string): Promise<RepositoryLabel[] | null> {
    const target = await repo(repositoryId);
    if (!target) return null;
    const token = await appToken(target);
    const labels = await send<Array<{ name: string; color: string; description: string | null }>>(
      token,
      "GET",
      `${target.slug}/labels?per_page=100`,
    );
    return labels.map((label) => ({
      name: label.name,
      color: label.color,
      description: label.description,
    }));
  },

  async assignees(repositoryId: string): Promise<GithubPerson[] | null> {
    const target = await repo(repositoryId);
    if (!target) return null;
    const token = await appToken(target);
    const people = await send<Array<{ login?: string; avatar_url?: string }>>(
      token,
      "GET",
      `${target.slug}/assignees?per_page=100`,
    );
    return people.map(person);
  },

  async file(repositoryId: string, path: string, ref?: string): Promise<RepositoryFile | null> {
    const target = await repo(repositoryId);
    if (!target) return null;
    const token = await appToken(target);
    const branch = ref || (await defaultBranch(target, token));
    const body = await send<{
      type: string;
      name: string;
      path: string;
      sha: string;
      size: number;
      encoding?: string;
      content?: string;
      html_url: string | null;
    }>(token, "GET", `${target.slug}/contents/${cleanPath(path)}?ref=${encodeURIComponent(branch)}`);

    if (body.type !== "file") {
      throw new GithubWriteError(422, "VALIDATION", "This path is not a file");
    }

    const tooLarge = body.encoding !== "base64" || body.content == null;
    const bytes = tooLarge ? null : Buffer.from(body.content ?? "", "base64");
    const binary = bytes ? bytes.includes(0) : false;

    return {
      name: body.name,
      path: body.path,
      sha: body.sha,
      size: body.size,
      ref: branch,
      binary,
      tooLarge,
      content: bytes && !binary ? bytes.toString("utf8") : null,
      htmlUrl: body.html_url,
    };
  },

  async branches(repositoryId: string): Promise<RepositoryBranch[] | null> {
    const target = await repo(repositoryId);
    if (!target) return null;
    const token = await appToken(target);
    const [main, branches] = await Promise.all([
      defaultBranch(target, token),
      send<Array<{ name: string; commit: { sha: string }; protected: boolean }>>(
        token,
        "GET",
        `${target.slug}/branches?per_page=100`,
      ),
    ]);
    return branches
      .map((branch) => ({
        name: branch.name,
        sha: branch.commit.sha,
        protected: branch.protected,
        isDefault: branch.name === main,
      }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  },

  async createBranch(headers: Headers, repositoryId: string, name: string, from?: string) {
    const target = await repo(repositoryId);
    if (!target) return null;
    const token = await userGithubToken(headers);
    const source = from || (await defaultBranch(target, await appToken(target)));
    const ref = await send<{ object: { sha: string } }>(
      token,
      "GET",
      `${target.slug}/git/ref/heads/${cleanPath(source)}`,
      { asUser: true },
    );
    await send(token, "POST", `${target.slug}/git/refs`, {
      body: { ref: `refs/heads/${name}`, sha: ref.object.sha },
      asUser: true,
    });
    return { name, sha: ref.object.sha, protected: false, isDefault: false } satisfies RepositoryBranch;
  },

  async commitFile(headers: Headers, repositoryId: string, input: CommitInput): Promise<CommitResult | null> {
    const target = await repo(repositoryId);
    if (!target) return null;
    const token = await userGithubToken(headers);
    const body = await send<{
      content: { sha: string };
      commit: { sha: string; html_url: string };
    }>(token, "PUT", `${target.slug}/contents/${cleanPath(input.path)}`, {
      body: {
        message: input.message,
        content: Buffer.from(input.content, "utf8").toString("base64"),
        branch: input.branch,
        sha: input.sha,
      },
      asUser: true,
    });
    return {
      commitSha: body.commit.sha,
      fileSha: body.content.sha,
      branch: input.branch,
      htmlUrl: body.commit.html_url,
    };
  },

  async pull(repositoryId: string, number: number): Promise<PullDetail | null> {
    const target = await repo(repositoryId);
    if (!target) return null;
    const token = await appToken(target);
    const [pull, reviews] = await Promise.all([
      send<GithubPullDetail>(token, "GET", `${target.slug}/pulls/${number}`),
      send<GithubReview[]>(token, "GET", `${target.slug}/pulls/${number}/reviews?per_page=100`),
    ]);
    return {
      number: pull.number,
      title: pull.title,
      body: pull.body ?? "",
      state: pull.state,
      merged: pull.merged,
      mergeable: pull.mergeable,
      mergeableState: pull.mergeable_state ?? null,
      draft: pull.draft ?? false,
      author: person(pull.user),
      headRef: pull.head.ref,
      headSha: pull.head.sha,
      baseRef: pull.base.ref,
      additions: pull.additions,
      deletions: pull.deletions,
      changedFiles: pull.changed_files,
      commits: pull.commits,
      htmlUrl: pull.html_url,
      createdAt: pull.created_at,
      updatedAt: pull.updated_at,
      reviews: reviews.map(
        (review): PullReview => ({
          id: review.id,
          state: review.state,
          body: review.body ?? "",
          author: person(review.user),
          submittedAt: review.submitted_at ?? null,
        }),
      ),
    };
  },

  async createPull(headers: Headers, repositoryId: string, input: PullInput) {
    const target = await repo(repositoryId);
    if (!target) return null;
    const token = await userGithubToken(headers);
    const pull = await send<{ number: number }>(token, "POST", `${target.slug}/pulls`, {
      body: input,
      asUser: true,
    });
    return this.pull(repositoryId, pull.number);
  },

  async updatePull(headers: Headers, repositoryId: string, number: number, patch: PullPatch) {
    const target = await repo(repositoryId);
    if (!target) return null;
    const token = await userGithubToken(headers);
    await send(token, "PATCH", `${target.slug}/pulls/${number}`, { body: patch, asUser: true });
    return this.pull(repositoryId, number);
  },

  async reviewPull(headers: Headers, repositoryId: string, number: number, input: ReviewInput) {
    const target = await repo(repositoryId);
    if (!target) return null;
    const token = await userGithubToken(headers);
    await send(token, "POST", `${target.slug}/pulls/${number}/reviews`, {
      body: { event: input.event, body: input.body },
      asUser: true,
    });
    return this.pull(repositoryId, number);
  },

  async mergePull(headers: Headers, repositoryId: string, number: number, input: MergeInput) {
    const target = await repo(repositoryId);
    if (!target) return null;
    const token = await userGithubToken(headers);
    await send(token, "PUT", `${target.slug}/pulls/${number}/merge`, {
      body: {
        merge_method: input.method,
        commit_title: input.commitTitle,
        commit_message: input.commitMessage,
      },
      asUser: true,
    });
    return this.pull(repositoryId, number);
  },

  async checks(repositoryId: string, ref: string): Promise<CommitChecks | null> {
    const target = await repo(repositoryId);
    if (!target) return null;
    const token = await appToken(target);
    const safeRef = encodeURIComponent(ref);
    const [runs, combined] = await Promise.all([
      send<{
        check_runs: Array<{
          id: number;
          name: string;
          status: string;
          conclusion: string | null;
          html_url: string | null;
          started_at: string | null;
          completed_at: string | null;
        }>;
      }>(token, "GET", `${target.slug}/commits/${safeRef}/check-runs?per_page=100`),
      send<{
        sha: string;
        state: string;
        statuses: Array<{
          id: number;
          context: string;
          state: string;
          description: string | null;
          target_url: string | null;
          created_at: string;
        }>;
      }>(token, "GET", `${target.slug}/commits/${safeRef}/status`),
    ]);
    return {
      sha: combined.sha,
      state: combined.state,
      checkRuns: runs.check_runs.map(
        (run): CheckRun => ({
          id: run.id,
          name: run.name,
          status: run.status,
          conclusion: run.conclusion,
          htmlUrl: run.html_url,
          startedAt: run.started_at,
          completedAt: run.completed_at,
        }),
      ),
      statuses: combined.statuses.map(
        (status): CommitStatus => ({
          id: status.id,
          context: status.context,
          state: status.state,
          description: status.description,
          targetUrl: status.target_url,
          createdAt: status.created_at,
        }),
      ),
    };
  },

  async postStatus(headers: Headers, repositoryId: string, sha: string, input: StatusInput) {
    const target = await repo(repositoryId);
    if (!target) return null;
    const token = await userGithubToken(headers);
    await send(token, "POST", `${target.slug}/statuses/${encodeURIComponent(sha)}`, {
      body: {
        state: input.state,
        context: input.context,
        description: input.description,
        target_url: input.targetUrl,
      },
      asUser: true,
    });
    return this.checks(repositoryId, sha);
  },

  async workflowRuns(repositoryId: string): Promise<WorkflowRun[] | null> {
    const target = await repo(repositoryId);
    if (!target) return null;
    const token = await appToken(target);
    const body = await send<{
      workflow_runs: Array<{
        id: number;
        name: string | null;
        display_title?: string;
        event: string;
        status: string | null;
        conclusion: string | null;
        head_branch: string | null;
        head_sha: string;
        run_number: number;
        actor: { login?: string; avatar_url?: string } | null;
        html_url: string;
        created_at: string;
        updated_at: string;
      }>;
    }>(token, "GET", `${target.slug}/actions/runs?per_page=30`);
    return body.workflow_runs.map((run) => ({
      id: run.id,
      name: run.name ?? "Workflow",
      title: run.display_title ?? run.name ?? "Workflow run",
      event: run.event,
      status: run.status ?? "unknown",
      conclusion: run.conclusion,
      branch: run.head_branch ?? "",
      headSha: run.head_sha,
      runNumber: run.run_number,
      actor: person(run.actor),
      htmlUrl: run.html_url,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
    }));
  },

  async rerun(headers: Headers, repositoryId: string, runId: number, failedOnly: boolean) {
    const target = await repo(repositoryId);
    if (!target) return null;
    const token = await userGithubToken(headers);
    await send(
      token,
      "POST",
      `${target.slug}/actions/runs/${runId}/${failedOnly ? "rerun-failed-jobs" : "rerun"}`,
      { asUser: true },
    );
    return { runId, queued: true };
  },
};
