'use client';

import Link from 'next/link';
import { Shield } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export function Navbar() {
  const pathname = usePathname();
  const links = [
    { href: '/vault', label: 'Dashboard' },
    { href: '/vault/create', label: 'Setup' },
    { href: '/verify', label: 'Verify' },
  ];

  return (
    <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Shield className="text-emerald-400 w-6 h-6" />
          <span className="text-xl font-bold tracking-tight text-white">
            Pulse<span className="text-emerald-400">.</span>
          </span>
        </Link>
        <div className="hidden md:flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                pathname === link.href
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <ConnectButton chainStatus="icon" showBalance={false} />
      </div>
    </nav>
  );
}
