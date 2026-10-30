import { NextResponse } from 'next/server';
import { isAddressEqual, parseEventLogs } from 'viem';
import { prisma } from '@/lib/prisma';
import { chain, publicClient } from '@/lib/chain';
import { guardAbi, GUARD_ADDRESS } from '@/lib/contract';
import { address as addressSchema, postVaultSchema } from '@/lib/validation';
import { getWallet, requireWallet } from '@/lib/session';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

async function readChain(owner: `0x${string}`) {
  const [[token, timeoutDuration, lastPingTimestamp, isActive], bens] = await Promise.all([
    publicClient.readContract({ address: GUARD_ADDRESS, abi: guardAbi, functionName: 'guards', args: [owner] }),
    publicClient.readContract({ address: GUARD_ADDRESS, abi: guardAbi, functionName: 'getBeneficiaries', args: [owner] }),
  ]);
  return {
    token: token.toLowerCase(),
    timeoutDuration: Number(timeoutDuration),
    lastPingTimestamp: Number(lastPingTimestamp),
    isActive,
    beneficiaries: bens.map((b) => ({ walletAddress: b.wallet.toLowerCase(), bpsShare: b.bps })),
  };
}

/** GET /api/vault?address=0x… — public vault status; emails only for the signed-in owner. */
export async function GET(req: Request) {
  if (!(await rateLimit(`get:${clientIp(req)}`, 60))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const parsed = addressSchema.safeParse(new URL(req.url).searchParams.get('address'));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid or missing address' }, { status: 400 });
  const owner = parsed.data;

  try {
    const [onChain, vault, viewer] = await Promise.all([
      readChain(owner),
      prisma.vault.findFirst({
        where: { owner: { walletAddress: owner } },
        include: { beneficiaries: { orderBy: { position: 'asc' } } },
      }),
      getWallet(),
    ]);
    const isOwner = viewer === owner;
    const emails = new Map(vault?.beneficiaries.map((b) => [b.walletAddress, b.email]) ?? []);
    const status = onChain.isActive ? 'ACTIVE' : vault && vault.status !== 'ACTIVE' ? vault.status : 'UNCONFIGURED';
    const expiresAt = onChain.isActive ? onChain.lastPingTimestamp + onChain.timeoutDuration : null;

    return NextResponse.json({
      owner,
      chainId: chain.id,
      status,
      tokenAddress: onChain.isActive ? onChain.token : vault?.tokenAddress ?? null,
      timeoutDuration: onChain.isActive ? onChain.timeoutDuration : vault?.timeoutDuration ?? null,
      lastPingAt: onChain.isActive ? new Date(onChain.lastPingTimestamp * 1000).toISOString() : vault?.lastPingAt ?? null,
      expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
      txHash: vault?.txHash ?? null,
      beneficiaries: onChain.beneficiaries.map((b, position) => ({
        position,
        ...b,
        ...(isOwner ? { email: emails.get(b.walletAddress) ?? null } : {}),
      })),
    });
  } catch (e) {
    console.error('GET /api/vault', e);
    return NextResponse.json({ error: 'Failed to load vault' }, { status: 502 });
  }
}

/**
 * POST /api/vault — record a vault after the owner's setupGuard tx is mined.
 * Config is read from the chain; the client only supplies the tx hash and heir emails.
 */
export async function POST(req: Request) {
  const auth = await requireWallet();
  if ('error' in auth) return auth.error;
  const owner = auth.address;

  if (!(await rateLimit(`post:${owner}`, 10))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = postVaultSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid request body', issues: body.error.flatten() }, { status: 400 });
  }
  const { txHash, beneficiaries: input } = body.data;

  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
    const setup = parseEventLogs({ abi: guardAbi, eventName: 'GuardSetup', logs: receipt.logs }).find(
      (l) => isAddressEqual(l.address, GUARD_ADDRESS) && isAddressEqual(l.args.owner, owner),
    );
    if (receipt.status !== 'success' || !setup) {
      return NextResponse.json({ error: 'Transaction is not a successful setupGuard by this wallet' }, { status: 422 });
    }

    const onChain = await readChain(owner);
    if (!onChain.isActive) return NextResponse.json({ error: 'Guard is not active on-chain' }, { status: 409 });

    const chainWallets = onChain.beneficiaries.map((b) => b.walletAddress).sort();
    const inputWallets = input.map((b) => b.walletAddress).sort();
    if (chainWallets.join() !== inputWallets.join()) {
      return NextResponse.json({ error: 'Beneficiaries do not match on-chain configuration' }, { status: 422 });
    }
    const emails = new Map<string, string | null>(input.map((b) => [b.walletAddress, b.email ?? null]));

    const vault = await prisma.$transaction(async (tx) => {
      const { id: ownerId } = await tx.owner.upsert({
        where: { walletAddress: owner },
        update: {},
        create: { walletAddress: owner },
      });
      const data = {
        chainId: chain.id,
        timeoutDuration: onChain.timeoutDuration,
        tokenAddress: onChain.token,
        status: 'ACTIVE' as const,
        lastPingAt: new Date(onChain.lastPingTimestamp * 1000),
        txHash: txHash.toLowerCase(),
      };
      const v = await tx.vault.upsert({ where: { ownerId }, update: data, create: { ownerId, ...data } });

      await tx.beneficiary.deleteMany({ where: { vaultId: v.id } });
      await tx.beneficiary.createMany({
        data: onChain.beneficiaries.map((b, position) => ({
          vaultId: v.id,
          position,
          walletAddress: b.walletAddress,
          bpsShare: b.bpsShare,
          email: emails.get(b.walletAddress) ?? null,
        })),
      });

      // BR-06: queue exactly one GuardSetup notice per recipient for this tx; duplicates are ignored.
      const recipients = [...new Set([...emails.values()].filter((e): e is string => !!e))];
      await tx.notificationLog.createMany({
        data: recipients.map((recipientEmail) => ({
          vaultId: v.id,
          eventType: 'GUARD_SETUP' as const,
          eventTxHash: txHash.toLowerCase(),
          recipientEmail,
        })),
        skipDuplicates: true,
      });

      return tx.vault.findUniqueOrThrow({
        where: { id: v.id },
        include: { beneficiaries: { orderBy: { position: 'asc' } } },
      });
    });

    return NextResponse.json({ vault }, { status: 201 });
  } catch (e) {
    console.error('POST /api/vault', e);
    return NextResponse.json({ error: 'Failed to record vault' }, { status: 502 });
  }
}
