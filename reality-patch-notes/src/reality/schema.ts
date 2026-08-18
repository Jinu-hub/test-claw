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
      r2_object_key TEXT,
      compared_at TEXT
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

  sql`
    CREATE TABLE IF NOT EXISTS patch_evidences (
      patch_id TEXT NOT NULL,
      evidence_id TEXT NOT NULL,
      PRIMARY KEY (patch_id, evidence_id)
    )
  `;

  sql`
    CREATE TABLE IF NOT EXISTS section_proposals (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      section_key TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      summary TEXT NOT NULL,
      evidence_ids_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    )
  `;

  sql`
    CREATE TABLE IF NOT EXISTS watch_intent_proposals (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      focus_json TEXT NOT NULL DEFAULT '[]',
      ignore_json TEXT NOT NULL DEFAULT '[]',
      priority_json TEXT NOT NULL DEFAULT '[]',
      rationale TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    )
  `;

  sql`
    CREATE INDEX IF NOT EXISTS idx_watch_intent_proposals_target_status
    ON watch_intent_proposals(target_id, status)
  `;

  sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_evidences_target_hash
    ON evidences(target_id, content_hash)
  `;

  sql`
    CREATE INDEX IF NOT EXISTS idx_patches_target_created
    ON patches(target_id, created_at)
  `;

  sql`
    CREATE INDEX IF NOT EXISTS idx_section_proposals_target_status
    ON section_proposals(target_id, status)
  `;

  const evidenceColumns = sql<{ name: string }>`PRAGMA table_info(evidences)`;
  if (!evidenceColumns.some((column) => column.name === "compared_at")) {
    sql`ALTER TABLE evidences ADD COLUMN compared_at TEXT`;
    sql`UPDATE evidences SET compared_at = observed_at WHERE compared_at IS NULL`;
  }
}
