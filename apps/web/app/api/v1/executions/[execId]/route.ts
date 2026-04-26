import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import type { Plan } from '@uni-agent/shared';
import { store } from '@/lib/store';

function simulatedExecution(raw: any) {
  const plan: Plan = raw._plan;
  const elapsed = Date.now() - new Date(raw.createdAt).getTime();

  const steps = plan.steps.map((s, i) => {
    const submitted = (i + 1) * 2500;
    const confirmed = submitted + 2000;
    const status = elapsed >= confirmed ? 'confirmed' : elapsed >= submitted ? 'submitted' : 'pending';
    const txHash = elapsed >= submitted ? `0x${nanoid(40)}` : undefined;
    return { type: s.type, status, ...(txHash ? { txHash } : {}) };
  });

  const completed = elapsed >= plan.steps.length * 4500 + 1000;

  if (completed) {
    return {
      ...raw,
      status: 'completed',
      steps,
      position: {
        positionId: `pos_${raw.executionId.slice(5)}`,
        pool: 'USDC/WETH 0.05%',
        token0Amount: plan.steps[0]?.amountIn ?? '0',
        token1Amount: plan.steps[0]?.estimatedAmountOut ?? '0',
        liquidity: '847392918274',
      },
    };
  }

  return { ...raw, status: 'submitted', steps };
}

export async function GET(_req: Request, { params }: { params: Promise<{ execId: string }> }) {
  const { execId } = await params;
  const exec = await store.executions.get(execId);
  if (!exec) return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
  return NextResponse.json(simulatedExecution(exec));
}
