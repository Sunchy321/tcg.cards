CREATE TABLE `hearthstone_search_cards` (
	`card_id` text PRIMARY KEY,
	`set` text NOT NULL,
	`id_order` integer NOT NULL,
	`set_order` integer NOT NULL,
	`type` text NOT NULL,
	`cost` integer NOT NULL,
	`attack` integer,
	`health` integer,
	`durability` integer,
	`armor` integer,
	`spell_school` text,
	`collectible` integer NOT NULL,
	`elite` integer NOT NULL,
	`rarity` text,
	`ambit` text NOT NULL,
	`tech_level` integer,
	`in_bobs_tavern` integer NOT NULL,
	`mercenary_role` text,
	`mercenary_faction` text,
	`colddown` integer,
	`class_count` integer NOT NULL,
	`rune_count` integer,
	`race_count` integer,
	`race_bucket_count` integer,
	`simple_tags` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hearthstone_search_card_legalities` (
	`card_id` text NOT NULL,
	`format` text NOT NULL,
	`status` text NOT NULL,
	CONSTRAINT `hearthstone_search_card_legalities_pk` PRIMARY KEY(`card_id`, `format`),
	CONSTRAINT `fk_hearthstone_search_card_legalities_card_id_hearthstone_search_cards_card_id_fk` FOREIGN KEY (`card_id`) REFERENCES `hearthstone_search_cards`(`card_id`)
);
--> statement-breakpoint
CREATE TABLE `hearthstone_search_card_localizations` (
	`card_id` text NOT NULL,
	`lang` text NOT NULL,
	`name` text NOT NULL,
	`name_order` integer NOT NULL,
	`text` text NOT NULL,
	`render_hash` text,
	CONSTRAINT `hearthstone_search_card_localizations_pk` PRIMARY KEY(`card_id`, `lang`),
	CONSTRAINT `fk_hearthstone_search_card_localizations_card_id_hearthstone_search_cards_card_id_fk` FOREIGN KEY (`card_id`) REFERENCES `hearthstone_search_cards`(`card_id`)
);
--> statement-breakpoint
CREATE TABLE `hearthstone_search_card_values` (
	`card_id` text NOT NULL,
	`field` text NOT NULL,
	`position` integer NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `hearthstone_search_card_values_pk` PRIMARY KEY(`card_id`, `field`, `position`),
	CONSTRAINT `fk_hearthstone_search_card_values_card_id_hearthstone_search_cards_card_id_fk` FOREIGN KEY (`card_id`) REFERENCES `hearthstone_search_cards`(`card_id`)
);
--> statement-breakpoint
CREATE TABLE `hearthstone_search_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hearthstone_search_text_rows` (
	`text_id` integer PRIMARY KEY,
	`card_id` text NOT NULL,
	`lang` text NOT NULL,
	`body` text NOT NULL,
	CONSTRAINT `fk_hearthstone_search_text_rows_card_id_lang_hearthstone_search_card_localizations_card_id_lang_fk` FOREIGN KEY (`card_id`,`lang`) REFERENCES `hearthstone_search_card_localizations`(`card_id`,`lang`)
);
--> statement-breakpoint
-- Drizzle owns the relational content; SQLite owns the FTS5 virtual table.
CREATE VIRTUAL TABLE IF NOT EXISTS hearthstone_search_text_fts USING fts5(
  body,
  content='hearthstone_search_text_rows',
  content_rowid='text_id',
  tokenize='trigram'
);
