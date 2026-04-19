import { NextResponse } from 'next/server';
import { createClient } from '@/lib/instantly';

export async function GET() {
  try {
    const client = createClient();
    const data = await client.listAccounts();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
