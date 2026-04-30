import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { CreateIntentSchema } from '@uni-agent/shared';
import type { Intent } from '@uni-agent/shared';
import { store } from '@/lib/store';
import { createIntentOnChain } from '@/lib/services/registry';
import { BASE_SEPOLIA } from '@uni-agent/shared';

export async function POST(req: Request) {
  const body = await req.json();
  const result = CreateIntentSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const intent: Intent = {
    intentId: `int_${nanoid(8)}`,
    ...result.data,
    status: 'created',
    createdAt: new Date().toISOString(),
  };

  await store.intents.set(intent.intentId, intent);

  // Fire-and-forget: mirror intent on-chain so IntentRegistry tracks it.
  // Errors here don't fail the request — the off-chain flow is the source of truth for v0.
  createIntentOnChain({
    intentId:    intent.intentId,
    userAddress: intent.userAddress,
    asset:       BASE_SEPOLIA.USDC,
    amount:      intent.inputAmount,
    risk:        intent.risk ?? 'medium',
  }).catch((err: unknown) => {
    console.error('[registry] createIntent on-chain failed:', err);
  });

  return NextResponse.json({ intentId: intent.intentId, status: intent.status }, { status: 201 });
}
