export type SqlValue = string | number | boolean | null;

export type SqlExecutor = <T = Record<string, SqlValue>>(
  strings: TemplateStringsArray,
  ...values: SqlValue[]
) => T[];

export function ensureRealitySchema(sql: SqlExecutor): void {
  sql`
    CREATE TABLE IF NOT EXISTS targets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      watch_intent_json TEXT NOT NULL DEFAULT '{"focus":[],"ignore":[],"priority":[]}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  sql`
    CREATE TABLE IF NOT EXISTS patches (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      section_key TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      before_value TEXT,
      after_value TEXT,
      impact TEXT,
      created_at TEXT NOT NULL
    )
  `;

  sql`
    CREATE TABLE IF NOT EXISTS evidences (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      publisher TEXT,
      source_type TEXT,
      published_at TEXT,
      observed_at TEXT NOT NULL,
      summary TEXT,
      content_hash TEXT,
      r2_object_key TEXT
    )
  `;

  sql`
    CREATE TABLE IF NOT EXISTS scan_runs (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      notes TEXT
    )
  `;
}
