import { getDb, ensureSchema } from './db';
import { routeFeedback } from './ai';
import type { DBFeedback, DBDraft } from '@/types';

export async function processFeedback(feedbackId: number) {
  await ensureSchema();
  const sql = getDb();

  const feedbackRows = await sql`SELECT * FROM feedback WHERE id = ${feedbackId}`;
  const feedback = feedbackRows[0] as DBFeedback | undefined;
  if (!feedback || feedback.processed === 1) return;

  const draftRows = await sql`SELECT * FROM drafts WHERE id = ${feedback.draft_id}`;
  const draft = draftRows[0] as DBDraft | undefined;
  if (!draft) return;

  // Get the inbound email for context
  const emailRows = await sql`SELECT body_text, from_address FROM emails WHERE id = ${draft.email_id}`;
  const email = emailRows[0] as { body_text: string; from_address: string } | undefined;

  // Build feedback text for routing
  let feedbackText = '';
  if (feedback.rating === 1 && !feedback.corrected_body) {
    feedbackText = `This reply was approved as a good example.${feedback.comment ? ` Note: ${feedback.comment}` : ''}`;
  } else if (feedback.corrected_body) {
    feedbackText = `The AI reply was edited. Original: "${draft.body_text?.substring(0, 300) || ''}". Corrected to: "${feedback.corrected_body.substring(0, 300)}".${feedback.comment ? ` Feedback: ${feedback.comment}` : ''}`;
  } else if (feedback.comment) {
    feedbackText = feedback.comment;
  }

  if (!feedbackText.trim()) {
    await sql`UPDATE feedback SET processed = 1 WHERE id = ${feedbackId}`;
    return;
  }

  // Route feedback through AI to determine which memory files to update
  try {
    const proposals = await routeFeedback(feedbackText, {
      originalReply: draft.body_text || undefined,
      correctedReply: feedback.corrected_body || undefined,
      inboundEmail: email?.body_text || undefined,
    });

    // Insert each proposal into memory_updates as pending
    for (const proposal of proposals) {
      await sql`
        INSERT INTO memory_updates (feedback_source, feedback_text, draft_id, target_file, original_content, proposed_content, reason, status)
        VALUES ('draft_feedback', ${feedbackText}, ${feedback.draft_id}, ${proposal.target_file}, ${proposal.original_content}, ${proposal.proposed_content}, ${proposal.reason}, 'pending')
      `;
    }
  } catch {
    // If AI routing fails, still mark as processed
  }

  // Mark feedback as processed
  await sql`UPDATE feedback SET processed = 1 WHERE id = ${feedbackId}`;
}
