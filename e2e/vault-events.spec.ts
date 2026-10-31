import { expect, test } from '@playwright/test';
import { holdEvents, mockRpc, mockSignedIn, RPC_URL_RE, unknownCalls } from './mocks';

// Regression for the production /vault request flood: the browser used to call eth_getLogs on
// sepolia.base.org (which caps ranges at 200 blocks and answers HTTP 413), retrying ~125 times.

test('signed in: /vault renders before the activity feed resolves and never calls eth_getLogs', async ({ page }) => {
  const rpc = await mockRpc(page);
  await mockSignedIn(page);
  const feed = await holdEvents(page);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/vault');
  await feed.requested();

  // The dashboard is on screen while the feed request is still open.
  await expect(page.getByRole('heading', { name: 'Your vault' })).toBeVisible();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByText(/^50(\.00)? USDC$/).first()).toBeVisible(); // allowance, read client-side
  expect([...unknownCalls], 'every contract read was answered').toEqual([]);
  await expect(page.getByText('Loading on-chain activity…')).toBeVisible();

  // A failing feed shows its own error and leaves the page usable.
  await feed.respond(503, { error: 'Activity is temporarily unavailable' });
  await feed.requested(); // the hook retries once
  await feed.respond(503, { error: 'Activity is temporarily unavailable' });
  await expect(page.getByText('Couldn’t load activity right now.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your vault' })).toBeVisible();

  // Retry recovers.
  await page.getByRole('button', { name: 'Try again' }).click();
  await feed.requested();
  await feed.respond(200, {
    latest: 'GuardSetup',
    events: [{ name: 'Pinged', args: { owner: '0x0', nextDeadline: '1n' }, txHash: `0x${'ab'.repeat(32)}`, blockNumber: '10n', logIndex: 0, timestamp: 1_700_000_000 }],
  });
  await expect(page.locator('.feed li').filter({ hasText: 'Checked in' })).toBeVisible();

  // Navigation still works.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Verify', exact: true }).click();
  await expect(page).toHaveURL(/\/verify$/);

  const methods = rpc.flatMap((r) => r.methods);
  expect(methods).not.toContain('eth_getLogs');
  expect(rpc.filter((r) => r.batch && r.methods.length > 1), 'no JSON-RPC batches').toEqual([]);
  expect(rpc.length, `RPC requests: ${methods.join(', ')}`).toBeLessThan(20);
  expect(errors.filter((e) => /413|Payload Too Large|eth_getLogs/i.test(e))).toEqual([]);
});

test('signed in: a feed that never answers does not block the page or navigation', async ({ page }) => {
  await mockRpc(page);
  await mockSignedIn(page);
  const feed = await holdEvents(page); // never released

  await page.goto('/vault');
  await feed.requested();
  await expect(page.getByRole('heading', { name: 'Your vault' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Create vault/ }).click();
  await expect(page).toHaveURL(/\/vault\/create$/);
});

test('signed out: /vault sends nothing to the chain RPC', async ({ page }) => {
  const rpcHits: string[] = [];
  page.on('request', (r) => RPC_URL_RE.test(r.url()) && rpcHits.push(r.url()));
  await page.goto('/vault');
  await expect(page.locator('.gate-card')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(rpcHits).toEqual([]);
});
