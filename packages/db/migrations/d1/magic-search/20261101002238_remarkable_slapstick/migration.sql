CREATE TABLE `magic_search_cards` (
	`card_id` text NOT NULL,
	`version` text NOT NULL,
	`ambit` text NOT NULL,
	`mana_value` real NOT NULL,
	CONSTRAINT `magic_search_cards_pk` PRIMARY KEY(`card_id`, `version`)
);
--> statement-breakpoint
CREATE TABLE `magic_search_candidates` (
	`card_id` text NOT NULL,
	`version` text NOT NULL,
	`request_locale` text NOT NULL,
	`set_code` text NOT NULL,
	`number` text NOT NULL,
	`print_lang` text NOT NULL,
	`print_source` text NOT NULL,
	`release_date` text NOT NULL,
	`layout` text NOT NULL,
	`image_type` text NOT NULL,
	`image_status` text NOT NULL,
	CONSTRAINT `magic_search_candidates_pk` PRIMARY KEY(`card_id`, `version`, `request_locale`),
	CONSTRAINT `fk_magic_search_candidates_card_id_version_magic_search_cards_card_id_version_fk` FOREIGN KEY (`card_id`,`version`) REFERENCES `magic_search_cards`(`card_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `magic_search_card_parts` (
	`card_id` text NOT NULL,
	`version` text NOT NULL,
	`part_index` integer NOT NULL,
	`name` text NOT NULL,
	`typeline` text NOT NULL,
	`power` text,
	`toughness` text,
	`loyalty` text,
	`defense` text,
	`hand_modifier` text,
	`life_modifier` text,
	CONSTRAINT `magic_search_card_parts_pk` PRIMARY KEY(`card_id`, `version`, `part_index`),
	CONSTRAINT `fk_magic_search_card_parts_card_id_version_magic_search_cards_card_id_version_fk` FOREIGN KEY (`card_id`,`version`) REFERENCES `magic_search_cards`(`card_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `magic_search_card_part_localizations` (
	`card_id` text NOT NULL,
	`version` text NOT NULL,
	`locale` text NOT NULL,
	`source` text NOT NULL,
	`part_index` integer NOT NULL,
	`name` text NOT NULL,
	`ruby_name` text,
	`typeline` text NOT NULL,
	CONSTRAINT `magic_search_card_part_localizations_pk` PRIMARY KEY(`card_id`, `version`, `locale`, `source`, `part_index`),
	CONSTRAINT `fk_magic_search_card_part_localizations_card_id_version_part_index_magic_search_card_parts_card_id_version_part_index_fk` FOREIGN KEY (`card_id`,`version`,`part_index`) REFERENCES `magic_search_card_parts`(`card_id`,`version`,`part_index`)
);
--> statement-breakpoint
CREATE TABLE `magic_search_part_values` (
	`card_id` text NOT NULL,
	`version` text NOT NULL,
	`part_index` integer NOT NULL,
	`field` text NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `magic_search_part_values_pk` PRIMARY KEY(`card_id`, `version`, `part_index`, `field`, `value`),
	CONSTRAINT `fk_magic_search_part_values_card_id_version_part_index_magic_search_card_parts_card_id_version_part_index_fk` FOREIGN KEY (`card_id`,`version`,`part_index`) REFERENCES `magic_search_card_parts`(`card_id`,`version`,`part_index`)
);
--> statement-breakpoint
CREATE TABLE `magic_search_card_values` (
	`card_id` text NOT NULL,
	`version` text NOT NULL,
	`field` text NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `magic_search_card_values_pk` PRIMARY KEY(`card_id`, `version`, `field`, `value`),
	CONSTRAINT `fk_magic_search_card_values_card_id_version_magic_search_cards_card_id_version_fk` FOREIGN KEY (`card_id`,`version`) REFERENCES `magic_search_cards`(`card_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `magic_search_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `magic_search_text_rows` (
	`text_id` integer PRIMARY KEY,
	`kind` text NOT NULL,
	`card_id` text NOT NULL,
	`version` text NOT NULL,
	`part_index` integer NOT NULL,
	`locale` text,
	`source` text,
	`body` text NOT NULL,
	CONSTRAINT `fk_magic_search_text_rows_card_id_version_part_index_magic_search_card_parts_card_id_version_part_index_fk` FOREIGN KEY (`card_id`,`version`,`part_index`) REFERENCES `magic_search_card_parts`(`card_id`,`version`,`part_index`),
	CONSTRAINT "magic_search_text_rows_kind_check" CHECK("kind" IN ('part', 'localization')),
	CONSTRAINT "magic_search_text_rows_identity_check" CHECK(("kind" = 'part' AND "locale" IS NULL AND "source" IS NULL)
      OR ("kind" = 'localization' AND "locale" IS NOT NULL AND "source" IS NOT NULL))
);
--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS magic_search_text_fts USING fts5(
	body,
	content='magic_search_text_rows',
	content_rowid='text_id',
	tokenize='trigram'
);
