import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createClient } from '@/lib/instantly';
import type { DBDraft } from '@/types';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    const body = await req.json();
    const { action, edited_body } = body;

    const draftRows = await sql`SELECT * FROM drafts WHERE id = ${Number(id)}`;
    const draft = draftRows[0] as DBDraft | undefined;
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

    if (action === 'approve') {
      const replyText = edited_body || draft.body_text;

      try {
        const client = createClient();
        await client.sendReply({
          eaccount: draft.from_address,
          reply_to_uuid: draft.email_id,
          subject: draft.subject || '',
          body: { text: replyText },
        });

        await sql`UPDATE drafts SET status = 'sent', sent_at = now(), edited_body = ${edited_body || null} WHERE id = ${Number(id)}`;
        await sql`UPDATE emails SET processed = 3 WHERE id = ${draft.email_id}`;

        return NextResponse.json({ status: 'sent' });
      } catch (sendErr) {
        const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
        await sql`UPDATE drafts SET status = 'failed' WHERE id = ${Number(id)}`;
        return NextResponse.json({ error: `Send failed: ${errMsg}` }, { status: 500 });
      }
    }

    if (action === 'reject') {
      await sql`UPDATE drafts SET status = 'rejected' WHERE id = ${Number(id)}`;
      await sql`UPDATE emails SET processed = -1 WHERE id = ${draft.email_id}`;
      return NextResponse.json({ status: 'rejected' });
    }

    if (action === 'update') {
      await sql`UPDATE drafts SET body_text = ${edited_body} WHERE id = ${Number(id)}`;
      return NextResponse.json({ status: 'updated' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
