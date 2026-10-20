import type { Context } from "hono";
import { z } from "zod";
import { env } from "../../config/env";
import { ajApi } from "../../shared/utils/arcjet";
import { handleArcjetDecision } from "../../shared/utils/arcjet-deny";
import type { AppVariables } from "../../shared/types/app.types";
import { githubAppConfigured } from "./github.app";
import { GithubBrowseError, githubBrowse } from "./github.browse";
import { githubRepository } from "./github.repository";
import { githubService } from "./github.service";
import { verifyGithubSignature } from "./github.signature";
import { handleGithubEvent } from "./github.webhook";
import { TRIAGE_PRIORITIES, TRIAGE_STATUSES } from "./github.types";

type GithubContext = Context<{ Variables: AppVariables }>;

const triagePatch = z
  .object({
    status: z.enum(TRIAGE_STATUSES).optional(),
    priority: z.enum(TRIAGE_PRIORITIES).optional(),
    ownerId: z.string().nullable().optional(),
    notes: z.string().max(20_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide a triage field to update",
  });

async function guard(c: GithubContext) {
  const decision = await ajApi.protect(c.req.raw, {
    correlationId: c.get("requestId"),
  });
  return handleArcjetDecision(c, decision);
}

async function browse<T>(
  c: GithubContext,
  load: (id: string) => Promise<T | null>,
) {
  const denied = await guard(c);
  if (denied) return denied;
  if (!githubAppConfigured()) {
    return c.json(
      {
        success: false,
        error: {
          code: "GITHUB_APP_NOT_CONFIGURED",
          message: "GitHub App credentials are required to read repositories",
        },
        requestId: c.get("requestId"),
      },
      503,
    );
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Repository not found" },
        requestId: c.get("requestId"),
      },
      404,
    );
  }

  try {
    const data = await load(id);
    if (data == null) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Repository not found" },
          requestId: c.get("requestId"),
        },
        404,
      );
    }
    return c.json({ success: true, data, requestId: c.get("requestId") });
  } catch (error) {
    const status = error instanceof GithubBrowseError ? error.status : 502;
    return c.json(
      {
        success: false,
        error: {
          code: "GITHUB_READ_FAILED",
          message: error instanceof Error ? error.message : "GitHub request failed",
        },
        requestId: c.get("requestId"),
      },
      status === 403 || status === 404 ? 403 : 502,
    );
  }
}

function priorities(value: string | undefined) {
  if (!value) return undefined;
  const parsed = value
    .split(",")
    .filter((item): item is (typeof TRIAGE_PRIORITIES)[number] =>
      (TRIAGE_PRIORITIES as readonly string[]).includes(item),
    );
  return parsed.length > 0 ? parsed : undefined;
}

