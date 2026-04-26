import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { CreateIntentSchema } from '@uni-agent/shared';
import type { Intent } from '@uni-agent/shared';
import { store } from '@/lib/store';

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

  store.intents.set(intent.intentId, intent);
  return NextResponse.json({ intentId: intent.intentId, status: intent.status }, { status: 201 });
}
