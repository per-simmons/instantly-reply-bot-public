import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let _schemaReady = false;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return neon(url);
}

export async function ensureSchema() {
  if (_schemaReady) return;
  const sql = getDb();

  // Add ai_classification column to drafts if missing
  await sql`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS ai_classification TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS idx_drafts_classification ON drafts(ai_classification)`;

  // Add scheduled_send_at column for delayed auto-send
  await sql`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS scheduled_send_at TIMESTAMPTZ`;

  // Create memory_updates table if missing
  await sql`
    CREATE TABLE IF NOT EXISTS memory_updates (
      id SERIAL PRIMARY KEY,
      feedback_source TEXT NOT NULL,
      feedback_text TEXT NOT NULL,
      draft_id INTEGER REFERENCES drafts(id),
      target_file TEXT NOT NULL,
      original_content TEXT NOT NULL,
      proposed_content TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT now(),
      applied_at TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_memory_updates_status ON memory_updates(status)`;

  // Create memory_files table for storing memory in DB (Vercel filesystem is read-only)
  await sql`
    CREATE TABLE IF NOT EXISTS memory_files (
      filename TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  // Create test_runs table for E2E testing
  await sql`
    CREATE TABLE IF NOT EXISTS test_runs (
      id SERIAL PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      agentmail_inbox_id TEXT NOT NULL,
      agentmail_email TEXT NOT NULL,
      persona_name TEXT NOT NULL,
      persona_company TEXT,
      reply_scenario TEXT NOT NULL,
      outreach_received BOOLEAN DEFAULT false,
      reply_sent BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  // Seed memory files from bundled disk files into DB (first deploy only)
  const { seedMemoryFromDisk } = await import('./memory');
  await seedMemoryFromDisk();

  _schemaReady = true;
}

// Setting helpers
export async function getSetting(key: string): Promise<string | null> {
  const sql = getDb();
  const rows = await sql`SELECT value FROM settings WHERE key = ${key}`;
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  const sql = getDb();
  await sql`INSERT INTO settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = ${value}`;
}

export async function getSettings(): Promise<Record<string, string>> {
  const sql = getDb();
  const rows = await sql`SELECT key, value FROM settings`;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
