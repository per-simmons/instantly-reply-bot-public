import { NextRequest, NextResponse } from 'next/server';
import { getDb, ensureSchema } from '@/lib/db';
import { writeMemoryFile, listMemoryFiles, type MemoryFile } from '@/lib/memory';
import type { DBMemoryUpdate } from '@/types';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { action } = await req.json();

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
    }

    await ensureSchema();
    const sql = getDb();

    const rows = await sql`SELECT * FROM memory_updates WHERE id = ${Number(id)}`;
    const update = rows[0] as DBMemoryUpdate | undefined;
    if (!update) return NextResponse.json({ error: 'Update not found' }, { status: 404 });
    if (update.status !== 'pending') return NextResponse.json({ error: 'Update already processed' }, { status: 400 });

    if (action === 'approve') {
      // Validate the target file is a valid memory file
      const validFiles = listMemoryFiles();
      if (!validFiles.includes(update.target_file as MemoryFile)) {
        return NextResponse.json({ error: 'Invalid target file' }, { status: 400 });
      }

      // Apply the proposed change
      await writeMemoryFile(update.target_file as MemoryFile, update.proposed_content);

      await sql`UPDATE memory_updates SET status = 'approved', applied_at = now() WHERE id = ${Number(id)}`;
      return NextResponse.json({ status: 'approved', target_file: update.target_file });
    }

    if (action === 'reject') {
      await sql`UPDATE memory_updates SET status = 'rejected' WHERE id = ${Number(id)}`;
      return NextResponse.json({ status: 'rejected' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
