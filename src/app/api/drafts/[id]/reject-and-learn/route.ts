import { NextRequest, NextResponse } from 'next/server';
import { getDb, ensureSchema } from '@/lib/db';
import { generateReply, routeFeedback } from '@/lib/ai';
import { createClient } from '@/lib/instantly';
import { writeMemoryFile, listMemoryFiles, type MemoryFile } from '@/lib/memory';
import type { DBDraft, DBEmail } from '@/types';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await ensureSchema();
    const sql = getDb();

    const { reason } = await req.json();
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 });
    }

    // Get the draft
    const draftRows = await sql`SELECT * FROM drafts WHERE id = ${Number(id)}`;
    const draft = draftRows[0] as DBDraft | undefined;
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

    // Get the inbound email
    const emailRows = await sql`SELECT * FROM emails WHERE id = ${draft.email_id}`;
    const email = emailRows[0] as DBEmail | undefined;
    if (!email) return NextResponse.json({ error: 'Email not found' }, { status: 404 });

    // Step 1: Route the feedback to determine which memory files to update
    const proposals = await routeFeedback(reason.trim(), {
      originalReply: draft.body_text || undefined,
      inboundEmail: email.body_text || undefined,
    });

    // Step 2: Apply memory updates immediately (no approval needed — this is explicit rejection)
    const updatedFiles: string[] = [];
    for (const proposal of proposals) {
      const file = proposal.target_file as MemoryFile;
      if (listMemoryFiles().includes(file)) {
        await writeMemoryFile(file, proposal.proposed_content);
        updatedFiles.push(file);

        // Also record in memory_updates for the changelog
        await sql`
          INSERT INTO memory_updates (feedback_source, feedback_text, draft_id, target_file, original_content, proposed_content, reason, status, applied_at)
          VALUES ('draft_feedback', ${reason.trim()}, ${Number(id)}, ${proposal.target_file}, ${proposal.original_content}, ${proposal.proposed_content}, ${proposal.reason}, 'approved', now())
        `;
      }
    }

    // Step 3: Reject the old draft
    await sql`UPDATE drafts SET status = 'rejected' WHERE id = ${Number(id)}`;

    // Step 4: Regenerate the reply with updated memory
    let threadHistory: Array<{ from: string; to: string; date: string; body: string; direction: 'inbound' | 'outbound' }> = [];
    if (email.thread_id) {
      try {
        const client = createClient();
        const threadRes = await client.getThreadEmails(email.thread_id);
        threadHistory = (threadRes.items || [])
          .filter(e => (e.id as string) !== email.id)
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

    // Step 5: Create the new draft
    const draftSubject = `Re: ${(email.subject || '').replace(/^Re:\s*/i, '')}`;
    const newDraftRows = await sql`
      INSERT INTO drafts (email_id, thread_id, campaign_id, to_address, from_address, subject, body_text, status, ai_reasoning, ai_classification)
      VALUES (${email.id}, ${email.thread_id}, ${email.campaign_id}, ${email.from_address}, ${email.eaccount || email.to_address}, ${draftSubject}, ${aiResult.reply}, 'pending', ${aiResult.reasoning}, ${aiResult.classification})
      RETURNING id
    `;

    await sql`UPDATE emails SET processed = 2 WHERE id = ${email.id}`;

    return NextResponse.json({
      new_draft_id: newDraftRows[0].id,
      reply: aiResult.reply,
      reasoning: aiResult.reasoning,
      classification: aiResult.classification,
      memory_updated: updatedFiles,
      proposals_applied: proposals.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
