import fs from 'fs';
import path from 'path';
import { getDb } from './db';

const MEMORY_DIR = path.join(process.cwd(), 'data', 'memory');

const MEMORY_FILES = [
  'voice-and-tone.md',
  'company-context.md',
  'common-objections.md',
  'dos-and-donts.md',
  'example-replies.md',
] as const;

export type MemoryFile = typeof MEMORY_FILES[number];

export function listMemoryFiles(): MemoryFile[] {
  return [...MEMORY_FILES];
}

// Read from bundled filesystem (used as seed/fallback)
function readFileFromDisk(filename: MemoryFile): string {
  const filepath = path.join(MEMORY_DIR, filename);
  try {
    if (fs.existsSync(filepath)) return fs.readFileSync(filepath, 'utf-8');
  } catch {
    // Filesystem may not be available (Vercel)
  }
  return '';
}

// Read memory file: DB first, fallback to bundled file on disk
export async function readMemoryFile(filename: MemoryFile): Promise<string> {
  const sql = getDb();
  const rows = await sql`SELECT content FROM memory_files WHERE filename = ${filename}`;
  if (rows.length > 0) return rows[0].content;
  // Fallback to bundled file
  return readFileFromDisk(filename);
}

// Write memory file to DB
export async function writeMemoryFile(filename: MemoryFile, content: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO memory_files (filename, content, updated_at)
    VALUES (${filename}, ${content}, now())
    ON CONFLICT (filename) DO UPDATE SET content = ${content}, updated_at = now()
  `;
}

// Append to memory file in DB
export async function appendToMemoryFile(filename: MemoryFile, content: string): Promise<void> {
  const existing = await readMemoryFile(filename);
  const updated = existing.trimEnd() + '\n\n' + content + '\n';
  await writeMemoryFile(filename, updated);
}

// Get all memory context for system prompt injection
export async function getAllMemoryContext(): Promise<string> {
  const sections: string[] = [];

  for (const file of MEMORY_FILES) {
    const content = await readMemoryFile(file);
    if (content.trim()) {
      const label = file.replace('.md', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      sections.push(`## ${label}\n${content}`);
    }
  }

  return sections.join('\n\n');
}

// Seed DB from bundled files (run once on first deploy)
export async function seedMemoryFromDisk(): Promise<number> {
  const sql = getDb();
  let seeded = 0;
  for (const file of MEMORY_FILES) {
    const rows = await sql`SELECT 1 FROM memory_files WHERE filename = ${file}`;
    if (rows.length === 0) {
      const content = readFileFromDisk(file);
      if (content.trim()) {
        await sql`INSERT INTO memory_files (filename, content) VALUES (${file}, ${content})`;
        seeded++;
      }
    }
  }
  return seeded;
}
