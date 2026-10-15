import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { requireAuth } from "../../middleware/require-auth";
import type { AppVariables } from "../../shared/types/app.types";
import { usersController } from "./users.controller";
import { usersDocs } from "./users.docs";

export const usersRoutes = new Hono<{ Variables: AppVariables }>();

usersRoutes.get(
  "/",
  requireAuth(),
  describeRoute({
    ...usersDocs.getMe,
    summary: "List users",
    description: "Returns users that can be assigned as triage owners.",
  }),
  (c) => usersController.list(c),
);

usersRoutes.get(
  "/me",
  requireAuth(),
  describeRoute(usersDocs.getMe),
  (c) => usersController.getMe(c),
);
