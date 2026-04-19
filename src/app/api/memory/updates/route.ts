import { NextRequest, NextResponse } from 'next/server';
import { getDb, ensureSchema } from '@/lib/db';
import type { DBMemoryUpdate } from '@/types';

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const sql = getDb();
    const status = req.nextUrl.searchParams.get('status');

    let rows: DBMemoryUpdate[];
    if (status) {
      rows = await sql`SELECT * FROM memory_updates WHERE status = ${status} ORDER BY created_at DESC LIMIT 50` as unknown as DBMemoryUpdate[];
    } else {
      rows = await sql`SELECT * FROM memory_updates ORDER BY created_at DESC LIMIT 50` as unknown as DBMemoryUpdate[];
    }

    return NextResponse.json({ items: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
