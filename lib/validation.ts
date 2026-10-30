import { z } from 'zod';
import { isAddress } from 'viem';

// Mirrors InheritanceGuard.sol constants. Keep both in sync.
export const DAY = 86_400;
export const MIN_TIMEOUT_SEC = 60 * DAY; // BR-01
export const MAX_TIMEOUT_SEC = 730 * DAY; // BR-01
export const DEFAULT_TIMEOUT_DAYS = 180;
export const TOTAL_BPS = 10_000; // BR-02
export const MIN_BPS_PER_HEIR = 100;
export const MAX_BENEFICIARIES = 10;

export const address = z
  .string()
  .refine((v) => isAddress(v, { strict: false }), 'Invalid address')
  .transform((v) => v.toLowerCase() as `0x${string}`);

export const txHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid tx hash');

/** BR-03 preview: integer split with the remainder on the last heir (same math as the contract). */
export function splitAmount(amount: bigint, bps: number[]): bigint[] {
  let distributed = 0n;
  return bps.map((b, i) => {
    if (i === bps.length - 1) return amount - distributed;
    const share = (amount * BigInt(b)) / BigInt(TOTAL_BPS);
    distributed += share;
    return share;
  });
}

export const postVaultSchema = z.object({
  txHash,
  beneficiaries: z
    .array(
      z.object({
        walletAddress: address,
        email: z.string().trim().toLowerCase().email().max(254).optional(),
      }),
    )
    .min(1)
    .max(MAX_BENEFICIARIES),
});

export type PostVaultBody = z.infer<typeof postVaultSchema>;

/** Same checks the contract enforces in setupGuard; used by the setup form. */
export function validateHeirs(owner: string | undefined, heirs: { wallet: string; bps: number }[]): string | null {
  if (heirs.length === 0 || heirs.length > MAX_BENEFICIARIES) return `Add 1 to ${MAX_BENEFICIARIES} heirs.`;
  const seen = new Set<string>();
  for (const [i, h] of heirs.entries()) {
    if (!isAddress(h.wallet, { strict: false })) return `Heir ${i + 1}: invalid address.`;
    const w = h.wallet.toLowerCase();
    if (owner && w === owner.toLowerCase()) return `Heir ${i + 1}: cannot be your own wallet.`;
    if (seen.has(w)) return `Heir ${i + 1}: duplicate address.`;
    seen.add(w);
    if (!Number.isInteger(h.bps) || h.bps < MIN_BPS_PER_HEIR) return `Heir ${i + 1}: minimum ${MIN_BPS_PER_HEIR} BPS.`;
  }
  const total = heirs.reduce((s, h) => s + h.bps, 0);
  if (total !== TOTAL_BPS) return `Shares must total exactly ${TOTAL_BPS} BPS (currently ${total}).`;
  return null;
}
