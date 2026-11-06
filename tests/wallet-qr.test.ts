import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// RainbowKit draws the WalletConnect QR with `cuer`, which pulls `qr@~0`. cuer@0.0.3 calls
// encodeQR with border: 0, which qr >= 0.6 rejects, so the connect modal crashed the whole app
// ("Application error: a client-side exception has occurred"). This resolves cuer exactly the
// way RainbowKit does and encodes a WalletConnect-shaped URI with it.
async function loadRainbowKitQr() {
  const fromRainbowKit = createRequire(require.resolve('@rainbow-me/rainbowkit'));
  const qrCodePath = fromRainbowKit.resolve('cuer/QrCode');
  return (await import(pathToFileURL(qrCodePath).href)) as {
    create: (value: string, options?: { errorCorrection?: string }) => { edgeLength: number; grid: boolean[][] };
  };
}

const wcUri =
  'wc:' + 'a'.repeat(64) + '@2?relay-protocol=irn&symKey=' + 'b'.repeat(64) + '&expiryTimestamp=1793962238';

describe('wallet connect QR code', () => {
  it.each(['low', 'medium', 'quartile', 'high'])('encodes a WalletConnect URI at ecc=%s', async (ecc) => {
    const { create } = await loadRainbowKitQr();
    const qr = create(wcUri, { errorCorrection: ecc });
    expect(qr.grid).toHaveLength(qr.edgeLength);
    // No quiet-zone border left over: the grid starts with the 7-module finder pattern.
    expect(qr.grid[0].slice(0, 7).every(Boolean)).toBe(true);
  });
});