export const githubController = {
  async webhook(c: GithubContext) {
    const raw = await c.req.text();
    if (
      !verifyGithubSignature(
        raw,
        c.req.header("x-hub-signature-256"),
        env.GITHUB_WEBHOOK_SECRET,
      )
    ) {
      return c.json({ ok: false }, 401);
    }

    const delivery = c.req.header("x-github-delivery");
    const event = c.req.header("x-github-event");
    if (!delivery || !event) return c.json({ ok: false }, 400);

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return c.json({ ok: false }, 400);
    }

    const claimed = await githubRepository.claimDelivery(delivery, event);
    if (!claimed) return c.json({ ok: true, duplicate: true });

    await handleGithubEvent(event, payload);
    return c.json({ ok: true });
  },

  async installUrl(c: GithubContext) {
    const denied = await guard(c);
    if (denied) return denied;
    const url = githubService.installUrl();
    if (!url) {
      return c.json(
        {
          success: false,
          error: {
            code: "GITHUB_APP_NOT_CONFIGURED",
            message: "Set GITHUB_APP_SLUG to connect repositories",
          },
          requestId: c.get("requestId"),
        },
        503,
      );
    }
    return c.json({ success: true, data: { url }, requestId: c.get("requestId") });
  },

  async refreshRepositories(c: GithubContext) {
    const denied = await guard(c);
    if (denied) return denied;
    if (!githubAppConfigured()) {
      return c.json(
        {
          success: false,
          error: {
            code: "GITHUB_APP_NOT_CONFIGURED",
            message: "GitHub App credentials are required to refresh repositories",
          },
          requestId: c.get("requestId"),
        },
        503,
      );
    }

    try {
      await githubService.refreshConnectedRepositories();
      const data = await githubService.listRepositories();
      return c.json({ success: true, data, requestId: c.get("requestId") });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: {
            code: "REFRESH_FAILED",
            message: error instanceof Error ? error.message : "Refresh failed",
          },
          requestId: c.get("requestId"),
        },
        502,
      );
    }
  },

  async listRepositories(c: GithubContext) {
    const denied = await guard(c);
    if (denied) return denied;
    const data = await githubService.listRepositories();
    return c.json({ success: true, data, requestId: c.get("requestId") });
  },

  async sync(c: GithubContext) {
    const denied = await guard(c);
    if (denied) return denied;
    if (!githubAppConfigured()) {
      return c.json(
        {
          success: false,
          error: {
            code: "GITHUB_APP_NOT_CONFIGURED",
            message: "GitHub App credentials are required to sync",
          },
          requestId: c.get("requestId"),
        },
        503,
      );
    }

    const id = c.req.param("id");
    if (!id) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Repository not found" },
          requestId: c.get("requestId"),
        },
        404,
      );
    }

    try {
      const synced = await githubService.sync(id);
      if (!synced) {
        return c.json(
          {
            success: false,
            error: { code: "NOT_FOUND", message: "Repository not found" },
            requestId: c.get("requestId"),
          },
          404,
        );
      }
      const repositories = await githubService.listRepositories();
      const data = repositories.find((repo) => repo.id === id);
      return c.json({ success: true, data, requestId: c.get("requestId") });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: {
            code: "SYNC_FAILED",
            message: error instanceof Error ? error.message : "Sync failed",
          },
          requestId: c.get("requestId"),
        },
        502,
      );
    }
  },

  repositoryOverview(c: GithubContext) {
    return browse(c, (id) => githubBrowse.overview(id));
  },

  repositoryCommits(c: GithubContext) {
    return browse(c, (id) => githubBrowse.commits(id));
  },

  repositoryContents(c: GithubContext) {
    const path = c.req.query("path") ?? "";
    return browse(c, (id) => githubBrowse.contents(id, path));
  },

  repositoryTree(c: GithubContext) {
    const ref = c.req.query("ref") ?? "";
    return browse(c, (id) => githubBrowse.tree(id, ref));
  },

  repositoryPulls(c: GithubContext) {
    return browse(c, (id) => githubBrowse.pulls(id));
  },

  async summary(c: GithubContext) {
    const denied = await guard(c);
    if (denied) return denied;
    const data = await githubService.summary();
    return c.json({ success: true, data, requestId: c.get("requestId") });
  },

  async listIssues(c: GithubContext) {
    const denied = await guard(c);
    if (denied) return denied;
    const status = c.req.query("status");
    const data = await githubService.listIssues({
      search: c.req.query("search") || undefined,
      repositoryId: c.req.query("repositoryId") || undefined,
      status: (TRIAGE_STATUSES as readonly string[]).includes(status ?? "")
        ? (status as (typeof TRIAGE_STATUSES)[number])
        : undefined,
      priorities: priorities(c.req.query("priority")),
      stale: c.req.query("stale") === "true",
    });
    return c.json({ success: true, data, requestId: c.get("requestId") });
  },

  async getIssue(c: GithubContext) {
    const denied = await guard(c);
    if (denied) return denied;
    const id = c.req.param("id");
    if (!id) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Issue not found" },
          requestId: c.get("requestId"),
        },
        404,
      );
    }
    const data = await githubService.getIssue(id);
    if (!data) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Issue not found" },
          requestId: c.get("requestId"),
        },
        404,
      );
    }
    return c.json({ success: true, data, requestId: c.get("requestId") });
  },

  async updateTriage(c: GithubContext) {
    const denied = await guard(c);
    if (denied) return denied;
    const parsed = triagePatch.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION",
            message: parsed.error.issues[0]?.message ?? "Invalid triage update",
          },
          requestId: c.get("requestId"),
        },
        422,
      );
    }

    const id = c.req.param("id");
    if (!id) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Issue not found" },
          requestId: c.get("requestId"),
        },
        404,
      );
    }
    const result = await githubService.updateTriage(id, parsed.data);
    if ("error" in result && result.error === "owner") {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Owner not found" },
          requestId: c.get("requestId"),
        },
        404,
      );
    }
    if ("error" in result) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Issue not found" },
          requestId: c.get("requestId"),
        },
        404,
      );
    }
    return c.json({
      success: true,
      data: result.issue,
      requestId: c.get("requestId"),
    });
  },
};
