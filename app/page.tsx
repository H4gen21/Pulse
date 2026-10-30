'use client';

import { Navbar } from '@/components/Navbar';
import { Shield, Zap, Users, Lock, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-6">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Built on Base • Powered by Chainlink
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight mb-6">
            Your Crypto,<br />
            <span className="text-emerald-400">Automatically Inherited.</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
            Zero-custody dead man&apos;s switch. Your funds stay in your wallet until you stop checking in.
            Then, they&apos;re distributed to your heirs automatically.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              href="/vault/create"
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-8 py-4 rounded-xl font-bold text-lg transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
            >
              Setup Your Guard <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/verify"
              className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all"
            >
              Verify a Vault
            </Link>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: Lock, title: 'Zero Custody', desc: 'Funds never leave your wallet. Protection via ERC-20 allowances.' },
            { icon: Zap, title: 'Fully Automated', desc: 'Chainlink Keepers execute the transfer. No manual claim needed.' },
            { icon: Users, title: 'Multi-Heir Split', desc: 'Distribute assets to multiple beneficiaries via BPS precision.' },
            { icon: Shield, title: 'Revocable Anytime', desc: 'Change your mind? Revoke the guard with one transaction.' },
          ].map((f, i) => (
            <div
              key={i}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-emerald-500/30 transition-colors"
            >
              <f.icon className="w-8 h-8 text-emerald-400 mb-4" />
              <h3 className="text-white font-bold mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}