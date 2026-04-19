import { NextRequest, NextResponse } from 'next/server';
import { listMemoryFiles, readMemoryFile, writeMemoryFile, type MemoryFile } from '@/lib/memory';

export async function GET() {
  try {
    const files = listMemoryFiles();
    const data = [];
    for (const f of files) {
      data.push({ filename: f, content: await readMemoryFile(f) });
    }
    return NextResponse.json({ files: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { filename, content } = await req.json();
    const validFiles = listMemoryFiles();
    if (!validFiles.includes(filename as MemoryFile)) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }
    await writeMemoryFile(filename as MemoryFile, content);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
