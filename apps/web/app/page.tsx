'use client';

import { useState, useTransition } from 'react';
import type { Intent, Plan } from '@uni-agent/shared';

type CreateIntentResponse = {
  intentId: string;
  status: string;
};

type PlanResponse = {
  intentId: string;
  recommendedPlanId?: string;
  plans: Plan[];
};

type BundleResponse = {
  planId: string;
  executionMode: string;
  requiredSignatures: Array<{
    type: string;
    token?: string;
    spender: string;
    amount: string;
    deadline: number;
  }>;
  transaction: {
    chainId: number;
    to: string;
    data: string;
    value: string;
    gasEstimate: string;
  };
  safety: {
    maxLossUsd: string;
    deadline: number;
  };
};

const DEFAULT_FORM = {
  userAddress: '',
  inputAmount: '100000000',
  goal: 'productive_collateral',
  risk: 'low',
  maxSlippageBps: '50',
  deadlineSeconds: '900',
  inputToken: 'USDC',
};

function apiUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  return new URL(path, base).toString();
}

export default function Page() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [planResponse, setPlanResponse] = useState<PlanResponse | null>(null);
  const [bundle, setBundle] = useState<BundleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function runIntentFlow() {
    setError(null);
    setPlanResponse(null);
    setBundle(null);
    setIntent(null);

    const payload = {
      userAddress: form.userAddress,
      inputToken: form.inputToken,
      inputAmount: form.inputAmount,
      goal: form.goal,
      risk: form.risk,
      constraints: {
        maxSlippageBps: Number(form.maxSlippageBps),
        deadlineSeconds: Number(form.deadlineSeconds),
      },
    };

    const createRes = await fetch(apiUrl('/v1/intents'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!createRes.ok) {
      throw new Error(`Intent creation failed (${createRes.status})`);
    }

    const created = (await createRes.json()) as CreateIntentResponse;
    const intentId = created.intentId;

    const planRes = await fetch(apiUrl(`/v1/intents/${intentId}/plan`), { method: 'POST' });
    if (!planRes.ok) {
      throw new Error(`Plan generation failed (${planRes.status})`);
    }

    const planned = (await planRes.json()) as PlanResponse;
    setIntent({ ...payload, intentId, status: created.status as Intent['status'], createdAt: new Date().toISOString() } as Intent);
    setPlanResponse(planned);
  }

  async function loadBundle(planId: string) {
    if (!intent) return;
    const res = await fetch(apiUrl(`/v1/intents/${intent.intentId}/plans/${planId}/bundle`), {
      method: 'POST',
    });
    if (!res.ok) {
      throw new Error(`Bundle build failed (${res.status})`);
    }
    setBundle((await res.json()) as BundleResponse);
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">Intent router for Base</div>
        <h1>Turn stablecoins into productive positions with a single intent.</h1>
        <p>
          Plan swap and LP workflows, quote execution through Uniswap, and keep the control surface
          narrow enough for production use.
        </p>
      </section>

      <section className="grid">
        <form
          className="panel form"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(() => {
              runIntentFlow().catch((err) => setError(err instanceof Error ? err.message : String(err)));
            });
          }}
        >
          <h2>Intent</h2>
          <label>
            User address
            <input
              value={form.userAddress}
              onChange={(event) => setForm({ ...form, userAddress: event.target.value })}
              placeholder="0x..."
              required
            />
          </label>
          <label>
            Input amount
            <input
              value={form.inputAmount}
              onChange={(event) => setForm({ ...form, inputAmount: event.target.value })}
              inputMode="numeric"
              required
            />
          </label>
          <label>
            Goal
            <textarea
              value={form.goal}
              onChange={(event) => setForm({ ...form, goal: event.target.value })}
              rows={4}
              required
            />
          </label>
          <div className="row">
            <label>
              Risk
              <select value={form.risk} onChange={(event) => setForm({ ...form, risk: event.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label>
              Slippage bps
              <input
                value={form.maxSlippageBps}
                onChange={(event) => setForm({ ...form, maxSlippageBps: event.target.value })}
                inputMode="numeric"
                required
              />
            </label>
          </div>
          <button type="submit" disabled={isPending}>
            {isPending ? 'Planning...' : 'Generate plan'}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </form>

        <div className="stack">
          <section className="panel">
            <div className="section-header">
              <h2>Plan</h2>
              {planResponse?.recommendedPlanId ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    startTransition(() => {
                      loadBundle(planResponse.recommendedPlanId!).catch((err) =>
                        setError(err instanceof Error ? err.message : String(err))
                      );
                    });
                  }}
                >
                  Preview bundle
                </button>
              ) : null}
            </div>
            {planResponse ? (
              <div className="plans">
                {planResponse.plans.map((plan) => (
                  <article className="plan-card" key={plan.planId}>
                    <div className="plan-meta">
                      <strong>{plan.label}</strong>
                      <span>{plan.riskScore} risk</span>
                    </div>
                    <div className="stats">
                      <span>{plan.estimatedNetApyBps} bps APY</span>
                      <span>{plan.estimatedGasUsd} gas USD</span>
                    </div>
                    <ol>
                      {plan.steps.map((step) => (
                        <li key={step.stepId}>
                          <span>{step.type}</span>
                          <code>{step.provider}</code>
                        </li>
                      ))}
                    </ol>
                    <p className="muted">{plan.risk.notes}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">Submit an intent to see quoted execution steps.</p>
            )}
          </section>

          <section className="panel">
            <h2>Execution preview</h2>
            {bundle ? (
              <div className="bundle">
                <p>
                  <strong>To:</strong> {bundle.transaction.to}
                </p>
                <p>
                  <strong>Gas:</strong> {bundle.transaction.gasEstimate}
                </p>
                <p>
                  <strong>Safety:</strong> max loss {bundle.safety.maxLossUsd}
                </p>
                <pre>{JSON.stringify(bundle.requiredSignatures, null, 2)}</pre>
              </div>
            ) : (
              <p className="muted">Bundle preview appears here once a plan is selected.</p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
