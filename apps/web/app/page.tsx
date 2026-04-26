'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import type { Plan } from '@uni-agent/shared';

// ── types ─────────────────────────────────────────────────────────────────────

type AppStep = 'intent' | 'planning' | 'plan' | 'executing' | 'position';

type PlanResponse = {
  intentId: string;
  recommendedPlanId?: string;
  plans: Plan[];
};

type ExecStep = { type: string; status: string; txHash?: string };

type Execution = {
  executionId: string;
  status: string;
  steps: ExecStep[];
  position?: {
    pool: string;
    token0Amount: string;
    token1Amount: string;
    liquidity?: string;
  };
};

// ── helpers ───────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const api = (path: string) => `${API}${path}`;

function fmt(wei: string, decimals: number): string {
  if (!wei || wei === '0') return '0';
  const n = Number(BigInt(wei)) / 10 ** decimals;
  return n < 0.0001 ? n.toExponential(4) : n.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function shortAddr(addr: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
}

// ── sub-components ────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="header">
      <div className="header-logo">
        ◈ <span>INTENT</span> ROUTER
      </div>
      <div className="header-meta">
        <span className="chain-badge">BASE SEPOLIA</span>
        <span className="chain-badge">UNISWAP v4</span>
      </div>
    </header>
  );
}

function StatusRow({ label, done }: { label: string; done?: boolean }) {
  return (
    <div className="status-row">
      <div className={`status-dot${done ? ' done' : ''}`} />
      {label}
    </div>
  );
}

function PlanSteps({ plan }: { plan: Plan }) {
  const swap = plan.steps.find((s) => s.type === 'swap');
  const lp = plan.steps.find((s) => s.type === 'add_liquidity');

  return (
    <>
      {swap && (
        <div className="step-row">
          <div className="step-num">01</div>
          <div>
            <div className="step-type">SWAP</div>
            <div className="step-detail">
              {fmt(swap.amountIn ?? '0', 6)} USDC<br />
              ↓ {fmt(swap.estimatedAmountOut ?? '0', 18)} WETH
            </div>
          </div>
          <div>
            <div className="live-badge">LIVE</div>
          </div>
        </div>
      )}
      {lp && (
        <div className="step-row">
          <div className="step-num">02</div>
          <div>
            <div className="step-type">ADD_LIQUIDITY</div>
            <div className="step-detail">
              USDC / WETH · 0.05%<br />
              FULL RANGE
            </div>
          </div>
          <div>
            <div className="step-amount">{fmt(lp.token0AmountIn ?? '0', 6)}</div>
            <div className="step-amount-sub">USDC</div>
            <div className="step-amount">{fmt(lp.token1AmountIn ?? '0', 18)}</div>
            <div className="step-amount-sub">WETH</div>
          </div>
        </div>
      )}
    </>
  );
}

