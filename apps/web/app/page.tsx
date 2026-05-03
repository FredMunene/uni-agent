'use client';

import { useEffect, useState } from 'react';
import { useAccount, useEnsName, useEnsAvatar, usePublicClient, useSignMessage, useWriteContract } from 'wagmi';
import { mainnet, base } from 'wagmi/chains';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ACTIVE_MARKET } from '@/lib/markets';
import { buildDefaultGoal, marketAmountLabel, marketIntentPlaceholder, marketPoolLabel } from '@/lib/marketPresentation';
import { buildExecutionDigest, buildExecutionSteps, buildExecutorExecution } from '@/lib/onchain';
import type { MonitorSnapshot } from '@/lib/services/monitor';
import { derivePositionRangeFromPlan, formatPositionRange } from '@/lib/services/positionRange';
import { deriveRebalanceIntentDraft } from '@/lib/services/rebalance';

function useResolvedName(address?: `0x${string}`) {
  const { data: baseName } = useEnsName({ address, chainId: base.id });
  const { data: ensName }  = useEnsName({ address, chainId: mainnet.id });
  const { data: ensAvatar } = useEnsAvatar({
    name: baseName ?? ensName ?? undefined,
    chainId: mainnet.id,
  });
  const displayName = baseName ?? ensName ?? null;
  return { displayName, ensAvatar, baseName, ensName };
}

function WalletButton() {
  const { address } = useAccount();
  const { displayName, ensAvatar, baseName, ensName } = useResolvedName(address);

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;

        if (!connected) {
          return (
            <button onClick={openConnectModal} style={{
              background: 'var(--orange)', border: 'none', borderRadius: 99,
              color: '#fff', fontSize: 13, fontWeight: 600,
              padding: '8px 18px', cursor: 'pointer', transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--orange-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--orange)'}
            >
              Connect wallet
            </button>
          );
        }

        const name = displayName
          ?? `${account.address.slice(0, 6)}…${account.address.slice(-4)}`;
        const avatar = ensAvatar
          ?? account.ensAvatar
          ?? `https://api.dicebear.com/7.x/identicon/svg?seed=${account.address}`;
        const isNamed = !!(baseName ?? ensName ?? account.ensName);

        return (
          <button onClick={openAccountModal} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--surface)', border: '1.5px solid var(--border)',
            borderRadius: 99, padding: '5px 12px 5px 6px',
            cursor: 'pointer', boxShadow: 'var(--shadow)', transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.borderColor = 'var(--orange-dim)';
            b.style.boxShadow = 'var(--shadow-md)';
          }}
          onMouseLeave={e => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.borderColor = 'var(--border)';
            b.style.boxShadow = 'var(--shadow)';
          }}
          >
            {/* avatar */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <img src={avatar} alt="" width={28} height={28}
                style={{ borderRadius: '50%', display: 'block' }} />
              {/* green online dot */}
              <div style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 8, height: 8, borderRadius: '50%',
                background: 'var(--green)',
                border: '2px solid var(--surface)',
              }} />
            </div>

            {/* name / address */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 }}>
              <span style={{
                fontSize: 13, fontWeight: 600, color: 'var(--text)',
                fontFamily: isNamed ? 'var(--sans)' : 'var(--mono)',
                letterSpacing: isNamed ? 0 : '0.02em',
              }}>
                {name}
              </span>
              {isNamed && (
                <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
                  {account.address.slice(0, 6)}…{account.address.slice(-4)}
                </span>
              )}
            </div>

            {/* chevron */}
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"
              style={{ color: 'var(--text-faint)', flexShrink: 0, marginLeft: 2 }}>
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
import type { Plan } from '@uni-agent/shared';

// ── types ────────────────────────────────────────────────────────────────────

type AppStep = 'idle' | 'planning' | 'strategies' | 'approval' | 'executing' | 'done';

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
    positionId: string;
    pool: string;
    token0Amount: string;
    token1Amount: string;
    liquidity?: string;
    tickLower?: number | null;
    tickUpper?: number | null;
    currentTick?: number | null;
  };
};

type MonitorResponse = {
  snapshot?: MonitorSnapshot;
  monitorSource?: 'live_tick' | 'stored_tick' | 'stored_fallback' | 'unknown';
};

// ── helpers ──────────────────────────────────────────────────────────────────

const api = (path: string) => `/api${path}`;

