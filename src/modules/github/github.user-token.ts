import { auth } from "../auth/auth.service";

export class GithubReconnectError extends Error {
  constructor(message = "Reconnect GitHub to make changes as yourself") {
    super(message);
  }
}

export async function userGithubToken(headers: Headers) {
  try {
    const result = await auth.api.getAccessToken({
      body: { providerId: "github" },
      headers,
    });
    if (!result?.accessToken) throw new GithubReconnectError();
    return result.accessToken;
  } catch (error) {
    if (error instanceof GithubReconnectError) throw error;
    throw new GithubReconnectError();
  }
}
