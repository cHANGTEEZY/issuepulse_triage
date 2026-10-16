import { and, desc, eq, inArray, like, lt, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { user } from "../../db/schema/auth";
import {
  githubInstallations,
  githubIssues,
  issueLabels,
  repositories,
  triage,
  webhookDeliveries,
} from "../../db/schema/github";
import type {
  GithubIssue,
  GithubLabel,
  IssueRecord,
  IssueSummary,
  RepositoryMetadata,
  RepositoryRecord,
  TriagePriority,
  TriageStatus,
} from "./github.types";

const STALE_MS = 14 * 24 * 60 * 60 * 1000;

function id() {
  return crypto.randomUUID();
}

function repoOwner(fullName: string | undefined, fallback: string) {
  const owner = fullName?.split("/")[0];
  return owner || fallback;
}

function labelsFrom(issue: GithubIssue) {
  return (issue.labels ?? []).flatMap((label) => {
    if (typeof label === "string") return [{ name: label, color: "ededed" }];
    if (!label.name) return [];
    return [{ name: label.name, color: label.color ?? "ededed" }];
  });
}

export const githubRepository = {
  async claimDelivery(deliveryId: string, event: string) {
    const inserted = await db
      .insert(webhookDeliveries)
      .values({ id: deliveryId, event })
      .onConflictDoNothing()
      .returning({ id: webhookDeliveries.id });

    return inserted.length > 0;
  },

  async upsertInstallation(input: {
    installationId: number;
    accountLogin: string;
    accountType: string;
  }) {
    await db
      .insert(githubInstallations)
      .values({
        id: id(),
        installationId: input.installationId,
        accountLogin: input.accountLogin,
        accountType: input.accountType,
      })
      .onConflictDoUpdate({
        target: githubInstallations.installationId,
        set: {
          accountLogin: input.accountLogin,
          accountType: input.accountType,
          updatedAt: new Date(),
        },
      });

    const [row] = await db
      .select()
      .from(githubInstallations)
      .where(eq(githubInstallations.installationId, input.installationId))
      .limit(1);

    return row ?? null;
  },

  async deleteInstallation(installationId: number) {
    await db
      .delete(githubInstallations)
      .where(eq(githubInstallations.installationId, installationId));
  },

  async upsertRepository(input: {
    githubRepoId: number;
    owner: string;
    name: string;
    installationRowId: string;
    metadata?: RepositoryMetadata;
  }) {
    const metadata = input.metadata
      ? {
          isPrivate: input.metadata.isPrivate,
          description: input.metadata.description,
          defaultBranch: input.metadata.defaultBranch,
          language: input.metadata.language,
          openIssues: input.metadata.openIssues,
          pushedAt: input.metadata.pushedAt,
        }
      : {};

    await db
      .insert(repositories)
      .values({
        id: id(),
        githubRepoId: input.githubRepoId,
        owner: input.owner,
        name: input.name,
        installationId: input.installationRowId,
        ...metadata,
      })
      .onConflictDoUpdate({
        target: repositories.githubRepoId,
        set: {
          owner: input.owner,
          name: input.name,
          installationId: input.installationRowId,
          ...metadata,
          updatedAt: new Date(),
        },
      });

    const [row] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.githubRepoId, input.githubRepoId))
      .limit(1);

    return row ?? null;
  },

  async deleteRepositories(githubRepoIds: number[]) {
    if (githubRepoIds.length === 0) return;
    await db
      .delete(repositories)
      .where(inArray(repositories.githubRepoId, githubRepoIds));
  },

  async findRepository(repositoryId: string) {
    const [row] = await db
      .select({
        repository: repositories,
        installationId: githubInstallations.installationId,
      })
      .from(repositories)
      .innerJoin(
        githubInstallations,
        eq(repositories.installationId, githubInstallations.id),
      )
      .where(eq(repositories.id, repositoryId))
      .limit(1);

    return row ?? null;
  },

  async findRepositoryByGithubId(githubRepoId: number) {
    const [row] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.githubRepoId, githubRepoId))
      .limit(1);

    return row ?? null;
  },

  async listInstallations() {
    return db.select().from(githubInstallations);
  },

  async listRepositories(): Promise<RepositoryRecord[]> {
    const rows = await db
      .select()
      .from(repositories)
      .orderBy(desc(repositories.lastSyncedAt), repositories.name);

    return rows.map((row) => ({
      id: row.id,
      githubRepoId: row.githubRepoId,
      owner: row.owner,
      name: row.name,
      isPrivate: row.isPrivate,
      description: row.description,
      defaultBranch: row.defaultBranch,
      language: row.language,
      openIssues: row.openIssues,
      pushedAt: row.pushedAt?.toISOString() ?? null,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    }));
  },

  async markSynced(repositoryId: string) {
    await db
      .update(repositories)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(repositories.id, repositoryId));
  },

  async upsertIssue(repositoryId: string, issue: GithubIssue) {
    const labels = labelsFrom(issue);
    const values = {
      repositoryId,
      githubIssueId: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      authorLogin: issue.user?.login ?? "ghost",
      authorAvatarUrl: issue.user?.avatar_url ?? null,
      htmlUrl: issue.html_url,
      isPullRequest: issue.pull_request != null,
      githubCreatedAt: new Date(issue.created_at),
      githubUpdatedAt: new Date(issue.updated_at),
    };

    await db
      .insert(githubIssues)
      .values({ id: id(), ...values })
      .onConflictDoUpdate({
        target: [githubIssues.repositoryId, githubIssues.number],
        set: {
          ...values,
          updatedAt: new Date(),
        },
      });

    const [row] = await db
      .select()
      .from(githubIssues)
      .where(
        and(
          eq(githubIssues.repositoryId, repositoryId),
          eq(githubIssues.number, issue.number),
        ),
      )
      .limit(1);

    if (!row) return null;

    await db.insert(triage).values({ id: id(), issueId: row.id }).onConflictDoNothing();

    await db.delete(issueLabels).where(eq(issueLabels.issueId, row.id));
    if (labels.length > 0) {
      await db.insert(issueLabels).values(
        labels.map((label) => ({
          id: id(),
          issueId: row.id,
          name: label.name,
          color: label.color,
        })),
      );
    }

    return row;
  },

  async touchIssue(repositoryId: string, number: number, updatedAt: Date) {
    await db
      .update(githubIssues)
      .set({ githubUpdatedAt: updatedAt, updatedAt: new Date() })
      .where(
        and(
          eq(githubIssues.repositoryId, repositoryId),
          eq(githubIssues.number, number),
        ),
      );
  },

  async listIssues(filters: {
    search?: string;
    repositoryId?: string;
    status?: TriageStatus;
    priorities?: TriagePriority[];
    stale?: boolean;
  }): Promise<IssueRecord[]> {
    const conditions = [];

    if (filters.repositoryId) {
      conditions.push(eq(githubIssues.repositoryId, filters.repositoryId));
    }
    if (filters.status) {
      conditions.push(eq(triage.status, filters.status));
    }
    if (filters.priorities && filters.priorities.length > 0) {
      conditions.push(inArray(triage.priority, filters.priorities));
    }
    if (filters.stale) {
      conditions.push(
        lt(githubIssues.githubUpdatedAt, new Date(Date.now() - STALE_MS)),
      );
    }
    if (filters.search) {
      const term = `%${filters.search.replace(/[%_]/g, "")}%`;
      conditions.push(
        or(like(githubIssues.title, term), like(githubIssues.body, term)),
      );
    }

    const rows = await db
      .select({
        issue: githubIssues,
        triage,
        repository: repositories,
        ownerId: user.id,
        ownerName: user.name,
        ownerImage: user.image,
      })
      .from(githubIssues)
      .innerJoin(triage, eq(triage.issueId, githubIssues.id))
      .innerJoin(repositories, eq(repositories.id, githubIssues.repositoryId))
      .leftJoin(user, eq(user.id, triage.ownerId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(githubIssues.githubUpdatedAt));

    return this.withLabels(rows);
  },

  async getIssue(issueId: string) {
    const rows = await db
      .select({
        issue: githubIssues,
        triage,
        repository: repositories,
        ownerId: user.id,
        ownerName: user.name,
        ownerImage: user.image,
      })
      .from(githubIssues)
      .innerJoin(triage, eq(triage.issueId, githubIssues.id))
      .innerJoin(repositories, eq(repositories.id, githubIssues.repositoryId))
      .leftJoin(user, eq(user.id, triage.ownerId))
      .where(eq(githubIssues.id, issueId))
      .limit(1);

    const [record] = await this.withLabels(rows);
    return record ?? null;
  },

  async updateTriage(
    issueId: string,
    patch: {
      status?: TriageStatus;
      priority?: TriagePriority;
      ownerId?: string | null;
      notes?: string;
    },
  ) {
    const [existing] = await db
      .select()
      .from(triage)
      .where(eq(triage.issueId, issueId))
      .limit(1);

    if (!existing) return null;

    await db
      .update(triage)
      .set({
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.priority ? { priority: patch.priority } : {}),
        ...(patch.ownerId !== undefined ? { ownerId: patch.ownerId } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        updatedAt: new Date(),
      })
      .where(eq(triage.issueId, issueId));

    return this.getIssue(issueId);
  },

  async summary(): Promise<IssueSummary> {
    const staleBefore = Date.now() - STALE_MS;
    const [row] = await db
      .select({
        untriaged: sql<number>`sum(case when ${triage.status} = 'inbox' then 1 else 0 end)`,
        highPriority: sql<number>`sum(case when ${triage.priority} in ('critical', 'high') and ${triage.status} != 'done' then 1 else 0 end)`,
        stale: sql<number>`sum(case when ${githubIssues.githubUpdatedAt} < ${staleBefore} and ${githubIssues.state} = 'open' and ${triage.status} != 'done' then 1 else 0 end)`,
      })
      .from(githubIssues)
      .innerJoin(triage, eq(triage.issueId, githubIssues.id));

    return {
      untriaged: Number(row?.untriaged ?? 0),
      highPriority: Number(row?.highPriority ?? 0),
      stale: Number(row?.stale ?? 0),
    };
  },

  async withLabels(
    rows: Array<{
      issue: typeof githubIssues.$inferSelect;
      triage: typeof triage.$inferSelect;
      repository: typeof repositories.$inferSelect;
      ownerId: string | null;
      ownerName: string | null;
      ownerImage: string | null;
    }>,
  ): Promise<IssueRecord[]> {
    if (rows.length === 0) return [];

    const labels = await db
      .select()
      .from(issueLabels)
      .where(
        inArray(
          issueLabels.issueId,
          rows.map((row) => row.issue.id),
        ),
      );

    const byIssue = new Map<string, Array<{ name: string; color: string }>>();
    for (const label of labels) {
      const current = byIssue.get(label.issueId) ?? [];
      current.push({ name: label.name, color: label.color });
      byIssue.set(label.issueId, current);
    }

    return rows.map((row) => ({
      id: row.issue.id,
      number: row.issue.number,
      title: row.issue.title,
      body: row.issue.body,
      state: row.issue.state,
      authorLogin: row.issue.authorLogin,
      authorAvatarUrl: row.issue.authorAvatarUrl,
      htmlUrl: row.issue.htmlUrl,
      isPullRequest: row.issue.isPullRequest,
      githubCreatedAt: row.issue.githubCreatedAt.toISOString(),
      githubUpdatedAt: row.issue.githubUpdatedAt.toISOString(),
      repository: {
        id: row.repository.id,
        owner: row.repository.owner,
        name: row.repository.name,
      },
      labels: byIssue.get(row.issue.id) ?? [],
      triage: {
        status: row.triage.status as IssueRecord["triage"]["status"],
        priority: row.triage.priority as IssueRecord["triage"]["priority"],
        notes: row.triage.notes,
        owner:
          row.ownerId && row.ownerName
            ? {
                id: row.ownerId,
                name: row.ownerName,
                image: row.ownerImage,
              }
            : null,
      },
    }));
  },

  repoOwner,
};
