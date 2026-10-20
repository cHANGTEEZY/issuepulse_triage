import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { requireAuth } from "../../middleware/require-auth";
import type { AppVariables } from "../../shared/types/app.types";
import { githubActionsController } from "./github.actions.controller";
import { githubController } from "./github.controller";

export const githubWebhookRoutes = new Hono<{ Variables: AppVariables }>();

githubWebhookRoutes.post("/", (c) => githubController.webhook(c));

export const githubRoutes = new Hono<{ Variables: AppVariables }>();

const authed = {
  security: [{ cookieAuth: [] }],
  responses: {
    200: { description: "OK" },
    401: { description: "Not authenticated" },
  },
};

githubRoutes.get(
  "/install-url",
  requireAuth(),
  describeRoute({
    tags: ["GitHub"],
    summary: "GitHub App installation URL",
    ...authed,
  }),
  (c) => githubController.installUrl(c),
);

githubRoutes.get(
  "/",
  requireAuth(),
  describeRoute({
    tags: ["GitHub"],
    summary: "List connected repositories",
    ...authed,
  }),
  (c) => githubController.listRepositories(c),
);

githubRoutes.post(
  "/refresh",
  requireAuth(),
  describeRoute({
    tags: ["GitHub"],
    summary: "Refresh repositories from the GitHub App installation",
    ...authed,
  }),
  (c) => githubController.refreshRepositories(c),
);

githubRoutes.get(
  "/:id",
  requireAuth(),
  describeRoute({
    tags: ["GitHub"],
    summary: "Repository overview from GitHub",
    ...authed,
  }),
  (c) => githubController.repositoryOverview(c),
);

githubRoutes.get(
  "/:id/commits",
  requireAuth(),
  describeRoute({
    tags: ["GitHub"],
    summary: "Recent commits on the default branch",
    ...authed,
  }),
  (c) => githubController.repositoryCommits(c),
);

githubRoutes.get(
  "/:id/contents",
  requireAuth(),
  describeRoute({
    tags: ["GitHub"],
    summary: "Files and folders at a path",
    ...authed,
  }),
  (c) => githubController.repositoryContents(c),
);

githubRoutes.get(
  "/:id/tree",
  requireAuth(),
  describeRoute({
    tags: ["GitHub"],
    summary: "Full file tree of the default branch",
    ...authed,
  }),
  (c) => githubController.repositoryTree(c),
);

githubRoutes.get(
  "/:id/pulls",
  requireAuth(),
  describeRoute({
    tags: ["GitHub"],
    summary: "Pull requests",
    ...authed,
  }),
  (c) => githubController.repositoryPulls(c),
);

githubRoutes.post(
  "/:id/sync",
  requireAuth(),
  describeRoute({
    tags: ["GitHub"],
    summary: "Sync repository issues from GitHub",
    ...authed,
  }),
  (c) => githubController.sync(c),
);

export const issueRoutes = new Hono<{ Variables: AppVariables }>();

issueRoutes.get(
  "/summary",
  requireAuth(),
  describeRoute({
    tags: ["Issues"],
    summary: "Triage counts",
    ...authed,
  }),
  (c) => githubController.summary(c),
);

issueRoutes.get(
  "/",
  requireAuth(),
  describeRoute({
    tags: ["Issues"],
    summary: "List issues",
    ...authed,
  }),
  (c) => githubController.listIssues(c),
);

issueRoutes.get(
  "/:id",
  requireAuth(),
  describeRoute({
    tags: ["Issues"],
    summary: "Get an issue",
    ...authed,
  }),
  (c) => githubController.getIssue(c),
);

issueRoutes.patch(
  "/:id/triage",
  requireAuth(),
  describeRoute({
    tags: ["Issues"],
    summary: "Update internal triage",
    ...authed,
  }),
  (c) => githubController.updateTriage(c),
);

const asUser = {
  ...authed,
  description:
    "Runs on GitHub as the signed-in user. Returns 401 with code GITHUB_RECONNECT when their GitHub token is missing or rejected.",
};

function doc(tag: string, summary: string, user = false) {
  return describeRoute({ tags: [tag], summary, ...(user ? asUser : authed) });
}

issueRoutes.get("/:id/github", requireAuth(), doc("Issues", "Live GitHub state, assignees, and comments"), (c) =>
  githubActionsController.issueThread(c),
);

issueRoutes.post("/:id/comments", requireAuth(), doc("Issues", "Comment on the GitHub issue", true), (c) =>
  githubActionsController.comment(c),
);

issueRoutes.patch(
  "/:id/github",
  requireAuth(),
  doc("Issues", "Close, reopen, label, or assign the GitHub issue", true),
  (c) => githubActionsController.updateIssue(c),
);

githubRoutes.get("/:id/labels", requireAuth(), doc("GitHub", "Repository labels"), (c) =>
  githubActionsController.labels(c),
);

githubRoutes.get("/:id/assignees", requireAuth(), doc("GitHub", "People who can be assigned"), (c) =>
  githubActionsController.assignees(c),
);

githubRoutes.get("/:id/file", requireAuth(), doc("GitHub", "One file with its content and sha"), (c) =>
  githubActionsController.file(c),
);

githubRoutes.put("/:id/contents", requireAuth(), doc("GitHub", "Commit a file to a branch", true), (c) =>
  githubActionsController.commitFile(c),
);

githubRoutes.get("/:id/branches", requireAuth(), doc("GitHub", "Branches"), (c) =>
  githubActionsController.branches(c),
);

githubRoutes.post("/:id/branches", requireAuth(), doc("GitHub", "Create a branch", true), (c) =>
  githubActionsController.createBranch(c),
);

githubRoutes.post("/:id/pulls", requireAuth(), doc("GitHub", "Open a pull request", true), (c) =>
  githubActionsController.createPull(c),
);

githubRoutes.get("/:id/pulls/:number", requireAuth(), doc("GitHub", "Pull request with reviews"), (c) =>
  githubActionsController.pull(c),
);

githubRoutes.patch("/:id/pulls/:number", requireAuth(), doc("GitHub", "Edit a pull request", true), (c) =>
  githubActionsController.updatePull(c),
);

githubRoutes.post(
  "/:id/pulls/:number/reviews",
  requireAuth(),
  doc("GitHub", "Review a pull request", true),
  (c) => githubActionsController.reviewPull(c),
);

githubRoutes.put("/:id/pulls/:number/merge", requireAuth(), doc("GitHub", "Merge a pull request", true), (c) =>
  githubActionsController.mergePull(c),
);

githubRoutes.get("/:id/commits/:ref/checks", requireAuth(), doc("GitHub", "Check runs and statuses for a commit"), (c) =>
  githubActionsController.checks(c),
);

githubRoutes.post(
  "/:id/commits/:ref/statuses",
  requireAuth(),
  doc("GitHub", "Post a commit status", true),
  (c) => githubActionsController.postStatus(c),
);

githubRoutes.get("/:id/actions/runs", requireAuth(), doc("GitHub", "Recent workflow runs"), (c) =>
  githubActionsController.workflowRuns(c),
);

githubRoutes.post(
  "/:id/actions/runs/:runId/rerun",
  requireAuth(),
  doc("GitHub", "Re-run a workflow run", true),
  (c) => githubActionsController.rerun(c),
);
