CREATE TABLE `github_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` integer NOT NULL,
	`account_login` text NOT NULL,
	`account_type` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_installations_installation_id_unique` ON `github_installations` (`installation_id`);--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`github_repo_id` integer NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`installation_id` text NOT NULL,
	`last_synced_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`installation_id`) REFERENCES `github_installations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_github_repo_id_unique` ON `repositories` (`github_repo_id`);--> statement-breakpoint
CREATE INDEX `repositories_installation_idx` ON `repositories` (`installation_id`);--> statement-breakpoint
CREATE TABLE `github_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`github_issue_id` integer NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`state` text NOT NULL,
	`author_login` text NOT NULL,
	`author_avatar_url` text,
	`html_url` text NOT NULL,
	`is_pull_request` integer DEFAULT false NOT NULL,
	`github_created_at` integer NOT NULL,
	`github_updated_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_issues_repo_number_idx` ON `github_issues` (`repository_id`,`number`);--> statement-breakpoint
CREATE INDEX `github_issues_repository_updated_idx` ON `github_issues` (`repository_id`,`github_updated_at`);--> statement-breakpoint
CREATE INDEX `github_issues_state_idx` ON `github_issues` (`state`);--> statement-breakpoint
CREATE TABLE `issue_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `github_issues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `issue_labels_issue_idx` ON `issue_labels` (`issue_id`);--> statement-breakpoint
CREATE TABLE `triage` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`status` text DEFAULT 'inbox' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`owner_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `github_issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `triage_issue_id_unique` ON `triage` (`issue_id`);--> statement-breakpoint
CREATE INDEX `triage_status_priority_idx` ON `triage` (`status`,`priority`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
