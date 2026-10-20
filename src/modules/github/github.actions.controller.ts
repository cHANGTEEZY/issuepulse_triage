import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { ajApi } from "../../shared/utils/arcjet";
import { handleArcjetDecision } from "../../shared/utils/arcjet-deny";
import type { AppVariables } from "../../shared/types/app.types";
import { githubAppConfigured } from "./github.app";
import { GithubReconnectError } from "./github.user-token";
import { GithubWriteError, githubWrite } from "./github.write";

type GithubContext = Context<{ Variables: AppVariables }>;

const branchName = z
  .string()
  .trim()
  .min(1, "Enter a branch name")
  .max(250)
  .regex(/^(?!\/|.*\/\/|.*\.\.|.*\/$|.*\.lock$)[^\s~^:?*[\\]+$/, "That is not a valid branch name");

const schemas = {
  comment: z.object({ body: z.string().trim().min(1, "Write a comment").max(65_536) }),
  issue: z
    .object({
      state: z.enum(["open", "closed"]).optional(),
      stateReason: z.enum(["completed", "not_planned", "reopened"]).optional(),
      labels: z.array(z.string().min(1).max(100)).max(100).optional(),
      assignees: z.array(z.string().min(1).max(100)).max(10).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, { message: "Provide a field to update" }),
  branch: z.object({ name: branchName, from: z.string().trim().min(1).optional() }),
  commit: z.object({
    path: z.string().trim().min(1, "Choose a file path").max(1_000),
    content: z.string().max(1_000_000, "Files over 1 MB can't be edited here"),
    message: z.string().trim().min(1, "Write a commit message").max(5_000),
    branch: z.string().trim().min(1, "Choose a branch"),
    sha: z.string().min(1).optional(),
  }),
  pull: z.object({
    title: z.string().trim().min(1, "Give the pull request a title").max(256),
    body: z.string().max(65_536).optional(),
    head: z.string().trim().min(1, "Choose the branch with your changes"),
    base: z.string().trim().min(1, "Choose the branch to merge into"),
    draft: z.boolean().optional(),
  }),
  pullPatch: z
    .object({
      title: z.string().trim().min(1).max(256).optional(),
      body: z.string().max(65_536).optional(),
      state: z.enum(["open", "closed"]).optional(),
      base: z.string().trim().min(1).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, { message: "Provide a field to update" }),
  review: z
    .object({
      event: z.enum(["COMMENT", "APPROVE", "REQUEST_CHANGES"]),
      body: z.string().max(65_536).optional(),
    })
    .refine((value) => value.event === "APPROVE" || (value.body ?? "").trim().length > 0, {
      message: "Write a review comment",
    }),
  merge: z.object({
    method: z.enum(["merge", "squash", "rebase"]),
    commitTitle: z.string().max(256).optional(),
    commitMessage: z.string().max(65_536).optional(),
  }),
  status: z.object({
    state: z.enum(["error", "failure", "pending", "success"]),
    context: z.string().trim().min(1, "Name the status context").max(255),
    description: z.string().max(140).optional(),
    targetUrl: z.string().url("Enter a full URL").optional(),
  }),
  rerun: z.object({ failedOnly: z.boolean().optional() }),
};

class ValidationFailure extends Error {}

function fail(c: GithubContext, status: ContentfulStatusCode, code: string, message: string) {
  return c.json(
    { success: false, error: { code, message }, requestId: c.get("requestId") },
    status,
  );
}

async function run<T>(
  c: GithubContext,
  work: () => Promise<T | null>,
  options: { notFound?: string; status?: ContentfulStatusCode } = {},
) {
  const decision = await ajApi.protect(c.req.raw, { correlationId: c.get("requestId") });
  const denied = handleArcjetDecision(c, decision);
  if (denied) return denied;
  if (!githubAppConfigured()) {
    return fail(c, 503, "GITHUB_APP_NOT_CONFIGURED", "GitHub App credentials are required");
  }

  try {
    const data = await work();
    if (data == null) return fail(c, 404, "NOT_FOUND", options.notFound ?? "Not found");
    return c.json({ success: true, data, requestId: c.get("requestId") }, options.status ?? 200);
  } catch (error) {
    if (error instanceof ValidationFailure) return fail(c, 422, "VALIDATION", error.message);
    if (error instanceof GithubReconnectError) {
      return fail(c, 401, "GITHUB_RECONNECT", error.message);
    }
    if (error instanceof GithubWriteError) {
      return fail(c, error.status as ContentfulStatusCode, error.code, error.message);
    }
    return fail(
      c,
      502,
      "GITHUB_WRITE_FAILED",
      error instanceof Error ? error.message : "GitHub request failed",
    );
  }
}

async function input<S extends z.ZodType>(c: GithubContext, schema: S): Promise<z.infer<S>> {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationFailure(parsed.error.issues[0]?.message ?? "Invalid request");
  }
  return parsed.data;
}

function param(c: GithubContext, name: string) {
  return c.req.param(name) ?? "";
}

function number(c: GithubContext, name: string) {
  const value = Number(c.req.param(name));
  if (!Number.isInteger(value) || value <= 0) throw new ValidationFailure(`Invalid ${name}`);
  return value;
}

const ISSUE = { notFound: "Issue not found" };
const REPO = { notFound: "Repository not found" };

export const githubActionsController = {
  issueThread(c: GithubContext) {
    return run(c, () => githubWrite.issueThread(param(c, "id")), ISSUE);
  },

  comment(c: GithubContext) {
    return run(
      c,
      async () => githubWrite.comment(c.req.raw.headers, param(c, "id"), (await input(c, schemas.comment)).body),
      { ...ISSUE, status: 201 },
    );
  },

  updateIssue(c: GithubContext) {
    return run(
      c,
      async () => githubWrite.updateIssue(c.req.raw.headers, param(c, "id"), await input(c, schemas.issue)),
      ISSUE,
    );
  },

  labels(c: GithubContext) {
    return run(c, () => githubWrite.labels(param(c, "id")), REPO);
  },

  assignees(c: GithubContext) {
    return run(c, () => githubWrite.assignees(param(c, "id")), REPO);
  },

  file(c: GithubContext) {
    return run(
      c,
      async () => {
        const path = c.req.query("path") ?? "";
        if (!path) throw new ValidationFailure("Choose a file");
        return githubWrite.file(param(c, "id"), path, c.req.query("ref") || undefined);
      },
      REPO,
    );
  },

  commitFile(c: GithubContext) {
    return run(
      c,
      async () => githubWrite.commitFile(c.req.raw.headers, param(c, "id"), await input(c, schemas.commit)),
      { ...REPO, status: 201 },
    );
  },

  branches(c: GithubContext) {
    return run(c, () => githubWrite.branches(param(c, "id")), REPO);
  },

  createBranch(c: GithubContext) {
    return run(
      c,
      async () => {
        const body = await input(c, schemas.branch);
        return githubWrite.createBranch(c.req.raw.headers, param(c, "id"), body.name, body.from);
      },
      { ...REPO, status: 201 },
    );
  },

  pull(c: GithubContext) {
    return run(c, async () => githubWrite.pull(param(c, "id"), number(c, "number")), {
      notFound: "Pull request not found",
    });
  },

  createPull(c: GithubContext) {
    return run(
      c,
      async () => githubWrite.createPull(c.req.raw.headers, param(c, "id"), await input(c, schemas.pull)),
      { ...REPO, status: 201 },
    );
  },

  updatePull(c: GithubContext) {
    return run(c, async () =>
      githubWrite.updatePull(
        c.req.raw.headers,
        param(c, "id"),
        number(c, "number"),
        await input(c, schemas.pullPatch),
      ),
    );
  },

  reviewPull(c: GithubContext) {
    return run(
      c,
      async () =>
        githubWrite.reviewPull(
          c.req.raw.headers,
          param(c, "id"),
          number(c, "number"),
          await input(c, schemas.review),
        ),
      { status: 201 },
    );
  },

  mergePull(c: GithubContext) {
    return run(c, async () =>
      githubWrite.mergePull(
        c.req.raw.headers,
        param(c, "id"),
        number(c, "number"),
        await input(c, schemas.merge),
      ),
    );
  },

  checks(c: GithubContext) {
    return run(c, () => githubWrite.checks(param(c, "id"), param(c, "ref")), REPO);
  },

  postStatus(c: GithubContext) {
    return run(
      c,
      async () =>
        githubWrite.postStatus(c.req.raw.headers, param(c, "id"), param(c, "ref"), await input(c, schemas.status)),
      { ...REPO, status: 201 },
    );
  },

  workflowRuns(c: GithubContext) {
    return run(c, () => githubWrite.workflowRuns(param(c, "id")), REPO);
  },

  rerun(c: GithubContext) {
    return run(
      c,
      async () => {
        const body = await input(c, schemas.rerun);
        return githubWrite.rerun(c.req.raw.headers, param(c, "id"), number(c, "runId"), body.failedOnly ?? false);
      },
      { ...REPO, status: 201 },
    );
  },
};
