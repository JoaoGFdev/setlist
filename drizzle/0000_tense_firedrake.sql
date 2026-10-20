CREATE TABLE `app_documents` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer,
	PRIMARY KEY(`user_id`, `key`)
);
--> statement-breakpoint
CREATE INDEX `app_documents_user_expiry_idx` ON `app_documents` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `connected_accounts` (
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`credentials` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `provider`)
);
--> statement-breakpoint
CREATE TABLE `operation_leases` (
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `name`)
);
--> statement-breakpoint
CREATE INDEX `operation_leases_expiry_idx` ON `operation_leases` (`expires_at`);