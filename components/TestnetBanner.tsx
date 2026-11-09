export const TESTNET_NOTICE = 'Testnet demo on Base Sepolia. Not audited. Do not use real funds.';

/** First row of the sticky header, so it stays visible on every page while scrolling. */
export function TestnetBanner() {
  return (
    <div className="testnet-banner" role="note">
      {TESTNET_NOTICE}
    </div>
  );
}
