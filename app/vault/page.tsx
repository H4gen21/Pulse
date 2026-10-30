'use client';
import { Navbar } from '@/components/Navbar';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useGuard, useGuardWrites } from '@/hooks/useGuardContract';
import { useEffect, useState } from 'react';
import { Zap, Loader2, Users, Clock, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function VaultPage() {
  const { isConnected, address } = useAuthGuard();
  const { guard, beneficiaries, isLoading, refetch } = useGuard(address);
  const writes = useGuardWrites();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPending = busy || writes.isPending;

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await action(); refetch(); }
    catch (e) { setError(e instanceof Error ? e.message.split('\n')[0] : 'Transaction failed'); }
    finally { setBusy(false); }
  }
  const ping = () => run(writes.ping);
  // Revoking also resets the allowance so the contract can no longer pull funds.
  const revoke = () => {
    if (!confirm('Revoke your guard? Heirs will no longer inherit automatically.')) return;
    run(async () => { await writes.revoke(); await writes.approve(0n); });
  };
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!guard?.isActive) { setTimeLeft('00d 00h 00m 00s'); return; }
    const tick = () => {
      const expiry = guard.lastPingTimestamp + guard.timeoutDuration;
      const diff = expiry - Math.floor(Date.now() / 1000);
      if (diff <= 0) setTimeLeft('00d 00h 00m 00s');
      else {
        const d = Math.floor(diff/86400), h = Math.floor((diff%86400)/3600);
        const m = Math.floor((diff%3600)/60), s = diff%60;
        setTimeLeft(`${d}d ${h}h ${m}m ${s}s`);
      }
    };
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, [guard]);

  if (!isConnected) return null;
  if (isLoading) return <div className="min-h-screen bg-slate-950 flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-400 animate-spin" /></div>;

  if (!guard || !guard.isActive) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200">
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 py-20 text-center">
          <h1 className="text-3xl font-bold text-white mb-4">No Active Guard</h1>
          <p className="text-slate-400 mb-8">You haven&apos;t set up your inheritance guard yet.</p>
          <Link href="/vault/create" className="inline-block bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-8 py-4 rounded-xl font-bold">
            Create Your Guard
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Owner Dashboard</h1>
          <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> ACTIVE
          </span>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5"><Clock className="w-32 h-32 text-emerald-400" /></div>
            <h2 className="text-slate-400 text-sm mb-1">Time Remaining</h2>
            <div className="text-4xl md:text-5xl font-mono font-bold text-white mb-6">{timeLeft}</div>
            <div className="flex flex-wrap gap-4">
              <button onClick={() => ping()} disabled={isPending}
                className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-8 py-4 rounded-xl font-bold text-lg flex items-center gap-2 disabled:opacity-50">
                <Zap className="w-5 h-5" /> I&apos;M ALIVE
              </button>
              <button onClick={() => revoke()} disabled={isPending}
                className="bg-slate-800 hover:bg-red-500/10 hover:text-red-400 border border-slate-700 px-6 py-4 rounded-xl font-bold transition disabled:opacity-50">
                Revoke Guard
              </button>
            </div>
            {error && (
              <p className="mt-4 flex items-center gap-2 text-sm text-red-400">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
              </p>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-slate-400 text-sm mb-4">On-Chain Status</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Token</span><span className="text-white font-mono truncate max-w-[140px]">{guard.token}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Timeout</span><span className="text-white font-mono">{Math.floor(guard.timeoutDuration/86400)}d</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Last Ping</span><span className="text-white font-mono">{new Date(guard.lastPingTimestamp*1000).toLocaleDateString()}</span></div>
            </div>
            <div className="mt-6 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-xs text-emerald-400">
              Chainlink Automation monitors this guard. Execution is automatic.
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" /> Beneficiaries
          </h3>
          <table className="w-full text-left text-sm">
            <thead><tr className="text-slate-400 border-b border-slate-800">
              <th className="pb-3">Wallet</th><th className="pb-3 text-right">BPS</th><th className="pb-3 text-right">%</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-800/50">
              {beneficiaries.map((b, i) => (
                <tr key={i}>
                  <td className="py-3 font-mono text-slate-300">{b.wallet.slice(0,6)}...{b.wallet.slice(-4)}</td>
                  <td className="py-3 text-right font-mono text-emerald-400">{b.bps}</td>
                  <td className="py-3 text-right font-mono text-slate-300">{(b.bps/100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}