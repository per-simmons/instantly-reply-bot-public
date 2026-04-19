import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createClient } from '@/lib/instantly';
import { generateReply } from '@/lib/ai';
import type { DBEmail } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const { email_id } = await req.json();
    if (!email_id) return NextResponse.json({ error: 'email_id required' }, { status: 400 });

    const sql = getDb();
    const emailRows = await sql`SELECT * FROM emails WHERE id = ${email_id}`;
    const email = emailRows[0] as DBEmail | undefined;
    if (!email) return NextResponse.json({ error: 'Email not found' }, { status: 404 });

    // Get thread context
    let threadHistory: Array<{ from: string; to: string; date: string; body: string; direction: 'inbound' | 'outbound' }> = [];
    if (email.thread_id) {
      try {
        const client = createClient();
        const threadRes = await client.getThreadEmails(email.thread_id);
        threadHistory = (threadRes.items || [])
          .filter(e => (e.id as string) !== email_id)
          .map(e => ({
            from: (e.from_address_email || '') as string,
            to: (e.to_address_email || '') as string,
            date: (e.timestamp_created || '') as string,
            body: typeof e.body === 'object' ? (e.body as Record<string, unknown>).text as string || '' : e.body as string || '',
            direction: (e.email_type === 'sent' ? 'outbound' : 'inbound') as 'inbound' | 'outbound',
          }));
      } catch {
        // Continue without thread history
      }
    }

    const aiResult = await generateReply(
      {
        from: email.from_address,
        subject: email.subject || '',
        body: email.body_text || '',
        date: email.timestamp_email,
      },
      threadHistory
    );

    // If out_of_office with no reply, skip draft creation
    if (aiResult.classification === 'out_of_office' && !aiResult.reply.trim()) {
      return NextResponse.json({
        classification: 'out_of_office',
        reasoning: aiResult.reasoning,
        reply: '',
        skip: true,
      });
    }

    // Update or create draft
    const existing = await sql`SELECT id FROM drafts WHERE email_id = ${email_id} AND status = 'pending'`;

    if (existing.length > 0) {
      await sql`UPDATE drafts SET body_text = ${aiResult.reply}, ai_reasoning = ${aiResult.reasoning}, ai_classification = ${aiResult.classification} WHERE id = ${existing[0].id}`;
      return NextResponse.json({ draft_id: existing[0].id, reply: aiResult.reply, reasoning: aiResult.reasoning, classification: aiResult.classification });
    }

    const draftSubject = `Re: ${(email.subject || '').replace(/^Re:\s*/i, '')}`;
    const insertRows = await sql`
      INSERT INTO drafts (email_id, thread_id, campaign_id, to_address, from_address, subject, body_text, status, ai_reasoning, ai_classification)
      VALUES (${email_id}, ${email.thread_id}, ${email.campaign_id}, ${email.from_address}, ${email.eaccount || email.to_address}, ${draftSubject}, ${aiResult.reply}, 'pending', ${aiResult.reasoning}, ${aiResult.classification})
      RETURNING id
    `;

    await sql`UPDATE emails SET processed = 2 WHERE id = ${email_id}`;

    return NextResponse.json({ draft_id: insertRows[0].id, reply: aiResult.reply, reasoning: aiResult.reasoning, classification: aiResult.classification });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
