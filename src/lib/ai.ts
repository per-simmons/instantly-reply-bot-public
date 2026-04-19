import OpenAI from 'openai';
import { getAllMemoryContext, readMemoryFile, listMemoryFiles, type MemoryFile } from './memory';

function getClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  return new OpenAI({ apiKey: key });
}

interface ThreadEmail {
  from: string;
  to: string;
  date: string;
  body: string;
  direction: 'inbound' | 'outbound';
}

interface GenerateResult {
  reply: string;
  reasoning: string;
  classification: string;
}

export interface MemoryUpdateProposal {
  target_file: string;
  original_content: string;
  proposed_content: string;
  reason: string;
}

export async function generateReply(
  inboundEmail: { from: string; subject: string; body: string; date: string },
  threadHistory: ThreadEmail[],
  leadInfo?: { name?: string; company?: string; title?: string }
): Promise<GenerateResult> {
  const client = getClient();
  const memoryContext = await getAllMemoryContext();

  const systemPrompt = `You are the user described in the Voice & Tone section below. You're replying to responses to your cold outreach emails. You are NOT an AI assistant — you ARE that person. Write exactly as they would write.

${memoryContext}

---

## YOUR TASK

You're reading a reply to a cold email you sent. First, classify it. Then write a reply that Pat would actually send.

## STEP 1: CLASSIFY THE REPLY

Read their message and categorize it as exactly one of:
- "positive_interest" — they want to learn more, book a call, or said yes
- "soft_positive" — warm but vague, or offering a referral
- "information_request" — asking a specific question about what you do, pricing, process, etc.
- "objection" — skepticism, "tried AI before," "don't think it applies to us," competitor mention
- "not_interested" — clear no, unsubscribe request, "remove me"
- "out_of_office" — auto-reply, vacation notice, OOO
- "wrong_person" — "I'm not the right person" or redirecting to someone else
- "bad_timing" — interested but not now, "circle back later," "in the middle of [something]"

## STEP 2: WRITE THE REPLY

Follow these rules based on classification:

**positive_interest:** Fast, short, excited but not desperate. Get them to a call ASAP. Include calendar link placeholder [CALENDAR_LINK]. 2-3 sentences max.

**soft_positive:** Thank them. If referral, ask for the intro. If vague warmth, give one specific hook and soft CTA. 2-3 sentences.

**information_request:** Answer their question with ONE concrete, relevant detail. Don't over-explain. Then pivot to a call as the best way to go deeper. 3-4 sentences max.

**objection:** Acknowledge their concern genuinely — don't dismiss it. Reframe with a specific example or proof point. Soft CTA, no pressure. 3-4 sentences.

**not_interested:** Graceful exit. 1-2 sentences max. Thank them, leave the door cracked, move on. NEVER argue or try to re-engage.

**out_of_office:** Output reply as "" (empty string). Note their return date in reasoning so the system can schedule follow-up.

**wrong_person:** Thank them and ask for a warm intro. Make it easy — suggest they forward the thread. 2 sentences.

**bad_timing:** Validate their situation. Offer to follow up at their suggested time. Keep it to 2 sentences. No pressure.

## STRUCTURAL RULES (non-negotiable)

1. CONTRACTIONS ALWAYS: Write I'll, we'd, it's, don't, can't, won't. Never "I will," "we would," "it is."
2. VARIED SENTENCE LENGTH: Mix short fragments (2-5 words) with longer ones. Never write 3+ sentences of similar length in a row.
3. WORD LIMIT: 50-125 words for most replies. Never exceed 150 unless classification is "information_request" and the question genuinely requires it.
4. ONE CTA: Exactly one call-to-action per email. Usually "want to grab a time?" or a calendar link.
5. NO BULLET POINTS: Ever. In any reply. This is an email, not a pitch deck.
6. OPENER: Reference something specific from their email. Never start with a generic opener.
7. SIGN-OFF: "Pat" or "— Pat". Nothing else. No "Best," no "Cheers," no "Thanks,".
8. TONE MATCHING: Match the length and formality of their reply. Short casual message = short casual reply. Formal = slightly less formal but thorough.

## BANNED WORDS AND PHRASES (using any of these is a failure)

Never use: leverage, utilize, streamline, optimize, enhance, comprehensive, robust, seamless, scalable, facilitate, implementation, paradigm shift, synergy, ecosystem, empower, cutting-edge, game-changer, best-in-class, world-class, next-generation, innovative solution, transform, harness, unlock, elevate, delve, dive deep, revolutionize, "I hope this email finds you well," "I'd be happy to," "Thanks so much for getting back to me," "Dear [Name]," "Best regards," "Sincerely," "Warm regards"

Instead: "happy to" (not "I'd be happy to"), "hey" (not "Hello" or "Hi there"), use simple words a founder would text to another founder.

## OUTPUT FORMAT

Return your response as JSON with exactly these fields:
{
  "classification": "one of the 8 categories above",
  "reasoning": "Classification: [category] because [1 sentence why]. Approach: [1 sentence about strategy for this reply].",
  "reply": "the actual email reply text"
}

The "reply" field should contain the complete email body text including greeting and sign-off. Include "Hey [name]" if you know their first name from the Lead Info or email address, otherwise just start talking. Always end with "Pat" or "— Pat".`;

  const threadFormatted = threadHistory.map(e =>
    `[${e.direction.toUpperCase()}] From: ${e.from} | Date: ${e.date}\n${e.body}`
  ).join('\n\n---\n\n');

  let leadContext = '';
  if (leadInfo) {
    const parts = [];
    if (leadInfo.name) parts.push(`Name: ${leadInfo.name}`);
    if (leadInfo.company) parts.push(`Company: ${leadInfo.company}`);
    if (leadInfo.title) parts.push(`Title: ${leadInfo.title}`);
    if (parts.length) leadContext = `\n\nLead Info:\n${parts.join('\n')}`;
  }

  const userMessage = `## Conversation Thread
${threadFormatted || '(No prior thread history)'}

## Latest Reply (respond to this)
From: ${inboundEmail.from}
Subject: ${inboundEmail.subject}
Date: ${inboundEmail.date}
Body:
${inboundEmail.body}${leadContext}

Generate a reply.`;

  const response = await client.chat.completions.create({
    model: 'gpt-5.4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.75,
    max_completion_tokens: 500,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('No response from OpenAI');

  try {
    const parsed = JSON.parse(content);
    return {
      reply: parsed.reply || content,
      reasoning: parsed.reasoning || '',
      classification: parsed.classification || 'unknown',
    };
  } catch {
    return { reply: content, reasoning: '', classification: 'unknown' };
  }
}

export async function analyzeFeedback(
  originalReply: string,
  correctedReply: string | null,
  feedbackComment: string | null
): Promise<string> {
  const client = getClient();

  const userMessage = correctedReply
    ? `Original AI reply:\n${originalReply}\n\nUser's corrected version:\n${correctedReply}\n\nUser's feedback: ${feedbackComment || '(none)'}\n\nWhat rule should be learned from this correction? Output a single concise rule in the format "DO: ..." or "DON'T: ..."`
    : `Original AI reply:\n${originalReply}\n\nUser's feedback: ${feedbackComment}\n\nWhat rule should be learned? Output a single concise rule in the format "DO: ..." or "DON'T: ..."`;

  const response = await client.chat.completions.create({
    model: 'gpt-5.4',
    messages: [
      {
        role: 'system',
        content: 'You analyze feedback on AI-generated email replies and extract concise rules. Output only the rule, nothing else.',
      },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,
    max_completion_tokens: 100,
  });

  return response.choices[0]?.message?.content || '';
}

const MEMORY_FILE_DESCRIPTIONS: Record<string, string> = {
  'voice-and-tone.md': 'How the user writes — tone, style, personality, formality level, punctuation habits, sign-off preferences, what they sound like vs. don\'t',
  'company-context.md': 'Facts about the user\'s company — services, value props, target audience, process, CTA, pricing rules, what the AI must never claim',
  'common-objections.md': 'How to handle specific types of pushback — "not interested," pricing questions, competitor mentions, skepticism, bad timing, etc.',
  'dos-and-donts.md': 'Concrete rules for reply writing — banned words, structural constraints, things to always/never do',
  'example-replies.md': 'Approved example replies showing the ideal tone and approach for different reply types',
};

export async function routeFeedback(
  feedbackText: string,
  context?: { originalReply?: string; correctedReply?: string; inboundEmail?: string }
): Promise<MemoryUpdateProposal[]> {
  const client = getClient();

  const memoryFiles = listMemoryFiles();
  const fileContents: Record<string, string> = {};
  for (const file of memoryFiles) {
    fileContents[file] = await readMemoryFile(file);
  }

  const filesSection = memoryFiles.map(file =>
    `### ${file}\n**Purpose:** ${MEMORY_FILE_DESCRIPTIONS[file] || 'Memory file'}\n**Current content:**\n\`\`\`\n${fileContents[file]}\n\`\`\``
  ).join('\n\n');

  let contextSection = '';
  if (context) {
    const parts = [];
    if (context.inboundEmail) parts.push(`Inbound email they were replying to:\n${context.inboundEmail}`);
    if (context.originalReply) parts.push(`AI-generated reply:\n${context.originalReply}`);
    if (context.correctedReply) parts.push(`User's corrected version:\n${context.correctedReply}`);
    if (parts.length) contextSection = `\n\n## Context\n${parts.join('\n\n')}`;
  }

  const systemPrompt = `You analyze user feedback about their AI email reply bot and determine which memory file(s) need updating.

## Memory Files

${filesSection}

## Routing Rules

Route feedback to the correct file(s) based on what the feedback is about:
- Tone, style, formality, personality, writing habits → voice-and-tone.md
- Company info, services, pricing, CTA, what we do/don't do as a business → company-context.md
- How to handle specific objections or reply scenarios → common-objections.md
- Things to always do or never do in replies, banned words/phrases → dos-and-donts.md
- Approving a specific reply as a good example, or providing a before/after → example-replies.md

Feedback may require updates to MULTIPLE files. For example, "stop saying we offer web design" affects both company-context.md (services list) and dos-and-donts.md (new DON'T rule).

## Output Format

Return JSON:
{
  "proposals": [
    {
      "target_file": "the-file-name.md",
      "original_content": "the full current content of the file",
      "proposed_content": "the full updated content of the file with your changes applied",
      "reason": "1-sentence explanation of what you changed and why"
    }
  ]
}

Rules:
- The "original_content" must be the EXACT current content of the file (copy it verbatim)
- The "proposed_content" must be the FULL file content with your edit applied — not just the changed section
- Make MINIMAL, surgical edits. Don't reorganize or rewrite sections that aren't affected by the feedback.
- If the feedback doesn't clearly map to any file, return an empty proposals array.`;

  const userMessage = `## User Feedback\n\n"${feedbackText}"${contextSection}

Analyze this feedback and propose memory file updates.`;

  const response = await client.chat.completions.create({
    model: 'gpt-5.4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,
    max_completion_tokens: 4000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    return (parsed.proposals || []) as MemoryUpdateProposal[];
  } catch {
    return [];
  }
}
