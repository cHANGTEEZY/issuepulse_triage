import { Hono } from "hono";
import { githubRoutes, issueRoutes } from "./github/github.routes";
import { healthRoutes } from "./health/health.routes";
import { usersRoutes } from "./users/users.routes";

export const apiV1Router = new Hono();

apiV1Router.route("/health", healthRoutes);
apiV1Router.route("/users", usersRoutes);
apiV1Router.route("/repositories", githubRoutes);
apiV1Router.route("/issues", issueRoutes);
