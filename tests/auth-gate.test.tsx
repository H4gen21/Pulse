import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const account = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const session = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('wagmi', () => ({
  useAccount: () => account.value,
  useSwitchChain: () => ({ switchChain: vi.fn(), isPending: false, error: null }),
}));
vi.mock('next-auth/react', () => ({ useSession: () => session.value }));
vi.mock('@rainbow-me/rainbowkit', () => ({ useConnectModal: () => ({ openConnectModal: vi.fn() }) }));

import { AuthGate } from '@/components/AuthGate';
import { CreatePreview, VaultPreview } from '@/components/vault/previews';
import { chain } from '@/lib/chain';

const WALLET = '0x20aBcDEf0123456789aBCdef0123456789A1c876';
const OTHER = '0x1111111111111111111111111111111111111111';

const render = () =>
  renderToStaticMarkup(<AuthGate preview={<p>SAMPLE PREVIEW</p>}>{(owner) => <p>REAL PAGE {owner}</p>}</AuthGate>);
const connected = (chainId: number = chain.id) => ({ address: WALLET, isConnected: true, isReconnecting: false, chainId });

beforeEach(() => {
  account.value = { address: undefined, isConnected: false, isReconnecting: false, chainId: undefined };
  session.value = { data: null, status: 'unauthenticated' };
});

describe('AuthGate', () => {
  it('shows a skeleton, not the lock card, while the session loads', () => {
    session.value = { data: null, status: 'loading' };
    const html = render();
    expect(html).toContain('Checking your wallet');
    expect(html).not.toContain('gate-card');
    expect(html).not.toContain('SAMPLE PREVIEW');
    expect(html).not.toContain('REAL PAGE');
  });

  it('treats a wallet that is still reconnecting as loading', () => {
    account.value = { ...connected(), isConnected: false, isReconnecting: true };
    expect(render()).toContain('Checking your wallet');
  });

  it('not connected: blurred inert preview and a connect card', () => {
    const html = render();
    expect(html).toContain('Connect your wallet to see your vault');
    expect(html).toContain('Connect wallet');
    expect(html).toMatch(/<div class="gate-preview" aria-hidden="true" inert="">\s*<p>SAMPLE PREVIEW<\/p>/);
    expect(html).not.toContain('REAL PAGE');
  });

  it('connected but not signed in: sign-in card', () => {
    account.value = connected();
    const html = render();
    expect(html).toContain('Sign in to prove this wallet is yours. It’s free and sends no transaction.');
    expect(html).toContain('>Sign in</button>');
    expect(html).toContain('SAMPLE PREVIEW');
    expect(html).not.toContain('REAL PAGE');
  });

  it('a session for a different wallet still needs a sign-in', () => {
    account.value = connected();
    session.value = { data: { address: OTHER }, status: 'authenticated' };
    expect(render()).toContain('Sign in to prove this wallet is yours');
  });

  it('wrong network: switch card', () => {
    account.value = connected(1);
    session.value = { data: { address: WALLET }, status: 'authenticated' };
    const html = render();
    expect(chain.name).toBe('Base Sepolia');
    expect(html).toContain('Switch to Base Sepolia');
    expect(html).not.toContain('REAL PAGE');
  });

  it('signed in: renders the real page, matching the address case-insensitively', () => {
    account.value = connected();
    session.value = { data: { address: WALLET.toLowerCase() }, status: 'authenticated' };
    const html = render();
    expect(html).toContain(`REAL PAGE ${WALLET}`);
    expect(html).not.toContain('SAMPLE PREVIEW');
    expect(html).not.toContain('gate-card');
  });
});

describe('locked previews', () => {
  it.each([
    ['vault', VaultPreview],
    ['create', CreatePreview],
  ])('%s preview has nothing focusable', (_, Preview) => {
    const html = renderToStaticMarkup(<Preview />);
    expect(html).not.toMatch(/<(a|button|input|select|textarea)\b|tabindex/i);
  });

  it('vault preview shows three sample heirs', () => {
    expect(renderToStaticMarkup(<VaultPreview />).match(/data-label="Wallet"/g)).toHaveLength(3);
  });
});
