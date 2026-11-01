-- Drizzle models the relational content table; SQLite owns this FTS5 virtual table.
CREATE VIRTUAL TABLE IF NOT EXISTS magic_search_text_fts USING fts5(
  body,
  content='magic_search_text_rows',
  content_rowid='text_id',
  tokenize='trigram'
);
