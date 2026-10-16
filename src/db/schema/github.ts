import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";

function createdAt() {
  return integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull();
}

function updatedAt() {
  return integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull();
}

export const githubInstallations = sqliteTable("github_installations", {
  id: text("id").primaryKey(),
  installationId: integer("installation_id").notNull().unique(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const repositories = sqliteTable(
  "repositories",
  {
    id: text("id").primaryKey(),
    githubRepoId: integer("github_repo_id").notNull().unique(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    installationId: text("installation_id")
      .notNull()
      .references(() => githubInstallations.id, { onDelete: "cascade" }),
    isPrivate: integer("is_private", { mode: "boolean" }).default(false).notNull(),
    description: text("description"),
    defaultBranch: text("default_branch"),
    language: text("language"),
    openIssues: integer("open_issues").default(0).notNull(),
    pushedAt: integer("pushed_at", { mode: "timestamp_ms" }),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("repositories_installation_idx").on(table.installationId),
  ],
);

export const githubIssues = sqliteTable(
  "github_issues",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    githubIssueId: integer("github_issue_id").notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    state: text("state").notNull(),
    authorLogin: text("author_login").notNull(),
    authorAvatarUrl: text("author_avatar_url"),
    htmlUrl: text("html_url").notNull(),
    isPullRequest: integer("is_pull_request", { mode: "boolean" })
      .default(false)
      .notNull(),
    githubCreatedAt: integer("github_created_at", {
      mode: "timestamp_ms",
    }).notNull(),
    githubUpdatedAt: integer("github_updated_at", {
      mode: "timestamp_ms",
    }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("github_issues_repo_number_idx").on(
      table.repositoryId,
      table.number,
    ),
    index("github_issues_repository_updated_idx").on(
      table.repositoryId,
      table.githubUpdatedAt,
    ),
    index("github_issues_state_idx").on(table.state),
  ],
);

export const issueLabels = sqliteTable(
  "issue_labels",
  {
    id: text("id").primaryKey(),
    issueId: text("issue_id")
      .notNull()
      .references(() => githubIssues.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
  },
  (table) => [index("issue_labels_issue_idx").on(table.issueId)],
);

export const triage = sqliteTable(
  "triage",
  {
    id: text("id").primaryKey(),
    issueId: text("issue_id")
      .notNull()
      .unique()
      .references(() => githubIssues.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("inbox"),
    priority: text("priority").notNull().default("medium"),
    ownerId: text("owner_id").references(() => user.id, {
      onDelete: "set null",
    }),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("triage_status_priority_idx").on(table.status, table.priority)],
);

export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  event: text("event").notNull(),
  createdAt: createdAt(),
});

export const githubInstallationRelations = relations(
  githubInstallations,
  ({ many }) => ({
    repositories: many(repositories),
  }),
);

export const repositoryRelations = relations(repositories, ({ one, many }) => ({
  installation: one(githubInstallations, {
    fields: [repositories.installationId],
    references: [githubInstallations.id],
  }),
  issues: many(githubIssues),
}));

export const githubIssueRelations = relations(githubIssues, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [githubIssues.repositoryId],
    references: [repositories.id],
  }),
  labels: many(issueLabels),
  triage: one(triage, {
    fields: [githubIssues.id],
    references: [triage.issueId],
  }),
}));

export const issueLabelRelations = relations(issueLabels, ({ one }) => ({
  issue: one(githubIssues, {
    fields: [issueLabels.issueId],
    references: [githubIssues.id],
  }),
}));

export const triageRelations = relations(triage, ({ one }) => ({
  issue: one(githubIssues, {
    fields: [triage.issueId],
    references: [githubIssues.id],
  }),
  owner: one(user, {
    fields: [triage.ownerId],
    references: [user.id],
  }),
}));
