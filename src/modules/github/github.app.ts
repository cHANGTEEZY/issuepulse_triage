import { createAppAuth } from "@octokit/auth-app";
import { env } from "../../config/env";

export function githubAppConfigured() {
  return Boolean(
    env.GITHUB_APP_ID && env.GITHUB_PRIVATE_KEY && env.GITHUB_APP_SLUG,
  );
}

function privateKey() {
  return env.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n");
}

export async function installationAccessToken(installationId: number) {
  if (!githubAppConfigured()) {
    throw new Error("GitHub App is not configured");
  }

  const auth = createAppAuth({
    appId: env.GITHUB_APP_ID,
    privateKey: privateKey(),
  });

  const result = await auth({
    type: "installation",
    installationId,
  });

  return result.token;
}

export function installUrl() {
  if (!env.GITHUB_APP_SLUG) return null;
  return `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`;
}
