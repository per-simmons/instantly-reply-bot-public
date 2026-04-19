import { NextRequest, NextResponse } from 'next/server';
import { getDb, ensureSchema } from '@/lib/db';
import { routeFeedback } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    const { feedback } = await req.json();
    if (!feedback || typeof feedback !== 'string' || !feedback.trim()) {
      return NextResponse.json({ error: 'feedback text required' }, { status: 400 });
    }

    await ensureSchema();
    const sql = getDb();

    // Route feedback through AI to determine which memory files to update
    const proposals = await routeFeedback(feedback.trim());

    if (proposals.length === 0) {
      return NextResponse.json({ proposals: [], message: 'No memory updates needed for this feedback.' });
    }

    // Insert each proposal into memory_updates as pending
    const inserted = [];
    for (const proposal of proposals) {
      const rows = await sql`
        INSERT INTO memory_updates (feedback_source, feedback_text, draft_id, target_file, original_content, proposed_content, reason, status)
        VALUES ('manual', ${feedback.trim()}, ${null}, ${proposal.target_file}, ${proposal.original_content}, ${proposal.proposed_content}, ${proposal.reason}, 'pending')
        RETURNING id, target_file, reason, status, created_at
      `;
      inserted.push(rows[0]);
    }

    return NextResponse.json({ proposals: inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
