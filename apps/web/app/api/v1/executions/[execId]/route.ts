import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import type { Plan } from '@uni-agent/shared';
import { store } from '@/lib/store';

// Compute simulated execution state based on elapsed time — no background process needed
function simulatedExecution(raw: any) {
  const plan: Plan = raw._plan;
  const elapsed = Date.now() - new Date(raw.createdAt).getTime();
  const stepCount = plan.steps.length;

  // Each step: submitted at 2.5s, confirmed at 4.5s
  const steps = plan.steps.map((s, i) => {
    const submitted = (i + 1) * 2500;
    const confirmed = submitted + 2000;
    const status = elapsed >= confirmed ? 'confirmed' : elapsed >= submitted ? 'submitted' : 'pending';
    const txHash = elapsed >= submitted ? `0x${nanoid(40)}` : undefined;
    return { type: s.type, status, ...(txHash ? { txHash } : {}) };
  });

  const allConfirmed = steps.every((s) => s.status === 'confirmed');
  const completedAt = stepCount * 4500 + 1000;
  const completed = elapsed >= completedAt;

  if (completed && allConfirmed) {
    const swapQuote = plan.steps[0]?.estimatedAmountOut ?? '0';
    const usdcAmount = plan.steps[0]?.amountIn ?? plan.steps[1]?.token0AmountIn ?? '0';
    return {
      ...raw,
      status: 'completed',
      steps,
      position: {
        positionId: `pos_${raw.executionId.slice(5)}`,
        pool: 'USDC/WETH 0.05%',
        token0Amount: usdcAmount,
        token1Amount: swapQuote,
        liquidity: '847392918274',
      },
    };
  }

  return { ...raw, status: 'submitted', steps };
}

export async function GET(_req: Request, { params }: { params: Promise<{ execId: string }> }) {
  const { execId } = await params;
  const exec = store.executions.get(execId);
  if (!exec) return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
  const { _plan, ...safe } = exec as any;
  void _plan;
  return NextResponse.json(simulatedExecution(exec));
}
