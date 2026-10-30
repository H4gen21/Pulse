import { describe, expect, it } from 'vitest';
import { postVaultSchema, validateHeirs } from '@/lib/validation';

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const C = '0x3333333333333333333333333333333333333333';
const OWNER = '0x9999999999999999999999999999999999999999';

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
      chainId: 84532,
      txHash: `0x${'a'.repeat(64)}`,
      beneficiaries: [{ walletAddress: A.toUpperCase().replace('0X', '0x'), email: 'Heir@Example.com' }],
    });
    expect(parsed.beneficiaries[0]).toEqual({ walletAddress: A, email: 'heir@example.com' });
  });

  it('requires the chain id', () => {
    expect(postVaultSchema.safeParse({ txHash: `0x${'a'.repeat(64)}`, beneficiaries: [{ walletAddress: A }] }).success).toBe(false);
  });

  it('rejects a malformed tx hash', () => {
    expect(postVaultSchema.safeParse({ chainId: 84532, txHash: '0x12', beneficiaries: [{ walletAddress: A }] }).success).toBe(false);
  });
});
