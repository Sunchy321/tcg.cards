CREATE TABLE `magic_search_costs` (
	`cost` text PRIMARY KEY NOT NULL,
	`generic` integer NOT NULL,
	`w` integer NOT NULL,
	`u` integer NOT NULL,
	`b` integer NOT NULL,
	`r` integer NOT NULL,
	`g` integer NOT NULL,
	`c` integer NOT NULL,
	`x` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `magic_search_cost_specials` (
	`cost` text NOT NULL,
	`symbol` text NOT NULL,
	`count` integer NOT NULL,
	CONSTRAINT `magic_search_cost_specials_pk` PRIMARY KEY(`cost`, `symbol`),
	CONSTRAINT `fk_magic_search_cost_specials_cost_magic_search_costs_cost_fk` FOREIGN KEY (`cost`) REFERENCES `magic_search_costs`(`cost`)
);
--> statement-breakpoint
ALTER TABLE `magic_search_card_parts` ADD `cost` text;