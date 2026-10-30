'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { Icon, Logo } from './icons';
import { useTheme } from './ThemeProvider';
import { WalletButton } from './WalletButton';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/vault', label: 'Dashboard', locked: true },
  { href: '/vault/create', label: 'Create vault', locked: true },
  { href: '/verify', label: 'Verify' },
];

export function Navbar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { state, signedIn } = useAuthGuard();
  // Owner pages stay clickable; the lock just says they open as a preview until you sign in.
  const showLock = state !== 'loading' && !signedIn;

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
              {l.locked && showLock && (
                <span className="lock">
                  <Icon name="lock" size={14} />
                  <span className="sr-only"> (sign-in required)</span>
                </span>
              )}
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
