import { getDb, getSetting } from './db';
import { createClient } from './instantly';
import { generateReply } from './ai';
import type { PollResult } from '@/types';

export async function runPollCycle(): Promise<PollResult> {
  const sql = getDb();
  const result: PollResult = { emails_found: 0, drafts_created: 0, auto_sent: 0, errors: [] };

  // Check if bot is active
  const botActive = await getSetting('bot_active');
  if (botActive !== 'true') {
    return result;
  }

  // Get monitored campaigns
  const monitoredRaw = await getSetting('monitored_campaigns') || '[]';
  const monitoredCampaigns: string[] = JSON.parse(monitoredRaw);
  if (monitoredCampaigns.length === 0) {
    return result;
  }

  const mode = await getSetting('mode') || 'draft';
  const autoSendDelay = parseInt(await getSetting('auto_send_delay_seconds') || '300', 10);
  const client = createClient();

  // Process any scheduled drafts that are due
  try {
    const dueDrafts = await sql`
      SELECT d.*, e.eaccount as email_eaccount FROM drafts d
      LEFT JOIN emails e ON d.email_id = e.id
      WHERE d.status = 'scheduled' AND d.scheduled_send_at <= now()
    `;
    for (const draft of dueDrafts) {
      try {
        await client.sendReply({
          eaccount: draft.from_address,
          reply_to_uuid: draft.email_id,
          subject: draft.subject || '',
          body: { text: draft.body_text },
        });
        await sql`UPDATE drafts SET status = 'sent', sent_at = now() WHERE id = ${draft.id}`;
        await sql`UPDATE emails SET processed = 3 WHERE id = ${draft.email_id}`;
        result.auto_sent++;
      } catch (sendErr) {
        const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
        await sql`UPDATE drafts SET status = 'failed' WHERE id = ${draft.id}`;
        result.errors.push(`Scheduled send failed for draft ${draft.id}: ${errMsg}`);
      }
    }
  } catch {
    // Scheduled send check failed, continue with polling
  }

  // Log poll start
  const logRows = await sql`INSERT INTO poll_log (started_at) VALUES (now()) RETURNING id`;
  const pollLogId = logRows[0].id;

  try {
    for (const campaignId of monitoredCampaigns) {
      try {
        // Fetch received emails for this campaign
        const emailsResponse = await client.listEmails({
          campaign_id: campaignId,
          email_type: 'received',
          limit: 50,
        });

        const emails = emailsResponse.items || [];

        for (const email of emails) {
          const emailId = email.id as string;
          if (!emailId) continue;

          // Check if already processed
          const existing = await sql`SELECT id FROM emails WHERE id = ${emailId}`;
          if (existing.length > 0) continue;

          result.emails_found++;

          const fromAddr = (email.from_address_email || email.from_address || '') as string;
          const toAddr = (email.to_address_email || email.to_address || '') as string;
          const subject = (email.subject || '') as string;
          const bodyText = typeof email.body === 'object'
            ? (email.body as Record<string, unknown>).text as string || ''
            : email.body as string || '';
          const bodyHtml = typeof email.body === 'object'
            ? (email.body as Record<string, unknown>).html as string || ''
            : '';
          const leadEmail = (email.lead_email || fromAddr) as string;
          const eaccount = (email.eaccount || toAddr) as string;
          const timestampEmail = (email.timestamp_created || new Date().toISOString()) as string;

          // Insert email
          await sql`
            INSERT INTO emails (id, thread_id, campaign_id, from_address, to_address, subject, body_text, body_html, lead_email, eaccount, timestamp_email)
            VALUES (${emailId}, ${(email.thread_id || null) as string | null}, ${campaignId}, ${fromAddr}, ${toAddr}, ${subject}, ${bodyText}, ${bodyHtml}, ${leadEmail}, ${eaccount}, ${timestampEmail})
          `;

          // Generate AI reply
          try {
            await sql`UPDATE emails SET processed = 1 WHERE id = ${emailId}`;

            // Try to get thread context
            let threadHistory: Array<{ from: string; to: string; date: string; body: string; direction: 'inbound' | 'outbound' }> = [];
            if (email.thread_id) {
              try {
                const threadRes = await client.getThreadEmails(email.thread_id as string);
                threadHistory = (threadRes.items || [])
                  .filter(e => (e.id as string) !== emailId)
                  .map(e => {
                    const eFrom = (e.from_address_email || e.from_address || '') as string;
                    const eBody = typeof e.body === 'object' ? (e.body as Record<string, unknown>).text as string || '' : e.body as string || '';
                    return {
                      from: eFrom,
                      to: (e.to_address_email || e.to_address || '') as string,
                      date: (e.timestamp_created || '') as string,
                      body: eBody,
                      direction: (e.email_type === 'sent' ? 'outbound' : 'inbound') as 'inbound' | 'outbound',
                    };
                  });
              } catch {
                // Thread fetch failed, continue without history
              }
            }

            const aiResult = await generateReply(
              {
                from: fromAddr,
                subject: subject,
                body: bodyText,
                date: timestampEmail,
              },
              threadHistory
            );

            // If out_of_office, skip creating a draft — nothing to send
            if (aiResult.classification === 'out_of_office' && !aiResult.reply.trim()) {
              await sql`UPDATE emails SET processed = -1 WHERE id = ${emailId}`;
              continue;
            }

            // Create draft — scheduled with delay in autonomous mode, pending in draft mode
            const draftStatus = mode === 'autonomous' ? 'scheduled' : 'pending';
            const draftSubject = `Re: ${subject.replace(/^Re:\s*/i, '')}`;
            const scheduledAt = mode === 'autonomous'
              ? new Date(Date.now() + autoSendDelay * 1000).toISOString()
              : null;

            await sql`
              INSERT INTO drafts (email_id, thread_id, campaign_id, to_address, from_address, subject, body_text, status, ai_reasoning, ai_classification, scheduled_send_at)
              VALUES (${emailId}, ${(email.thread_id || null) as string | null}, ${campaignId}, ${fromAddr}, ${eaccount}, ${draftSubject}, ${aiResult.reply}, ${draftStatus}, ${aiResult.reasoning}, ${aiResult.classification}, ${scheduledAt})
            `;

            result.drafts_created++;
            await sql`UPDATE emails SET processed = 2 WHERE id = ${emailId}`;
          } catch (genErr) {
            const errMsg = genErr instanceof Error ? genErr.message : String(genErr);
            await sql`UPDATE emails SET processed = -1 WHERE id = ${emailId}`;
            result.errors.push(`Generation failed for ${emailId}: ${errMsg}`);
          }
        }
      } catch (campaignErr) {
        const errMsg = campaignErr instanceof Error ? campaignErr.message : String(campaignErr);
        result.errors.push(`Campaign ${campaignId}: ${errMsg}`);
      }
    }
  } finally {
    const errorStr = result.errors.join('; ') || null;
    await sql`UPDATE poll_log SET completed_at = now(), emails_found = ${result.emails_found}, drafts_created = ${result.drafts_created}, auto_sent = ${result.auto_sent}, error = ${errorStr} WHERE id = ${pollLogId}`;
  }

  return result;
}
