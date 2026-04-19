import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/instantly';

export async function POST(req: NextRequest) {
  try {
    const client = createClient();
    const body = await req.json();
    const data = await client.sendReply({
      eaccount: body.eaccount,
      reply_to_uuid: body.reply_to_uuid,
      subject: body.subject,
      body: { text: body.text, html: body.html },
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
