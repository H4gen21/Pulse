import type { Page, Route } from '@playwright/test';
import { decodeFunctionData, encodeFunctionResult, multicall3Abi, type Hex } from 'viem';
import { inheritanceGuardAbi } from '../lib/abi/inheritanceGuard';

export const OWNER = '0x20abcdef0123456789abcdef0123456789a1c876';
export const HEIR = '0x1111111111111111111111111111111111111111';
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const CHAIN_ID_HEX = '0x14a34'; // 84532, Base Sepolia

// Any RPC the browser might use for chain reads (default public endpoint, or NEXT_PUBLIC_RPC_URL).
export const RPC_URL_RE = /sepolia\.base\.org|base-sepolia|alchemy\.com|publicnode\.com|drpc\.org|tenderly\.co/;

const erc20 = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;
const readAbi = [...inheritanceGuardAbi, ...erc20, ...multicall3Abi.filter((x) => x.type === 'function' && x.name === 'getEthBalance')];

/** Encoded result for one guard/USDC view call: an active vault, one heir, 100 USDC, 50 approved. */
function answerCall(data: Hex): Hex {
  const { functionName } = decodeFunctionData({ abi: readAbi, data });
  const now = BigInt(Math.floor(Date.now() / 1000));
  const values: Record<string, unknown> = {
    guards: [USDC, 60n * 86_400n, now - 86_400n, true],
    getBeneficiaries: [{ wallet: HEIR, bps: 10_000 }],
    minTimeout: 60n * 86_400n,
    maxTimeout: 730n * 86_400n,
    balanceOf: 100_000_000n,
    allowance: 50_000_000n,
    decimals: 6,
    getEthBalance: 10n ** 16n, // RainbowKit's account balance
  };
  if (!(functionName in values)) throw new Error(`unmocked call ${functionName}`);
  return encodeFunctionResult({ abi: readAbi, functionName, result: values[functionName] } as never);
}

/** 4-byte selectors the mock couldn't answer (reverted). */
export const unknownCalls = new Set<string>();

type RpcReq = { id: number; method: string; params?: unknown[] };

function answer(req: RpcReq): unknown {
  switch (req.method) {
    case 'eth_chainId':
      return CHAIN_ID_HEX;
    case 'eth_blockNumber':
      return '0x1000';
    case 'eth_getLogs':
      return [];
    case 'eth_call': {
      const { data } = (req.params?.[0] ?? {}) as { data: Hex };
      try {
        const { functionName, args } = decodeFunctionData({ abi: multicall3Abi, data });
        if (functionName === 'aggregate3') {
          const calls = args[0] as readonly { callData: Hex }[];
          return encodeFunctionResult({
            abi: multicall3Abi,
            functionName: 'aggregate3',
            result: calls.map((c) => {
              try {
                return { success: true, returnData: answerCall(c.callData) };
              } catch {
                unknownCalls.add(c.callData.slice(0, 10));
                return { success: false, returnData: '0x' as Hex };
              }
            }),
          });
        }
      } catch {
        /* not a multicall */
      }
      return answerCall(data);
    }
    default:
      return null;
  }
}

/** Fakes the chain RPC and records every request the browser sends to it. */
export async function mockRpc(page: Page) {
  const log: { url: string; methods: string[]; batch: boolean }[] = [];
  await page.route(RPC_URL_RE, async (route: Route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fulfill({ status: 404, body: '' });
    const body = req.postDataJSON() as RpcReq | RpcReq[];
    const list = Array.isArray(body) ? body : [body];
    log.push({ url: req.url(), methods: list.map((r) => r.method), batch: Array.isArray(body) });
    const out = list.map((r) => ({ jsonrpc: '2.0', id: r.id, result: answer(r) }));
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(Array.isArray(body) ? out : out[0]) });
  });
  return log;
}

/**
 * A connected, signed-in wallet without a real extension: an EIP-6963 provider wagmi reconnects
 * to on load, plus a NextAuth session for the same address.
 */
export async function mockSignedIn(page: Page, owner = OWNER) {
  await page.addInitScript(
    ({ owner, chainId }) => {
      const provider = {
        async request({ method }: { method: string }) {
          if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [owner];
          if (method === 'eth_chainId') return chainId;
          if (method === 'net_version') return String(parseInt(chainId, 16));
          if (method === 'wallet_getPermissions' || method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts' }];
          throw Object.assign(new Error(`e2e wallet: ${method} unsupported`), { code: 4200 });
        },
        on() {},
        removeListener() {},
      };
      const detail = Object.freeze({
        info: { uuid: '6d1f9a5e-0000-4000-8000-00000000e2e0', name: 'E2E Wallet', icon: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E', rdns: 'test.pulse.e2e' },
        provider,
      });
      const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
      window.addEventListener('eip6963:requestProvider', announce);
      announce();
      try {
        localStorage.setItem('wagmi.recentConnectorId', JSON.stringify('test.pulse.e2e'));
      } catch {}
    },
    { owner, chainId: CHAIN_ID_HEX },
  );
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { address: owner, user: {}, expires: new Date(Date.now() + 86_400_000).toISOString() } }),
  );
  await page.route(/\/api\/vault\?address=/, (route) =>
    route.fulfill({ json: { status: 'ACTIVE', txHash: null, beneficiaries: [{ position: 0, walletAddress: HEIR, bpsShare: 10_000, email: null }] } }),
  );
}

/** Holds GET /api/vault/events until released, so tests can look at the page while the feed is pending. */
export async function holdEvents(page: Page) {
  const pending: Route[] = [];
  let waiters: (() => void)[] = [];
  await page.route(/\/api\/vault\/events\?/, (route) => {
    pending.push(route);
    waiters.forEach((w) => w());
    waiters = [];
  });
  return {
    /** Resolves once the page has asked for the feed. */
    requested: () => (pending.length ? Promise.resolve() : new Promise<void>((r) => waiters.push(r))),
    async respond(status: number, body: unknown) {
      const routes = pending.splice(0);
      await Promise.all(routes.map((r) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })));
      return routes.length;
    },
  };
}
