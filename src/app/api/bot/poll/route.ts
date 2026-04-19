import { NextResponse } from 'next/server';
import { runPollCycle } from '@/lib/poller';

export async function POST() {
  try {
    const result = await runPollCycle();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
