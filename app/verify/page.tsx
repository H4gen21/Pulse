'use client';

import { Navbar } from '@/components/Navbar';
import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

type VaultStatus = {
  status: 'UNCONFIGURED' | 'ACTIVE' | 'REVOKED' | 'EXECUTED';
  timeoutDuration: number | null;
  tokenAddress: string | null;
  expiresAt: string | null;
  beneficiaries: { walletAddress: string; bpsShare: number }[];
};


export default function VerifyPage() {
  const [address, setAddress] = useState('');
  const [result, setResult] = useState<VaultStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!address) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch(`/api/vault?address=${encodeURIComponent(address.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Lookup failed');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-3">Public Verifier</h1>
          <p className="text-slate-400">Check the status of any Pulse vault on-chain. </p>
        </div>

        {/* Input Pencarian */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 flex gap-2 mb-8">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter Owner Wallet Address (0x...)"
            className="flex-1 bg-transparent border-none outline-none px-4 py-3 text-white placeholder:text-slate-500 font-mono text-sm"
          />
          <button
            onClick={handleVerify}
            disabled={loading}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify'}
          </button>
        </div>

        {error && <p className="text-center text-red-400 text-sm mb-6">{error}</p>}

        {/* Hasil Pencarian */}
        {result && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div
                className={`w-3 h-3 rounded-full ${
                  result.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
              ></div>
              <h2 className="text-lg font-bold text-white">Vault is {result.status}</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <p className="text-slate-500 mb-1">Timeout Duration</p>
                <p className="text-white font-mono text-lg">
                  {result.timeoutDuration ? `${Math.round(result.timeoutDuration / 86400)} days` : '-'}
                </p>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <p className="text-slate-500 mb-1">Beneficiaries</p>
                <p className="text-emerald-400 font-mono text-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> {result.beneficiaries.length} heirs
                </p>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 col-span-2">
                <p className="text-slate-500 mb-1">Token</p>
                <p className="text-white font-mono text-lg truncate">{result.tokenAddress ?? '-'}</p>
              </div>
              {result.expiresAt && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 col-span-2">
                  <p className="text-slate-500 mb-1">Executes if no ping by</p>
                  <p className="text-white font-mono text-lg">{new Date(result.expiresAt).toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}