function fmt(wei: string, decimals: number): string {
  if (!wei || wei === '0') return '0';
  const n = Number(BigInt(wei)) / 10 ** decimals;
  return n < 0.0001 ? n.toExponential(4) : n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

const STRATEGY_META: Record<string, { name: string; desc: string; recommended?: boolean }> = {
  conservative: { name: 'Safe & Steady',    desc: 'Stable pairs, minimal risk, consistent returns' },
  balanced:     { name: 'Balanced Growth',  desc: 'Mixed exposure, moderate yield, manageable risk', recommended: true },
  aggressive:   { name: 'Maximum Yield',    desc: 'Concentrated range, high APR, active management needed' },
};

const RISK_BADGE: Record<string, string> = {
  low:    'risk-low',
  medium: 'risk-medium',
  high:   'risk-high',
};

const RISK_LABEL: Record<string, string> = {
  low: 'Low risk', medium: 'Moderate risk', high: 'Higher risk',
};

function stepLabel(type: string): string {
  return ({ swap: 'Splitting your funds', add_liquidity: 'Opening your position' } as Record<string, string>)[type] ?? type;
}

function stepIcon(status: string): string {
  return ({ pending: '○', submitted: '◌', confirmed: '✓', failed: '✕' } as Record<string, string>)[status] ?? '○';
}

function buildExecutionMessage(intentId: string, planId: string, planHash: string, userAddress: string): string {
  return [
    'Uni-Agent execution authorization',
    `intentId: ${intentId}`,
    `planId: ${planId}`,
    `planHash: ${planHash}`,
    `userAddress: ${userAddress}`,
  ].join('\n');
}

// ── agent / solver docs view ─────────────────────────────────────────────────

type SolverCard = {
  address: string;
  name: string;
  ensName: string;
  builderCode: string;
  stakeEth: string;
  fulfilledCount: number;
  status: string;
  reputation: { avgOutcomeScore: number; avgAprAccuracy: number; reportedCount: number };
};

function useSolvers() {
  const [solvers, setSolvers] = useState<SolverCard[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/api/v1/solvers')
      .then(r => r.json())
      .then(d => setSolvers(d.solvers ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  return { solvers, loading };
}

function AgentView({ onBack }: { onBack: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  const registerSnippet = `POST /api/v1/solvers/register
Content-Type: application/json

{
  "solverAddress": "0xYourAddress",
  "solverName":    "MyAgent-v1",
  "stakeWei":      "50000000000000000"
}`;

  const bidSnippet = `POST /api/v1/intents/:id/strategies
Content-Type: application/json

{
  "solverAddress": "0xYourAddress",
  "strategy":      "aggressive",
  "label":         "MyAgent Max Yield",
  "estimatedNetApyBps": 4200,
  "estimatedGasUsd":    "1.80",
  "riskScore":     "high",
  "bidBondWei":    "1000000000000000",
  "validUntil":    "2026-04-28T12:00:00Z",
  "steps": [
    {
      "stepId":    "step_001",
      "type":      "swap",
      "provider":  "dex",
      "chainId":   84532,
      "fromToken": "0xUSDC",
      "toToken":   "0xWETH",
      "amountIn":  "500000000"
    },
    {
      "stepId":    "step_002",
      "type":      "add_liquidity",
      "provider":  "dex_v4",
      "chainId":   84532,
      "tickLower": -887272,
      "tickUpper":  887272
    }
  ]
}`;

  const webhookSnippet = `// Discover what the protocol supports
const skills = await fetch('/api/v1/skills').then(r => r.json());

// Listen for new intents (polling)
const intents = await fetch('/api/v1/intents?status=planned')
  .then(r => r.json());

// Submit your strategy for each intent
for (const intent of intents.items) {
  await fetch(\`/api/v1/intents/\${intent.intentId}/strategies\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ solverAddress, ...yourStrategy }),
  });
}`;

  return (
    <div className="shell">
      <header className="header">
        <div className="header-logo">◈ <span>uni</span>agent</div>
        <button className="btn-ghost" style={{ fontSize: 13, padding: '6px 14px' }} onClick={onBack}>
          ← Back
        </button>
      </header>

      <div style={{ padding: '8px 0 24px' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          Build a solver agent
        </div>
        <div style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Register your AI agent as a solver. When users post intents, your agent competes to offer the best strategy. If the user picks yours, you earn a fee.
        </div>
      </div>

      {/* Skills discovery */}
      <div style={{ marginBottom: 28, padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Agent capability manifest</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Fetch all protocol skills, endpoints, and economics in one call. Wire this into your agent&apos;s tool discovery loop.
            </div>
          </div>
          <a
            href="https://uni-agent-gamma.vercel.app/api/v1/skills"
            target="_blank"
            rel="noopener noreferrer"
            style={{ flexShrink: 0, textDecoration: 'none' }}
          >
            <code style={{
              display: 'block',
              background: '#0F0F0F',
              border: '1px solid #2A2A2A',
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 12,
              fontFamily: 'var(--mono)',
              color: 'var(--orange)',
              whiteSpace: 'nowrap',
            }}>
              GET /api/v1/skills ↗
            </code>
          </a>
        </div>
        <div style={{ marginTop: 12 }}>
          <CodeBlock
            code={`curl https://uni-agent-gamma.vercel.app/api/v1/skills`}
            id="skills-curl"
            copied={copied}
            onCopy={copy}
          />
        </div>
      </div>

      {/* How it works */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { n: '01', title: 'Register', desc: 'Lock a 0.05 ETH stake on-chain to join the solver network.' },
          { n: '02', title: 'Compete', desc: 'Submit strategies with a 0.001 ETH bid bond when intents are broadcast.' },
          { n: '03', title: 'Earn',    desc: '0.1% execution fee when a user runs your strategy. 70% to you, 30% treasury.' },
        ].map(s => (
          <div key={s.n} style={{
            padding: '14px 16px',
            border: '1px solid var(--border)',
            borderRadius: 16,
            background: 'var(--surface)',
          }}>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--orange)', marginBottom: 6, fontWeight: 600 }}>{s.n}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Step 1: Register */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: 'var(--orange)', color: '#fff', borderRadius: 99, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>1</span>
          Register your solver
        </div>
        <CodeBlock code={registerSnippet} id="register" copied={copied} onCopy={copy} />
      </div>

      {/* Step 2: Submit bid */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: 'var(--orange)', color: '#fff', borderRadius: 99, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>2</span>
          Submit a strategy bid
        </div>
        <CodeBlock code={bidSnippet} id="bid" copied={copied} onCopy={copy} />
      </div>

      {/* Step 3: Loop */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: 'var(--orange)', color: '#fff', borderRadius: 99, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>3</span>
          Poll for intents &amp; keep competing
        </div>
        <CodeBlock code={webhookSnippet} id="loop" copied={copied} onCopy={copy} />
      </div>

      {/* Economics table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: 28 }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-soft)', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
          SOLVER ECONOMICS
        </div>
        {[
          ['Registration stake', '0.05 ETH', 'Slashable if you submit malicious strategies'],
          ['Bid bond per strategy', '0.001 ETH', 'Returned if your strategy is not selected'],
          ['Execution fee', '0.1% of intent value', '70% solver · 30% protocol treasury'],
          ['Slash condition', 'Malicious / incorrect execution', 'Full stake forfeited'],
        ].map(([label, value, note]) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <div style={{ color: 'var(--text)', fontWeight: 500 }}>{label}</div>
            <div style={{ color: 'var(--orange)', fontFamily: 'var(--mono)', fontWeight: 600 }}>{value}</div>
            <div style={{ color: 'var(--text-muted)' }}>{note}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '14px 16px', borderRadius: 16, background: 'var(--orange-light)', border: '1px solid var(--orange)', fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
        <strong>Open protocol.</strong> Any AI agent, algorithm, or off-chain service can participate as a solver — no permission required. Users always hold their own keys; solvers only provide strategies, never custody.
      </div>
    </div>
  );
}

function CodeBlock({ code, id, copied, onCopy }: {
  code: string; id: string; copied: string | null; onCopy: (text: string, key: string) => void;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <pre style={{
        background: '#0F0F0F',
        border: '1px solid #2A2A2A',
        borderRadius: 12,
        padding: '14px 16px',
        fontSize: 12,
        fontFamily: 'var(--mono)',
        color: '#E5E5E5',
        overflowX: 'auto',
        margin: 0,
        lineHeight: 1.6,
      }}>
        <code>{code}</code>
      </pre>
      <button
        onClick={() => onCopy(code, id)}
        style={{
          position: 'absolute', top: 8, right: 8,
          background: copied === id ? '#16A34A' : '#222',
          border: 'none', borderRadius: 8,
          color: copied === id ? '#fff' : '#888',
          fontSize: 11, padding: '4px 10px',
          cursor: 'pointer', fontFamily: 'var(--mono)',
          transition: 'all 0.15s',
        }}
      >
        {copied === id ? '✓ copied' : 'copy'}
      </button>
    </div>
  );
}

// ── landing screen ────────────────────────────────────────────────────────────

type Mode = 'landing' | 'human' | 'agent';

function SolverRepBadge({ score, count }: { score: number; count: number }) {
  if (count === 0) return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No reports yet</span>;
  const pct = (score / 100).toFixed(0);
  return <span style={{ fontSize: 11, color: '#16A34A', fontFamily: 'var(--mono)' }}>{pct}% score</span>;
}

function LandingView({ onSelect }: { onSelect: (m: 'human' | 'agent') => void }) {
  const [hovered, setHovered] = useState<'human' | 'agent' | null>(null);
  const { solvers, loading: solversLoading } = useSolvers();

  return (
    <div style={{ background: 'var(--bg)' }}>

      {/* ── Section 1: Hero ─────────────────────────────────────────────────── */}
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
      }}>
        {/* logo */}
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text)', marginBottom: 16, fontFamily: 'var(--mono)' }}>
          ◈ <span style={{ color: 'var(--orange)' }}>uni</span>agent
        </div>

        <div style={{ fontSize: 17, color: 'var(--text-muted)', marginBottom: 52, textAlign: 'center', maxWidth: 480, lineHeight: 1.7 }}>
          You tell it what you want to do with your money.
          Competing AI agents race to provide the best strategy.
          You stay in control — the winning agent earns a fee when you execute.
        </div>

        {/* selector */}
        <div style={{ display: 'flex', gap: 16, width: '100%', maxWidth: 520 }}>
          {(['human', 'agent'] as const).map((m) => (
            <button
              key={m}
              onClick={() => onSelect(m)}
              onMouseEnter={() => setHovered(m)}
              onMouseLeave={() => setHovered(null)}
              style={{
                flex: 1,
                padding: '36px 28px',
                border: `2px solid ${hovered === m ? 'var(--orange)' : 'var(--border)'}`,
                borderRadius: 20,
                background: hovered === m ? 'var(--orange-light)' : 'var(--surface)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--orange)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 12 }}>
                {m === 'human' ? '01' : '02'}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>
                {m === 'human' ? 'Human' : 'Agent'}
              </div>
              <div style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {m === 'human'
                  ? 'State your intent. Get competing strategies. Execute the best one.'
                  : 'Register as a solver. Submit strategies. Earn fees when users execute.'}
              </div>
              <div style={{ marginTop: 22, fontSize: 14, color: 'var(--orange)', fontWeight: 600 }}>
                {m === 'human' ? 'Open platform →' : 'View API docs →'}
              </div>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 48, fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--mono)', letterSpacing: '0.1em' }}>
          BASE · UNISWAP V4
        </div>

        {/* scroll hint */}
        <div style={{ marginTop: 40, fontSize: 12, color: 'var(--text-faint)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span>Meet the agents</span>
          <span style={{ fontSize: 16 }}>↓</span>
        </div>
      </div>

      {/* ── Section 2: Solver agents ─────────────────────────────────────────── */}
      <div style={{ padding: '80px 24px 80px', maxWidth: 680, margin: '0 auto' }}>
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
            Active solver agents
          </div>
          <div style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            These AI agents compete to give you the best LP strategy on every intent.
            Reputation is tracked on-chain — the best agents earn more.
          </div>
        </div>

        {solversLoading ? (
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', padding: '32px 0' }}>Loading agents…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {solvers.map((s, i) => (
              <div key={s.address} style={{
                padding: '18px 20px',
                border: '1px solid var(--border)',
                borderRadius: 20,
                background: 'var(--surface)',
                display: 'grid',
                gridTemplateColumns: '32px 1fr auto',
                gap: 14,
                alignItems: 'center',
              }}>
                {/* rank */}
                <div style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--orange)', fontWeight: 700, textAlign: 'center' }}>
                  {String(i + 1).padStart(2, '0')}
                </div>

                {/* identity */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{s.name}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                      background: s.status === 'Active' ? 'rgba(22,163,74,0.12)' : 'rgba(148,163,184,0.12)',
                      color: s.status === 'Active' ? '#16A34A' : 'var(--text-muted)',
                    }}>{s.status}</span>
                    {(s as SolverCard & { demo?: boolean }).demo && (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'rgba(249,115,22,0.08)', color: 'var(--orange)', fontWeight: 600 }}>demo</span>
                    )}
                  </div>
                  {s.ensName && (
                    <div style={{ fontSize: 12, color: 'var(--orange)', fontFamily: 'var(--mono)' }}>{s.ensName}</div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                    {s.address.slice(0, 10)}…{s.address.slice(-6)}
                  </div>
                </div>

                {/* stats */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--orange)', fontWeight: 600 }}>{s.stakeEth} ETH</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.fulfilledCount} fulfilled</div>
                  <div style={{ marginTop: 2 }}>
                    <SolverRepBadge score={s.reputation.avgOutcomeScore} count={s.reputation.reportedCount} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <button
            onClick={() => onSelect('agent')}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 99,
              color: 'var(--text-muted)', fontSize: 13, padding: '8px 20px',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--orange)'; e.currentTarget.style.color = 'var(--orange)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            Register your agent →
          </button>
        </div>
      </div>

    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Page() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();

  const [mode, setMode] = useState<Mode>('landing');
  const [step, setStep]           = useState<AppStep>('idle');
  const [goal, setGoal]           = useState('');
  const [amount, setAmount]       = useState('100');
  const [risk, setRisk]           = useState<'low' | 'medium' | 'high'>('medium');

  const [intentId, setIntentId]   = useState('');
  const [planRes, setPlanRes]     = useState<PlanResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [execution, setExecution] = useState<Execution | null>(null);
  const [monitor, setMonitor] = useState<MonitorSnapshot | null>(null);
  const [monitorSource, setMonitorSource] = useState<MonitorResponse['monitorSource'] | null>(null);
  const [error, setError]         = useState('');
  const selectedPlan = planRes?.plans.find((p) => p.planId === selectedId) ?? null;

  const amountNum = Number(amount);
  const amountTooSmall = amountNum > 0 && amountNum < 10;

  useEffect(() => {
    const positionId = execution?.position?.positionId;
    if (!positionId || step !== 'done') {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(api(`/v1/positions/${positionId}/monitor`));
        if (!res.ok) return;
        const data = await res.json() as MonitorResponse;
        if (!cancelled && data.snapshot) {
          setMonitor(data.snapshot);
          setMonitorSource(data.monitorSource ?? 'unknown');
        }
      } catch {
        // ignore demo monitor blips
      }
    };

    void poll();
    const id = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [execution?.position?.positionId, step]);

  async function submitIntent(nextGoal = goal, nextAmount = amount) {
    if (!address) return;
    setError('');
    setStep('planning');
    setPlanRes(null);
    setSelectedId(null);
    setMonitor(null);
    setMonitorSource(null);

    try {
      const createRes = await fetch(api('/v1/intents'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: address,
          inputToken: 'USDC',
          inputAmount: String(Math.floor(Number(nextAmount) * 1_000_000)),
          goal: nextGoal || buildDefaultGoal(nextAmount, risk),
          risk,
          constraints: { maxSlippageBps: 50, deadlineSeconds: 900 },
        }),
      });
      if (!createRes.ok) throw new Error('Could not submit your request.');
      const { intentId: id } = await createRes.json() as { intentId: string };
      setIntentId(id);

      const planRes_ = await fetch(api(`/v1/intents/${id}/plan`), { method: 'POST' });
      if (!planRes_.ok) {
        const { detail } = await planRes_.json() as { detail?: string };
        throw new Error(detail ?? 'Could not generate strategies.');
      }
      const data = await planRes_.json() as PlanResponse;
      setPlanRes(data);
      setStep('strategies');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setStep('idle');
    }
  }

  function resetIntent() {
    setStep('idle');
    setPlanRes(null);
    setSelectedId(null);
    setExecution(null);
    setMonitor(null);
    setMonitorSource(null);
    setIntentId('');
    setError('');
  }

  async function handleSubmit() {
    await submitIntent();
  }

  async function handleRebalance() {
    if (!execution?.position) return;
    const draft = deriveRebalanceIntentDraft(execution.position);
    setGoal(draft.goal);
    setAmount(draft.amount);
    await submitIntent(draft.goal, draft.amount);
  }

  async function handleSelect(planId: string) {
    setSelectedId(planId);
    setStep('approval');
    setError('');
    setMonitor(null);
    setMonitorSource(null);
  }

  async function handleAuthorizeSelectedPlan() {
    if (!selectedPlan?.planHash || !address) {
      setError('Missing plan hash for execution.');
      return;
    }

    setStep('executing');
    setError('');
    setMonitor(null);
    setMonitorSource(null);

    try {
      const permit2Signature = await signMessageAsync({
        message: buildExecutionMessage(intentId, selectedPlan.planId, selectedPlan.planHash, address),
      });

      const res = await fetch(api(`/v1/intents/${intentId}/plans/${selectedPlan.planId}/execute`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permit2Signature,
          userAddress: address,
          planHash: selectedPlan.planHash,
        }),
      });
      if (!res.ok) throw new Error('Execution failed to start.');
      const { executionId } = await res.json() as { executionId: string };

      const executorAddress = process.env.NEXT_PUBLIC_INTENT_EXECUTOR_ADDRESS;
      const positionRegistryAddress = process.env.NEXT_PUBLIC_POSITION_REGISTRY_ADDRESS;
      if (!executorAddress || !positionRegistryAddress) {
        throw new Error('Onchain execution is not configured.');
      }

      const deadline = Math.floor(Date.now() / 1000) + 900;

      // Build steps first — on-chain planHash = keccak256(abi.encode(steps))
      const { steps, onchainPlanHash, positionId, position } = buildExecutionSteps({
        userAddress: address as `0x${string}`,
        intentId,
        planId: selectedPlan.planId,
        plan: selectedPlan,
        positionRegistryAddress: positionRegistryAddress as `0x${string}`,
      });

      const onchainDigest = buildExecutionDigest({
        executorAddress: executorAddress as `0x${string}`,
        intentId,
        userAddress: address as `0x${string}`,
        deadline,
        planHash: onchainPlanHash,
      });
      const onchainSignature = await signMessageAsync({
        message: { raw: onchainDigest },
      });

      const txConfig = buildExecutorExecution({
        executorAddress: executorAddress as `0x${string}`,
        intentId,
        userAddress:     address as `0x${string}`,
        onchainPlanHash,
        signature:       onchainSignature as `0x${string}`,
        deadline:        BigInt(deadline),
        steps,
        positionId,
        position,
      });

      const txHash = await writeContractAsync(txConfig);
      if (!publicClient) throw new Error('Public client unavailable.');
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      const positionRange = derivePositionRangeFromPlan(selectedPlan);

      setExecution({
        executionId,
        status: 'completed',
        steps: [
          {
            type: 'add_liquidity',
            status: 'confirmed',
            txHash,
          },
        ],
        position: {
          positionId: txConfig.positionId,
          pool: marketPoolLabel(),
          token0Amount: txConfig.position.amount0.toString(),
          token1Amount: txConfig.position.amount1.toString(),
          liquidity: txConfig.position.liquidity.toString(),
          tickLower: positionRange?.tickLower ?? null,
          tickUpper: positionRange?.tickUpper ?? null,
          currentTick: positionRange?.currentTick ?? null,
        },
      });
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Execution failed.');
      setStep('approval');
    }
  }

  const isLoading = step === 'planning';
  const showStrategies = step === 'strategies';
  const showApproval = step === 'approval' || step === 'executing' || step === 'done';

  if (mode === 'landing') return <LandingView onSelect={setMode} />;
  if (mode === 'agent')   return <AgentView onBack={() => setMode('landing')} />;

  return (
    <div className="shell">

      {/* ── header ── */}
      <header className="header">
        <button
          onClick={() => setMode('landing')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <div className="header-logo">◈ <span>uni</span>agent</div>
        </button>
        <WalletButton />
      </header>

      {/* ── screen 1: intent input / summary ── */}
      <div className="intent-box">
        {step === 'idle' || step === 'planning' ? (
          <>
            <textarea
              className="intent-textarea"
              rows={2}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={marketIntentPlaceholder()}
              disabled={isLoading}
            />

            <div className="form-row">
              <div>
                <label className="field-label">{marketAmountLabel()}</label>
                <input
                  className="field-input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="100"
                  disabled={isLoading}
                />
                {amountTooSmall && <div className="field-error">Minimum 10 {ACTIVE_MARKET.inputTokenSymbol}</div>}
              </div>
              <div>
                <label className="field-label">Risk</label>
                <div className="risk-group">
                  {(['low', 'medium', 'high'] as const).map((r) => (
                    <button
                      key={r}
                      className={`risk-btn${risk === r ? ' active' : ''}`}
                      onClick={() => setRisk(r)}
                      disabled={isLoading}
                    >
                      {r === 'low' ? 'Safe' : r === 'medium' ? 'Balanced' : 'Bold'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              className="btn-primary"
              disabled={isLoading || amountTooSmall || !address}
              onClick={handleSubmit}
            >
              {!address
                ? 'Connect wallet to continue'
                : isLoading
                ? <>Finding strategies <span className="loading-dots" style={{ display: 'inline-flex', gap: 3, marginLeft: 6 }}><span/><span/><span/></span></>
                : 'Find strategies →'}
            </button>

            {!address && (
              <p style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', marginTop: 10 }}>
                Connect your wallet above to get started
              </p>
            )}
          </>
        ) : (
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: 16,
            background: 'var(--surface-soft)',
          }}>
            <div className="section-label" style={{ margin: 0 }}>Intent summary</div>
            <div style={{ display: 'grid', gap: 8, marginTop: 10, fontSize: 14 }}>
              <div><strong>Goal:</strong> {goal}</div>
              <div><strong>Amount:</strong> {amount} {ACTIVE_MARKET.inputTokenSymbol}</div>
              <div><strong>Risk:</strong> {RISK_LABEL[risk]}</div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-faint)' }}>
              You are authorizing an exact execution plan for this intent. The strategy cards below disappear once you choose one.
            </div>
            {selectedPlan && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-faint)' }}>
                After signing, the app will track the swap and position steps as the AI recommended them.
              </div>
            )}
            {step !== 'done' && (
              <button className="btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={resetIntent}>
                ← Change my request
              </button>
            )}
          </div>
        )}

        {error && <div className="error-box">{error}</div>}
      </div>

      {/* ── screen 2: strategy cards (loads below input) ── */}
      {isLoading && (
        <div className="loading-box">
          <div className="loading-dots"><span /><span /><span /></div>
          <div className="loading-label">Finding the best strategies for you</div>
          <div className="loading-sub">Analysing live market conditions…</div>
        </div>
      )}

      {showStrategies && planRes && (
        <>
          <p className="section-label">
            {planRes.plans.length} strategies found
          </p>
          <div className="strategies-grid">
            {planRes.plans.map((plan) => {
              const meta = STRATEGY_META[plan.strategy ?? plan.riskScore] ?? { name: plan.label, desc: '' };
              const apy = (plan.estimatedNetApyBps / 100).toFixed(1);
              const isSelected = selectedId === plan.planId;
              const isRecommended = plan.planId === planRes.recommendedPlanId || meta.recommended;

              return (
                <div
                  key={plan.planId}
                  className={`strategy-card${isSelected ? ' selected' : ''}`}
                  onClick={() => handleSelect(plan.planId)}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span className="strategy-name">{meta.name}</span>
                      {isRecommended && (
                        <span className="strategy-badge recommended">★ Recommended</span>
                      )}
                    </div>
                    <div className="strategy-desc">{meta.desc}</div>
                    <div className="strategy-stats">
                      <div className="stat-item">
                        <div className="stat-num orange">{apy}%</div>
                        <div className="stat-lbl">Est. APY</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-num">${plan.estimatedGasUsd}</div>
                        <div className="stat-lbl">Gas fee</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-num">${plan.risk.maxLossUsd}</div>
                        <div className="stat-lbl">Max loss</div>
                      </div>
                    </div>
                    {plan.planHash && (
                      <div style={{
                        marginTop: 12,
                        padding: '8px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        background: 'var(--surface-soft)',
                        fontFamily: 'var(--mono)',
                        fontSize: 11,
                        color: 'var(--text-faint)',
                        wordBreak: 'break-all',
                      }}>
                        planHash: {plan.planHash}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <span className={`strategy-badge ${RISK_BADGE[plan.riskScore]}`}>
                      {RISK_LABEL[plan.riskScore]}
                    </span>
                    <button className="strategy-select-btn">
                      {isSelected ? '✓ Selected' : 'Select'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {step === 'strategies' && (
            <button className="btn-ghost" style={{ width: '100%' }} onClick={resetIntent}>
              ← Change my request
            </button>
          )}
        </>
      )}

      {/* ── screen 3: approval / execution ── */}
      {showApproval && selectedPlan && (
        <div className="exec-box" style={{ marginTop: 16 }}>
            <div className="exec-title">
            {step === 'done' ? 'Position opened ✓' : step === 'approval' ? 'Review and authorize exact plan' : 'Opening your position…'}
          </div>
          <div className="exec-subtitle">
          {step === 'done'
              ? 'Your funds are now earning yield.'
              : step === 'approval'
                ? 'Review the exact strategy, then sign to authorize execution and tracking.'
                : 'Confirm the execution signature and onchain steps in your wallet.'}
          </div>

          <div style={{
            marginBottom: 12,
            padding: '12px 14px',
            border: '1px solid var(--border)',
            borderRadius: 16,
            background: 'var(--surface-soft)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div className="strategy-name" style={{ marginBottom: 3 }}>{STRATEGY_META[selectedPlan.strategy]?.name ?? selectedPlan.label}</div>
                <div className="strategy-desc">{STRATEGY_META[selectedPlan.strategy]?.desc ?? ''}</div>
              </div>
              <span className={`strategy-badge ${RISK_BADGE[selectedPlan.riskScore]}`}>
                {RISK_LABEL[selectedPlan.riskScore]}
              </span>
            </div>
            <div style={{ display: 'grid', gap: 6, fontSize: 14, marginBottom: 10 }}>
              <div><strong>Intent amount:</strong> {amount} {ACTIVE_MARKET.inputTokenSymbol}</div>
              <div><strong>Risk:</strong> {RISK_LABEL[risk]}</div>
              <div><strong>Plan:</strong> {selectedPlan.label}</div>
              <div><strong>Target pool:</strong> {marketPoolLabel()}</div>
            </div>
            <div style={{
              padding: '8px 10px',
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: 'var(--surface)',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--text-faint)',
              wordBreak: 'break-all',
            }}>
              planHash: {selectedPlan.planHash}
            </div>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {selectedPlan.steps.map((stepItem, index) => (
                <div key={stepItem.stepId} style={{
                  padding: '8px 10px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: index === 0 ? 'rgba(249, 115, 22, 0.06)' : 'var(--surface)',
                  fontSize: 13,
                }}>
                  <strong>{index + 1}.</strong> {stepItem.type === 'swap' ? 'Swap' : 'Add liquidity'}{' '}
                  {stepItem.type === 'swap'
                    ? `${fmt(stepItem.amountIn ?? '0', 6)} ${ACTIVE_MARKET.inputTokenSymbol} → ${fmt(stepItem.estimatedAmountOut ?? '0', 18)} ${ACTIVE_MARKET.outputTokenSymbol}`
                    : `${fmt(stepItem.token0AmountIn ?? '0', 6)} ${ACTIVE_MARKET.inputTokenSymbol} + ${fmt(stepItem.token1AmountIn ?? '0', 18)} ${ACTIVE_MARKET.outputTokenSymbol}`}
                </div>
              ))}
            </div>
          </div>

          {step === 'approval' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <button className="btn-primary" onClick={handleAuthorizeSelectedPlan}>
                Authorize exact plan
              </button>
              <button className="btn-ghost" onClick={() => setStep('strategies')}>
                Back to strategies
              </button>
            </div>
          )}

          {selectedId && step !== 'approval' && (
            <div style={{
              marginBottom: 12,
              padding: '8px 10px',
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: 'var(--surface-soft)',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--text-faint)',
              wordBreak: 'break-all',
              }}>
              selected plan: {selectedId}
              {selectedPlan?.planHash ? (
                <>
                  <br />
                  planHash: {selectedPlan.planHash}
                </>
              ) : null}
            </div>
          )}

          {execution ? (
            <div className="exec-steps">
              {execution.steps.map((s, i) => (
                <div className="exec-step" key={i}>
                  <div className={`exec-icon ${s.status}`}>
                    {s.status === 'submitted'
                      ? <span className="spinning">◌</span>
                      : stepIcon(s.status)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className={`exec-step-label${s.status === 'pending' ? ' pending' : ''}`}>
                      {stepLabel(s.type)}
                    </div>
                    {s.txHash && (
                      <div className="exec-step-hash">{s.txHash.slice(0, 10)}…{s.txHash.slice(-6)}</div>
                    )}
                  </div>
                  <div className="exec-step-status">
                    {s.status === 'confirmed' ? 'Done' : s.status === 'submitted' ? 'Confirming…' : s.status === 'failed' ? 'Failed' : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '12px 0', color: 'var(--text-faint)', fontSize: 13 }}>
              {step === 'approval' ? 'Waiting for authorization…' : 'Waiting for confirmation…'}
            </div>
          )}
        </div>
      )}

      {/* ── position card ── */}
      {step === 'done' && execution?.position && (
        <div className="position-box">
          <div className="position-header">
            <span className="position-title">Your position</span>
            <span className={`in-range-badge${monitor && !monitor.inRange ? ' out' : ''}`}>
              {monitor ? (monitor.inRange ? 'In range' : 'Needs rebalance') : 'Earning'}
            </span>
          </div>
          <div className="position-stats">
            <div className="position-stat">
              <div className="position-stat-val">{fmt(execution.position.token0Amount, 6)} {ACTIVE_MARKET.inputTokenSymbol}</div>
              <div className="position-stat-lbl">Deposited</div>
            </div>
            <div className="position-stat">
              <div className="position-stat-val">{fmt(execution.position.token1Amount, 18)} {ACTIVE_MARKET.outputTokenSymbol}</div>
              <div className="position-stat-lbl">Converted</div>
            </div>
          </div>
          {formatPositionRange(execution.position) && (
            <div style={{
              marginBottom: 12,
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: 'var(--surface-soft)',
              fontSize: 12,
              color: 'var(--text-faint)',
            }}>
              target range: {formatPositionRange(execution.position)}
            </div>
          )}
          {monitor && (
            <div style={{
              marginBottom: 12,
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: 'var(--surface-soft)',
              fontSize: 12,
              color: 'var(--text-faint)',
            }}>
              monitor: {monitor.inRange ? 'healthy' : 'rebalance suggested'} · drift {monitor.driftPercent}%
              {monitorSource ? ` · source ${monitorSource === 'live_tick' ? 'live tick' : monitorSource === 'stored_tick' ? 'stored tick' : monitorSource === 'stored_fallback' ? 'stored fallback' : 'unknown'}` : ''}
            </div>
          )}
          {monitor && !monitor.inRange && (
            <button
              className="btn-primary"
              style={{ width: '100%', marginBottom: 8 }}
              onClick={handleRebalance}
            >
              Rebalance now
            </button>
          )}
          <button
            className="btn-ghost"
            style={{ width: '100%' }}
            onClick={resetIntent}
          >
            + New position
          </button>
        </div>
      )}

    </div>
  );
}
