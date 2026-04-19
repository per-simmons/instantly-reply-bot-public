import { NextResponse } from 'next/server';
import { getDb, getSetting } from '@/lib/db';

export async function GET() {
  try {
    const sql = getDb();
    const botActive = await getSetting('bot_active') === 'true';
    const mode = await getSetting('mode') || 'draft';
    const pollingInterval = parseInt(await getSetting('polling_interval_seconds') || '60');

    const lastPollRows = await sql`SELECT * FROM poll_log ORDER BY id DESC LIMIT 1`;
    const lastPoll = lastPollRows[0] || null;

    const pendingRows = await sql`SELECT COUNT(*) as count FROM drafts WHERE status = 'pending'`;
    const totalRows = await sql`SELECT COUNT(*) as count FROM drafts WHERE status = 'sent'`;
    const todaysRows = await sql`SELECT COUNT(*) as count FROM drafts WHERE status = 'sent' AND sent_at >= CURRENT_DATE`;

    return NextResponse.json({
      bot_active: botActive,
      mode,
      polling_interval: pollingInterval,
      last_poll: lastPoll,
      stats: {
        pending_drafts: Number(pendingRows[0].count),
        total_sent: Number(totalRows[0].count),
        sent_today: Number(todaysRows[0].count),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
