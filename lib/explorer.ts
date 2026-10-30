import { chain } from './chain';

const base = chain.blockExplorers?.default.url ?? 'https://sepolia.basescan.org';

export const txUrl = (hash: string) => `${base}/tx/${hash}`;
export const addressUrl = (address: string) => `${base}/address/${address}`;
export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
