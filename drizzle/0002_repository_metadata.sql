ALTER TABLE `repositories` ADD `is_private` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `repositories` ADD `description` text;--> statement-breakpoint
ALTER TABLE `repositories` ADD `default_branch` text;--> statement-breakpoint
ALTER TABLE `repositories` ADD `language` text;--> statement-breakpoint
ALTER TABLE `repositories` ADD `open_issues` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repositories` ADD `pushed_at` integer;
