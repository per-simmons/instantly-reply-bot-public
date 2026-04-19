import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { processFeedback } from '@/lib/learner';
import type { DBDraft } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const sql = getDb();
    const { draft_id, rating, comment, corrected_body } = await req.json();

    if (!draft_id || !rating) {
      return NextResponse.json({ error: 'draft_id and rating required' }, { status: 400 });
    }

    const draftRows = await sql`SELECT * FROM drafts WHERE id = ${draft_id}`;
    const draft = draftRows[0] as DBDraft | undefined;
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

    const insertRows = await sql`
      INSERT INTO feedback (draft_id, rating, comment, original_body, corrected_body)
      VALUES (${draft_id}, ${rating}, ${comment || null}, ${draft.body_text}, ${corrected_body || null})
      RETURNING id
    `;

    // Process feedback synchronously — must complete before response on serverless
    await processFeedback(Number(insertRows[0].id));

    return NextResponse.json({ id: insertRows[0].id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
