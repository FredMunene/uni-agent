import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { simulatedExecution } from '@/lib/simulatedExecution';

export async function GET(_req: Request, { params }: { params: Promise<{ execId: string }> }) {
  const { execId } = await params;
  const exec = await store.executions.get(execId);
  if (!exec) return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
  return NextResponse.json(simulatedExecution(exec as unknown as Parameters<typeof simulatedExecution>[0]));
}
