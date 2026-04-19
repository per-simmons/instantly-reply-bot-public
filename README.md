# Instantly Reply Bot

A self-improving AI email reply agent for [Instantly.ai](https://instantly.ai) cold outreach campaigns. Polls for incoming replies, generates contextual drafts with GPT-5, and learns from your feedback over time.

## What it does

- **Polls Instantly** every 60s for new replies on monitored campaigns
- **Classifies** each reply (positive_interest, objection, information_request, not_interested, bad_timing, wrong_person, out_of_office)
- **Generates a draft** in your voice using GPT-5 with a memory-augmented prompt
- **Two modes:** draft approval (review before sending) or autonomous (auto-send after a delay)
- **Self-improving:** your feedback updates a set of markdown "memory" files that feed back into the prompt
- **Unibox-style UI** for reviewing drafts, editing, approving, rejecting, giving feedback

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind + shadcn/ui (black/white, no slop)
- Neon Postgres (serverless) for state
- OpenAI `gpt-5.4` for generation and classification
- Instantly API v2 for campaign/email integration

## Setup

```bash
npm install
cp .env.example .env.local
# Fill in your keys in .env.local
npm run dev
```

Then:

1. Open `http://localhost:3000`
2. Edit your memory files on the **Memory** page — voice, company context, objection handling, rules, examples
3. Toggle monitored campaigns on the **Campaigns** page
4. Activate the bot on the **Dashboard**
5. Review drafts on the **Drafts** page as replies come in

## Memory files

Five markdown files in `data/memory/` shape the AI's behavior. They're injected into the system prompt every time a reply is generated:

| File | Purpose |
|---|---|
| `voice-and-tone.md` | How you write — style, personality, punctuation habits |
| `company-context.md` | What your business does, pricing rules, CTA |
| `common-objections.md` | How to handle frequent responses |
| `dos-and-donts.md` | Concrete rules — banned words, structural constraints |
| `example-replies.md` | Curated good replies (auto-appended on approval) |

## Architecture

```
[Instantly Inbox]
      ↓ poll /api/v2/emails?email_type=received
[Deduplicate → Neon emails table]
      ↓ load thread + memory files → system prompt
[GPT-5 classifies + generates reply]
      ↓
  draft mode   → Drafts queue → UI review → Approve/Edit/Reject
  autonomous   → Scheduled send with configurable delay
      ↓
[POST /api/v2/emails/reply to Instantly]
      ↓ user feedback (thumbs + comment)
[Learner routes feedback → proposed memory updates]
      ↓ user approves
[Memory files updated → next reply uses new rules]
```

## ⚠️ Security note

**All API routes are currently unauthenticated.** Before deploying this to a public URL:

- Add auth middleware (e.g. an API key header check, or NextAuth)
- Remove or gate any test/dev routes
- Rate-limit LLM endpoints to avoid surprise OpenAI bills
- Don't commit `.env.local` (already in `.gitignore`)

This is a personal tool — it assumes only you can reach it. Harden before shipping to others.

## Deploying

Deploys cleanly to Vercel. Add `INSTANTLY_API_KEY`, `OPENAI_API_KEY`, and `DATABASE_URL` as environment variables. Memory files are seeded from the filesystem on first request, then stored in Neon.

## License

MIT
