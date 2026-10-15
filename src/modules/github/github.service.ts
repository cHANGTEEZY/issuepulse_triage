import { eq } from "drizzle-orm";
import { db } from "../../db";
import { user } from "../../db/schema/auth";
import { installUrl } from "./github.app";
import { githubRepository } from "./github.repository";
import { syncRepository } from "./github.sync";
import type { TriagePriority, TriageStatus } from "./github.types";

export const githubService = {
  installUrl,
  listRepositories: () => githubRepository.listRepositories(),
  summary: () => githubRepository.summary(),
  listIssues: (filters: {
    search?: string;
    repositoryId?: string;
    status?: TriageStatus;
    priorities?: TriagePriority[];
    stale?: boolean;
  }) => githubRepository.listIssues(filters),
  getIssue: (issueId: string) => githubRepository.getIssue(issueId),
  sync: (repositoryId: string) => syncRepository(repositoryId),
  async updateTriage(
    issueId: string,
    patch: {
      status?: TriageStatus;
      priority?: TriagePriority;
      ownerId?: string | null;
      notes?: string;
    },
  ) {
    if (patch.ownerId) {
      const [owner] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, patch.ownerId))
        .limit(1);
      if (!owner) return { error: "owner" as const };
    }

    const issue = await githubRepository.updateTriage(issueId, patch);
    if (!issue) return { error: "missing" as const };
    return { issue };
  },
};
