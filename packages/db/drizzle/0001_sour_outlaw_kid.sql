CREATE TABLE `closing_odds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_id` integer NOT NULL,
	`outcome` text NOT NULL,
	`reference_book` text NOT NULL,
	`closing_price` real NOT NULL,
	`captured_at` text NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `closing_opp_outcome_idx` ON `closing_odds` (`opportunity_id`,`outcome`);--> statement-breakpoint
ALTER TABLE `opportunity_legs` ADD `deep_link` text;