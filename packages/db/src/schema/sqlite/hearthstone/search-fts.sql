-- Drizzle owns the relational content; SQLite owns the FTS5 virtual table.
CREATE VIRTUAL TABLE IF NOT EXISTS hearthstone_search_text_fts USING fts5(
  body,
  content='hearthstone_search_text_rows',
  content_rowid='text_id',
  tokenize='trigram'
);
