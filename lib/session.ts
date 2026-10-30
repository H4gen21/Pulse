import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from './auth';

/** Returns the SIWE-authenticated wallet, or a 401 response to return from the route. */
export async function requireWallet(): Promise<{ address: `0x${string}` } | { error: NextResponse }> {
  const session = await getServerSession(authOptions);
  if (!session?.address) {
    return { error: NextResponse.json({ error: 'Unauthorized: sign in with your wallet' }, { status: 401 }) };
  }
  return { address: session.address };
}

export async function getWallet(): Promise<`0x${string}` | undefined> {
  return (await getServerSession(authOptions))?.address;
}
