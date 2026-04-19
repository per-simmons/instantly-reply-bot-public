import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const sql = getDb();
    const status = req.nextUrl.searchParams.get('status');

    let rows;
    if (status && status !== 'all') {
      rows = await sql`
        SELECT d.*, e.body_text as inbound_body, e.from_address as inbound_from, e.subject as inbound_subject
        FROM drafts d
        LEFT JOIN emails e ON d.email_id = e.id
        WHERE d.status = ${status}
        ORDER BY d.created_at DESC LIMIT 100
      `;
    } else {
      rows = await sql`
        SELECT d.*, e.body_text as inbound_body, e.from_address as inbound_from, e.subject as inbound_subject
        FROM drafts d
        LEFT JOIN emails e ON d.email_id = e.id
        ORDER BY d.created_at DESC LIMIT 100
      `;
    }

    return NextResponse.json({ items: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