function StatsGrid({ plan }: { plan: Plan }) {
  return (
    <div className="stats-grid">
      <div className="stat-cell">
        <div className="stat-label">GAS EST</div>
        <div className="stat-value">${plan.estimatedGasUsd}</div>
      </div>
      <div className="stat-cell">
        <div className="stat-label">RISK</div>
        <div className="stat-value">{plan.riskScore.toUpperCase()}</div>
      </div>
      <div className="stat-cell">
        <div className="stat-label">MAX LOSS</div>
        <div className="stat-value">${plan.risk.maxLossUsd}</div>
      </div>
      <div className="stat-cell">
        <div className="stat-label">APY EST</div>
        <div className="stat-value">{(plan.estimatedNetApyBps / 100).toFixed(2)}%</div>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Page() {
  const [step, setStep] = useState<AppStep>('intent');
  const [goal, setGoal] = useState('');
  const [amount, setAmount] = useState('100000000');
  const [risk, setRisk] = useState<'low' | 'medium' | 'high'>('low');
  const [address, setAddress] = useState('');

  const [intentId, setIntentId] = useState('');
  const [planRes, setPlanRes] = useState<PlanResponse | null>(null);
  const [execution, setExecution] = useState<Execution | null>(null);
  const [error, setError] = useState('');

  const [isPending, startTransition] = useTransition();
  const [planningPhase, setPlanningPhase] = useState(0);

  // animate planning phases
  useEffect(() => {
    if (step !== 'planning') return;
    const labels = ['QUERYING UNISWAP TRADING API', 'COMPUTING LP PARAMETERS', 'SIMULATING BUNDLE'];
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(i + 1, labels.length - 1);
      setPlanningPhase(i);
    }, 1400);
    return () => clearInterval(id);
  }, [step]);

  // poll execution
  const pollExecution = useCallback((execId: string) => {
    const id = setInterval(async () => {
      const res = await fetch(api(`/v1/executions/${execId}`));
      if (!res.ok) return;
      const data = (await res.json()) as Execution;
      setExecution(data);
      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(id);
        if (data.status === 'completed') setStep('position');
      }
    }, 2000);
    return id;
  }, []);

  async function generatePlan() {
    setError('');
    setStep('planning');
    setPlanningPhase(0);

    const body = {
      userAddress: address || '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      inputToken: 'USDC',
      inputAmount: amount,
      goal: goal || 'Make my USDC productive with low risk',
      risk,
      constraints: { maxSlippageBps: 50, deadlineSeconds: 900 },
    };

    const cr = await fetch(api('/v1/intents'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!cr.ok) throw new Error(`Intent failed ${cr.status}`);
    const { intentId: id } = await cr.json() as { intentId: string };
    setIntentId(id);

    const pr = await fetch(api(`/v1/intents/${id}/plan`), { method: 'POST' });
    if (!pr.ok) {
      const { detail } = await pr.json() as { detail?: string };
      throw new Error(detail ?? `Plan failed ${pr.status}`);
    }
    const data = (await pr.json()) as PlanResponse;
    setPlanRes(data);
    setStep('plan');
  }

  async function executeplan(planId: string) {
    setStep('executing');
    const res = await fetch(api(`/v1/intents/${intentId}/plans/${planId}/execute`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permit2Signature: '0x', userAddress: address }),
    });
    if (!res.ok) throw new Error(`Execute failed ${res.status}`);
    const { executionId } = await res.json() as { executionId: string };
    pollExecution(executionId);
  }

  const planningLabels = [
    'QUERYING UNISWAP TRADING API',
    'COMPUTING LP PARAMETERS',
    'SIMULATING BUNDLE',
  ];

  const selectedPlan = planRes?.plans[0];

  return (
    <div className="shell">
      <Header />

      {/* ── INTENT FORM ── */}
      {(step === 'intent' || step === 'planning') && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">INTENT</span>
            <span className="panel-id">USDC → BASE SEPOLIA</span>
          </div>
          <div className="panel-body">
            <div className="address-row">
              <label className="field-label">WALLET ADDRESS</label>
              <input
                className="field-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x..."
                spellCheck={false}
              />
            </div>

            <textarea
              className="intent-textarea"
              rows={2}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="> e.g. swap 100 USDC for WETH and add liquidity to the USDC/WETH 0.05% pool on Base_"
            />

            <div className="form-row">
              <div>
                <label className="field-label">AMOUNT (USDC UNITS)</label>
                <input
                  className="field-input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div>
                <label className="field-label">RISK PROFILE</label>
                <div className="risk-group">
                  {(['low', 'medium', 'high'] as const).map((r) => (
                    <button key={r} className={`risk-btn${risk === r ? ' active' : ''}`} onClick={() => setRisk(r)}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {step === 'planning' && (
              <div style={{ marginBottom: 16 }}>
                {planningLabels.map((label, i) => (
                  <StatusRow key={label} label={label} done={i < planningPhase} />
                ))}
              </div>
            )}

            <button
              className="btn-primary"
              disabled={isPending || step === 'planning'}
              onClick={() =>
                startTransition(() => {
                  generatePlan().catch((e) => {
                    setError(e instanceof Error ? e.message : String(e));
                    setStep('intent');
                  });
                })
              }
            >
              <span>{step === 'planning' ? 'GENERATING PLAN...' : 'GENERATE PLAN'}</span>
              <span className="btn-arrow">→</span>
            </button>

            {error && <div className="error-bar">ERR {error}</div>}
          </div>
        </div>
      )}

      {/* ── PLAN VIEW ── */}
      {step === 'plan' && selectedPlan && (
        <>
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">EXECUTION PLAN</span>
              <span className="panel-id">{selectedPlan.planId}</span>
            </div>
            <div className="panel-body" style={{ padding: '0 16px' }}>
              <PlanSteps plan={selectedPlan} />
            </div>
            <StatsGrid plan={selectedPlan} />
            {selectedPlan.risk.notes && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-faint)' }}>
                  {selectedPlan.risk.notes.slice(0, 200)}
                </span>
              </div>
            )}
          </div>

          <button
            className="btn-primary"
            onClick={() =>
              startTransition(() => {
                executeplan(selectedPlan.planId).catch((e) =>
                  setError(e instanceof Error ? e.message : String(e))
                );
              })
            }
          >
            <span>EXECUTE PLAN</span>
            <span className="btn-arrow">→</span>
          </button>

          <div style={{ marginTop: 8 }}>
            <button className="btn-ghost" onClick={() => setStep('intent')}>
              ← REVISE INTENT
            </button>
          </div>

          {error && <div className="error-bar">ERR {error}</div>}
        </>
      )}

      {/* ── EXECUTING ── */}
      {(step === 'executing' || step === 'position') && execution && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">EXECUTION</span>
            <span className="panel-id">{execution.executionId}</span>
          </div>
          <div className="panel-body">
            {execution.steps.map((s, i) => (
              <div className="exec-step" key={i}>
                <div className={`exec-indicator ${s.status}`} />
                <div className="exec-type">{s.type.toUpperCase()}</div>
                <div>
                  <div className="exec-status">{s.status.toUpperCase()}</div>
                  {s.txHash && (
                    <div className="exec-hash">{shortAddr(s.txHash)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── POSITION ── */}
      {step === 'position' && execution?.position && (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="panel-header">
            <span className="panel-title">POSITION</span>
            <span className="panel-id" style={{ color: 'var(--green)' }}>● ACTIVE</span>
          </div>
          <div className="panel-body">
            <div className="position-row">
              <span className="pos-key">POOL</span>
              <span className="pos-val">{execution.position.pool}</span>
            </div>
            <div className="position-row">
              <span className="pos-key">TOKEN 0</span>
              <span className="pos-val">{execution.position.token0Amount}</span>
            </div>
            <div className="position-row">
              <span className="pos-key">TOKEN 1</span>
              <span className="pos-val">{execution.position.token1Amount}</span>
            </div>
            {execution.position.liquidity && (
              <div className="position-row">
                <span className="pos-key">LIQUIDITY</span>
                <span className="pos-val">{execution.position.liquidity}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── executing loading state (no execution data yet) ── */}
      {step === 'executing' && !execution && (
        <div className="panel">
          <div className="panel-body">
            <StatusRow label="SUBMITTING TRANSACTION..." />
          </div>
        </div>
      )}
    </div>
  );
}
