'use client';
import { Navbar } from '@/components/Navbar';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useGuardWrites } from '@/hooks/useGuardContract';
import { USDC_ADDRESS } from '@/lib/contract';
import {
  DAY, DEFAULT_TIMEOUT_DAYS, MAX_BENEFICIARIES, MAX_TIMEOUT_SEC, MIN_BPS_PER_HEIR, MIN_TIMEOUT_SEC,
  TOTAL_BPS, splitAmount, validateHeirs,
} from '@/lib/validation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseUnits } from 'viem';
import { ChevronRight, AlertTriangle } from 'lucide-react';

type Heir = { wallet: string; bps: number; email: string };

export default function CreateVaultPage() {
  const { address, needsSignIn } = useAuthGuard();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [cap, setCap] = useState('1000');            // USDC, string
  const [days, setDays] = useState(DEFAULT_TIMEOUT_DAYS);
  const [heirs, setHeirs] = useState<Heir[]>([
    { wallet: '', bps: 5000, email: '' }, { wallet: '', bps: 5000, email: '' },
  ]);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setupGuard, approve } = useGuardWrites();

  // ---- Validation (mirrors InheritanceGuard.sol) ----
  const totalBps = heirs.reduce((s, h) => s + h.bps, 0);
  const capUnits = (() => { try { return parseUnits(cap || '0', 6); } catch { return null; } })(); // USDC 6 decimals
  const capOk = capUnits !== null && capUnits > 0n;
  const timeoutOk = days * DAY >= MIN_TIMEOUT_SEC && days * DAY <= MAX_TIMEOUT_SEC;
  const heirsError = validateHeirs(address, heirs);
  const emailsOk = heirs.every(h => !h.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h.email));
  const step3Valid = !heirsError && emailsOk;

  // BR-03 preview: what each heir receives if the full cap is pulled
  const preview = capOk ? splitAmount(capUnits!, heirs.map(h => h.bps)) : [];

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message.split('\n')[0] : 'Something went wrong'); }
    finally { setBusy(false); }
  }

  const handleApprove = () => run(async () => {
    await approve(capUnits!);
    setApproved(true);
  });

  const handleInitialize = () => run(async () => {
    const hash = await setupGuard(
      USDC_ADDRESS,
      BigInt(days * DAY),
      heirs.map(h => ({ wallet: h.wallet as `0x${string}`, bps: h.bps })),
    );
    setTxHash(hash);
    const res = await fetch('/api/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txHash: hash,
        beneficiaries: heirs.map(h => ({ walletAddress: h.wallet, email: h.email || undefined })),
      }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`Guard is active on-chain, but saving details failed: ${error}`);
    }
    router.push('/vault');
  });

  const updateHeir = (i: number, patch: Partial<Heir>) =>
    setHeirs(p => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-2">Setup Inheritance Guard</h1>
        <p className="text-slate-400 mb-8">Non-custodial. Funds never leave your wallet.</p>

        {needsSignIn && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-4 text-sm text-amber-400">
            <span>Sign the login message with your wallet to continue.</span>
            <ConnectButton />
          </div>
        )}

        {/* Stepper */}
        <div className="flex items-center justify-between mb-8">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex flex-col items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                step >= s ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}>{s}</div>
              <span className="text-xs text-slate-400">
                {['Cap','Timer','Heirs','Activate'][s-1]}
              </span>
            </div>
          ))}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 min-h-[300px]">
          {/* STEP 1: Token & Cap */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">Token & Spending Cap</h2>
              <div className="bg-slate-950 border border-slate-700 rounded-lg p-4 flex items-center justify-between">
                <div><p className="text-white font-bold">USDC</p>
                  <p className="text-xs text-slate-500 font-mono">{USDC_ADDRESS.slice(0,10)}...</p></div>
              </div>
              <label className="block text-sm text-slate-400">Max spending cap (USDC)</label>
              <input type="number" min={0} value={cap} onChange={e => setCap(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-mono" />
              {!capOk && <p className="text-red-400 text-xs">Enter an amount greater than 0.</p>}
              <p className="text-xs text-slate-500">
                Contract can never move more than this amount, even if your wallet balance is higher.
              </p>
            </div>
          )}

          {/* STEP 2: Timer */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">Inactivity Timer</h2>
              <p className="text-sm text-slate-400">Minimum 60 days. Maximum 730 days.</p>
              <input type="number" min={60} max={730} value={days}
                onChange={e => setDays(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-mono" />
              {!timeoutOk && <p className="text-red-400 text-xs">Must be between 60 and 730 days.</p>}
            </div>
          )}

          {/* STEP 3: Heirs */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">Beneficiaries</h2>
              <p className="text-sm text-slate-400">
                Shares must total exactly 10,000 BPS (100%). Min {MIN_BPS_PER_HEIR} BPS (1%) each.
                Rounding dust goes to the last heir.
              </p>
              {heirs.map((h, i) => (
                <div key={i} className="space-y-2 border border-slate-800 rounded-lg p-3">
                  <input type="text" placeholder="0x..." value={h.wallet}
                    onChange={e => updateHeir(i, { wallet: e.target.value.trim() })}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white font-mono" />
                  <input type="email" placeholder="Email for notifications (optional)" value={h.email}
                    onChange={e => updateHeir(i, { email: e.target.value.trim() })}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white" />
                  <div className="flex gap-2 items-center">
                    <input type="number" value={h.bps} min={MIN_BPS_PER_HEIR} max={TOTAL_BPS}
                      onChange={e => updateHeir(i, { bps: Number(e.target.value) })}
                      className="w-32 bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white font-mono" />
                    <span className="text-slate-400 text-sm">BPS ({(h.bps / 100).toFixed(2)}%)</span>
                    {heirs.length > 1 && (
                      <button onClick={() => setHeirs(p => p.filter((_,j)=>j!==i))}
                        className="ml-auto text-red-400 text-xs">Remove</button>
                    )}
                  </div>
                </div>
              ))}
              <button onClick={() => setHeirs(p => [...p, { wallet: '', bps: MIN_BPS_PER_HEIR, email: '' }])}
                disabled={heirs.length >= MAX_BENEFICIARIES}
                className="text-emerald-400 text-sm font-bold disabled:opacity-40">+ Add heir (max {MAX_BENEFICIARIES})</button>
              <div className="flex justify-between text-sm font-bold">
                <span className="text-slate-400">Total</span>
                <span className={totalBps === TOTAL_BPS ? 'text-emerald-400' : 'text-red-400'}>
                  {totalBps.toLocaleString()} / 10,000
                </span>
              </div>
              {heirsError && <p className="text-red-400 text-xs">{heirsError}</p>}
              {!emailsOk && <p className="text-red-400 text-xs">One of the emails is invalid.</p>}
            </div>
          )}

          {/* STEP 4: Approve + Initialize */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">Review & Activate</h2>
              <div className="text-sm space-y-2">
                <Row k="Token" v="USDC" />
                <Row k="Spending Cap" v={`${cap} USDC`} />
                <Row k="Timeout" v={`${days} days`} />
                {heirs.map((h, i) => (
                  <Row key={i} k={`${h.wallet.slice(0, 6)}...${h.wallet.slice(-4)}`}
                    v={`${(h.bps / 100).toFixed(2)}% · max ${preview[i] !== undefined ? (Number(preview[i]) / 1e6).toFixed(6) : '-'} USDC`} />
                ))}
                <Row k="Total BPS" v={String(totalBps)} highlight />
              </div>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex gap-2 text-xs text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <p>Two transactions: (1) Approve USDC allowance, (2) Initialize Guard. You can revoke anytime.</p>
              </div>
              <button onClick={handleApprove} disabled={busy || approved || needsSignIn || !capOk}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-xl font-bold disabled:opacity-50">
                {approved ? '✓ Approved' : `1. Approve ${cap} USDC`}
              </button>
              <button onClick={handleInitialize} disabled={busy || !approved || needsSignIn || !step3Valid}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-4 py-3 rounded-xl font-bold disabled:opacity-50">
                {busy ? 'Processing...' : '2. Initialize Guard'}
              </button>
              {txHash && <p className="text-xs text-emerald-400 font-mono">Tx: {txHash.slice(0,10)}...</p>}
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
          )}
        </div>

        <div className="flex justify-between mt-6">
          <button onClick={() => setStep(s => Math.max(1, s-1))} disabled={step === 1}
            className="px-6 py-3 rounded-xl font-bold text-slate-400 hover:text-white disabled:opacity-30">
            Back
          </button>
          {step < 4 && (
            <button onClick={() => setStep(s => s+1)}
              disabled={(step===1 && !capOk) || (step===2 && !timeoutOk) || (step===3 && !step3Valid)}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 px-8 py-3 rounded-xl font-bold flex items-center gap-2">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function Row({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between py-2 border-b border-slate-800">
      <span className="text-slate-400">{k}</span>
      <span className={highlight ? 'text-emerald-400 font-mono' : 'text-white font-mono'}>{v}</span>
    </div>
  );
}
