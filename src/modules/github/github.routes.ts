import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { requireAuth } from "../../middleware/require-auth";
import type { AppVariables } from "../../shared/types/app.types";
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
