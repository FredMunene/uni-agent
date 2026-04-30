import { NextResponse } from 'next/server';
import { ExecuteSchema } from '@uni-agent/shared';
import { store } from '@/lib/store';
import { startExecution } from '../../../../../../../../lib/services/executionFlow';

export async function POST(req: Request, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await params;
  const body = await req.json();
  const result = ExecuteSchema.safeParse(body);
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 });

  const outcome = await startExecution(
    store,
    id,
    planId,
    result.data.userAddress,
    typeof body.planHash === 'string' ? body.planHash : '',
    result.data.permit2Signature,
  );
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  return NextResponse.json({ executionId: outcome.executionId, status: 'submitted' }, { status: 202 });
}
