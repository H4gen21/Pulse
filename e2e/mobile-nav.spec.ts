import { expect, test, type Page } from '@playwright/test';
import { holdEvents, mockRpc, mockSignedIn } from './mocks';

// Runs in the Pixel 7 and iPhone SE projects (playwright.config.ts): real touch taps on every
// nav link. locator.tap() fails if anything (overlay, veil, hidden button) intercepts the tap.

const LINKS = [
  { name: /^Home/, path: '/', from: '/verify' },
  { name: /^Dashboard/, path: '/vault', from: '/' },
  { name: /^Create vault/, path: '/vault/create', from: '/vault' },
  { name: /^Verify/, path: '/verify', from: '/vault/create' },
];

async function tapEveryLink(page: Page) {
  for (const { name, path, from } of LINKS) {
    await page.goto(from);
    const link = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });
    await link.tap();
    await expect(page, `tap ${name} from ${from}`).toHaveURL(new RegExp(`${path === '/' ? '/' : path}$`));
    await expect(link).toHaveAttribute('aria-current', 'page');
  }
}

test('signed out: tapping each nav link navigates', async ({ page }) => {
  await tapEveryLink(page);
});

test('signed in (mocked wallet + session): tapping each nav link navigates, even with the activity feed pending', async ({ page }) => {
  await mockRpc(page);
  await mockSignedIn(page);
  await holdEvents(page); // feed never answers

  await page.goto('/vault');
  await expect(page.getByRole('heading', { name: 'Your vault' })).toBeVisible();
  await tapEveryLink(page);
});
