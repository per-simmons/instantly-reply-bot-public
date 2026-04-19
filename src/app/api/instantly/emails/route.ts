import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/instantly';

export async function GET(req: NextRequest) {
  try {
    const client = createClient();
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const data = await client.listEmails({
      campaign_id: params.campaign_id,
      email_type: params.email_type,
      limit: params.limit ? parseInt(params.limit) : undefined,
      starting_after: params.starting_after,
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
