CREATE TABLE `odds_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`poll_run_id` integer,
	`sport_key` text NOT NULL,
	`event_id` text NOT NULL,
	`commence_time` text NOT NULL,
	`market_type` text NOT NULL,
	`raw_json` text,
	`normalized_json` text NOT NULL,
	`captured_at` text NOT NULL,
	FOREIGN KEY (`poll_run_id`) REFERENCES `poll_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `snap_event_idx` ON `odds_snapshots` (`event_id`);--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`sport_key` text NOT NULL,
	`event_id` text NOT NULL,
	`event_name` text,
	`commence_time` text NOT NULL,
	`market_type` text NOT NULL,
	`region_profile` text NOT NULL,
	`margin` real,
	`edge` real,
	`reference_book` text,
	`default_bankroll_profit` real,
	`status` text DEFAULT 'new' NOT NULL,
	`dedupe_key` text NOT NULL,
	`detected_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opp_dedupe_idx` ON `opportunities` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `opp_status_idx` ON `opportunities` (`status`);--> statement-breakpoint
CREATE INDEX `opp_sport_idx` ON `opportunities` (`sport_key`);--> statement-breakpoint
CREATE INDEX `opp_commence_idx` ON `opportunities` (`commence_time`);--> statement-breakpoint
CREATE TABLE `opportunity_legs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_id` integer NOT NULL,
	`outcome` text NOT NULL,
	`book` text NOT NULL,
	`odds` real NOT NULL,
	`implied_prob` real,
	`recommended_stake` real,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `placement_legs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`placement_id` integer NOT NULL,
	`outcome` text NOT NULL,
	`book` text NOT NULL,
	`actual_stake` real NOT NULL,
	`actual_odds` real NOT NULL,
	FOREIGN KEY (`placement_id`) REFERENCES `placements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `placements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_id` integer NOT NULL,
	`total_staked` real NOT NULL,
	`predicted_profit` real,
	`placed_at` text NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `poll_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`region_profile` text NOT NULL,
	`status` text NOT NULL,
	`credits_used` integer,
	`error` text,
	`started_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE TABLE `settlement_legs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`settlement_id` integer NOT NULL,
	`outcome` text NOT NULL,
	`result` text NOT NULL,
	FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_id` integer NOT NULL,
	`winning_selection` text,
	`realized_profit` real,
	`predicted_profit` real,
	`notes` text,
	`auto_filled` integer DEFAULT false NOT NULL,
	`settled_at` text NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE cascade
);
