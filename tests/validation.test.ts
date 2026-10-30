import { describe, expect, it } from 'vitest';
import { postVaultSchema, splitAmount, validateHeirs } from '@/lib/validation';

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const C = '0x3333333333333333333333333333333333333333';
const OWNER = '0x9999999999999999999999999999999999999999';

describe('splitAmount (BR-03)', () => {
  it('sweeps dust into the last beneficiary: 100 / 3 -> 33, 33, 34', () => {
    expect(splitAmount(100n, [3333, 3333, 3334])).toEqual([33n, 33n, 34n]);
  });

  it('always conserves the total', () => {
    for (const amount of [0n, 1n, 7n, 999_999n, 10n ** 24n]) {
      const parts = splitAmount(amount, [1234, 4321, 4445]);
      expect(parts.reduce((s, p) => s + p, 0n)).toBe(amount);
    }
  });
});

describe('validateHeirs (BR-02)', () => {
  it('accepts shares summing to exactly 10,000', () => {
    expect(validateHeirs(OWNER, [{ wallet: A, bps: 5000 }, { wallet: B, bps: 5000 }])).toBeNull();
  });

  it.each([
    [[{ wallet: A, bps: 5000 }, { wallet: B, bps: 4999 }], /exactly 10000/],
    [[{ wallet: A, bps: 5000 }, { wallet: A, bps: 5000 }], /duplicate/],
    [[{ wallet: OWNER, bps: 10000 }], /own wallet/],
    [[{ wallet: A, bps: 9950 }, { wallet: C, bps: 50 }], /minimum 100/],
    [[{ wallet: '0x123', bps: 10000 }], /invalid address/],
  ])('rejects %j', (heirs, msg) => {
    expect(validateHeirs(OWNER, heirs)).toMatch(msg);
  });
});

describe('postVaultSchema', () => {
  it('lowercases addresses and emails', () => {
    const parsed = postVaultSchema.parse({
      txHash: `0x${'a'.repeat(64)}`,
      beneficiaries: [{ walletAddress: A.toUpperCase().replace('0X', '0x'), email: 'Heir@Example.com' }],
    });
    expect(parsed.beneficiaries[0]).toEqual({ walletAddress: A, email: 'heir@example.com' });
  });

  it('rejects a malformed tx hash', () => {
    expect(postVaultSchema.safeParse({ txHash: '0x12', beneficiaries: [{ walletAddress: A }] }).success).toBe(false);
  });
});
