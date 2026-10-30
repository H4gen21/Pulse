'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, Logo } from './icons';
import { useTheme } from './ThemeProvider';
import { WalletButton } from './WalletButton';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/vault', label: 'Dashboard' },
  { href: '/vault/create', label: 'Create vault' },
  { href: '/verify', label: 'Verify' },
];

export function Navbar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <header className="top">
      <div className="wrap topbar">
        <Link className="brand" href="/" aria-label="Pulse home">
          <Logo />
          <b>pulse</b>
        </Link>
        <nav className="pillnav" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={pathname === l.href ? 'page' : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="who">
          <button
            className="round"
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
