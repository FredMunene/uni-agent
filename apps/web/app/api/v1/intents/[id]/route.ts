import { NextResponse } from 'next/server';
import { store } from '@/lib/store';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const intent = store.intents.get(id);
  if (!intent) return NextResponse.json({ error: 'Intent not found' }, { status: 404 });
  return NextResponse.json(intent);
}
