import { logger } from "../../shared/utils/logger";
import { githubRepository } from "./github.repository";
import { syncRepository } from "./github.sync";
import type {
  InstallationEvent,
  InstallationRepositoriesEvent,
  IssueCommentEvent,
  IssuesEvent,
} from "./github.types";

async function saveInstallation(
  installation: NonNullable<InstallationEvent["installation"]>,
  repos: InstallationEvent["repositories"],
) {
  const accountLogin = installation.account?.login ?? "unknown";
  const saved = await githubRepository.upsertInstallation({
    installationId: installation.id,
    accountLogin,
    accountType: installation.account?.type ?? "Organization",
  });
  if (!saved) return [];

  const stored = [];
  for (const repo of repos ?? []) {
    const row = await githubRepository.upsertRepository({
      githubRepoId: repo.id,
      owner: githubRepository.repoOwner(repo.full_name, accountLogin),
      name: repo.name,
      installationRowId: saved.id,
    });
    if (row) stored.push(row);
  }
  return stored;
}

export async function handleGithubEvent(event: string, payload: unknown) {
  if (event === "installation") {
    const body = payload as InstallationEvent;
    if (!body.installation) return;
    if (body.action === "deleted") {
      await githubRepository.deleteInstallation(body.installation.id);
      return;
    }
    if (body.action === "created") {
      const repos = await saveInstallation(body.installation, body.repositories);
      for (const repo of repos) {
        void syncRepository(repo.id).catch((error: unknown) => {
          logger.error({ err: error, repositoryId: repo.id }, "install sync failed");
        });
      }
    }
    return;
  }

  if (event === "installation_repositories") {
    const body = payload as InstallationRepositoriesEvent;
    if (!body.installation) return;
    if (body.action === "added") {
      const repos = await saveInstallation(
        body.installation,
        body.repositories_added,
      );
      for (const repo of repos) {
        void syncRepository(repo.id).catch((error: unknown) => {
          logger.error({ err: error, repositoryId: repo.id }, "install sync failed");
        });
      }
      return;
    }
    if (body.action === "removed") {
      await githubRepository.deleteRepositories(
        (body.repositories_removed ?? []).map((repo) => repo.id),
      );
    }
    return;
  }

  if (event === "issues") {
    const body = payload as IssuesEvent;
    const handled = new Set([
      "opened",
      "edited",
      "closed",
      "reopened",
      "labeled",
      "unlabeled",
    ]);
    if (!body.action || !handled.has(body.action) || !body.issue || !body.repository) {
      return;
    }
    const repository = await githubRepository.findRepositoryByGithubId(
      body.repository.id,
    );
    if (!repository) return;
    await githubRepository.upsertIssue(repository.id, body.issue);
    return;
  }

  if (event === "issue_comment") {
    const body = payload as IssueCommentEvent;
    if (!body.issue || !body.repository) return;
    const repository = await githubRepository.findRepositoryByGithubId(
      body.repository.id,
    );
    if (!repository) return;
    await githubRepository.touchIssue(
      repository.id,
      body.issue.number,
      new Date(body.issue.updated_at),
    );
  }
}
