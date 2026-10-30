import { expect, test, type Page } from '@playwright/test';

// /vault and /vault/create render a locked preview for signed-out visitors (no redirect).
const PAGES = ['/', '/vault', '/vault/create', '/verify'];

const REQUIRED = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
];
const EXTRA_WIDTHS = [360, 390, 768, 1024, 1440];

async function expectNoHorizontalOverflow(page: Page) {
  // Let fonts and the reveal/hero effects settle before measuring.
  await page.evaluate(() => document.fonts.ready);
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `scrollWidth ${scrollWidth} > innerWidth ${innerWidth}`).toBeLessThanOrEqual(innerWidth);
}

for (const viewport of REQUIRED) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    for (const path of PAGES) {
      test(`${path} loads without horizontal overflow`, async ({ page }) => {
        const res = await page.goto(path);
        expect(res?.ok()).toBe(true);
        await expect(page.locator('header.top')).toBeVisible();
        await expectNoHorizontalOverflow(page);
      });
    }
  });
}

const LOCKED = [
  { path: '/vault', title: 'Connect your wallet to see your vault' },
  { path: '/vault/create', title: 'Connect your wallet to create a vault' },
];

for (const viewport of REQUIRED) {
  test.describe(`signed out, ${viewport.width}px`, () => {
    test.use({ viewport });
    for (const { path, title } of LOCKED) {
      test(`${path} shows the lock card without redirecting`, async ({ page }) => {
        const res = await page.goto(path);
        expect(res?.status()).toBe(200);
        const card = page.locator('.gate-card');
        await expect(card.getByRole('heading', { name: title })).toBeVisible();
        await expect(card.getByRole('button', { name: 'Connect wallet' })).toBeVisible();
        expect(new URL(page.url()).pathname).toBe(path);
        expect(new URL(page.url()).search).toBe('');

        const preview = page.locator('.gate-preview');
        await expect(preview).toHaveAttribute('aria-hidden', 'true');
        await expect(preview).toHaveAttribute('inert', '');
        expect(await preview.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
        await expectNoHorizontalOverflow(page);
      });
    }
  });
}

test('lock card is reachable by keyboard and nothing in the preview takes focus', async ({ page }) => {
  await page.goto('/vault');
  const button = page.locator('.gate-card').getByRole('button', { name: 'Connect wallet' });
  await expect(button).toBeVisible();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.gate-preview'))).toBe(false);
    if (await button.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(button).toBeFocused();
  expect(await button.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
});

test('nav links stay clickable and show a lock while signed out', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Dashboard (sign-in required)' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Create vault (sign-in required)' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Verify', exact: true })).toBeVisible();
  await nav.getByRole('link', { name: /Dashboard/ }).click();
  await expect(page).toHaveURL(/\/vault$/);
  await expect(page.locator('.gate-card')).toBeVisible();
});

test('legacy /dashboard and /setup still redirect to the vault pages', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/vault$/);
  await page.goto('/setup');
  await expect(page).toHaveURL(/\/vault\/create$/);
});

test('protected API writes return 401 without a session', async ({ request }) => {
  for (const method of ['post', 'put', 'patch', 'delete'] as const) {
    const res = await request[method]('/api/vault', { data: { chainId: 84532, txHash: `0x${'1'.repeat(64)}`, beneficiaries: [] } });
    expect(res.status(), method).toBe(401);
  }
  expect(await (await request.get('/api/auth/session')).json()).toEqual({});
});

test.describe('extra widths', () => {
  for (const width of EXTRA_WIDTHS) {
    test(`no overflow at ${width}px on every page`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of PAGES) {
        await page.goto(path);
        await expectNoHorizontalOverflow(page);
      }
    });
  }
});

test('nav pill scrolls instead of overflowing on a 360px phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  const box = await nav.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  expect(await nav.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto');
});

test('touch targets in the header are at least 44px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  for (const el of await page.locator('header.top a, header.top button').all()) {
    if (!(await el.isVisible())) continue;
    const b = await el.boundingBox();
    expect(Math.min(b!.width, b!.height), await el.innerText()).toBeGreaterThanOrEqual(44);
  }
});

test('verify rejects a malformed address and announces it', async ({ page }) => {
  await page.goto('/verify');
  await page.getByLabel('Owner wallet address').fill('0x123');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'isn’t a wallet address' })).toBeVisible();
});

test('split calculator gives the leftover to the last heir', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Amount (USDC)').fill('100');
  await page.getByLabel('Equal heirs').selectOption('3');
  const out = page.locator('section', { hasText: 'Try the split' }).locator('.feed li');
  await expect(out).toHaveCount(3);
  // 3333 / 3333 / 3334 bps of 100 USDC, same as the contract.
  await expect(out.nth(0)).toContainText('33.33');
  await expect(out.nth(2)).toContainText('gets the leftover');
  await expect(out.nth(2)).toContainText('33.34');
});

test('theme toggle persists only the theme', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Switch to (dark|light) theme/ }).click();
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  expect(['light', 'dark']).toContain(theme);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('pulse')));
  expect(keys).toEqual(['pulse-theme']);
});
