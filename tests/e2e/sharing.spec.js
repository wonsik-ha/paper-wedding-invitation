import { test, expect } from '@playwright/test';

const DEFAULT_MESSAGE = '2026년 11월 8일, 저희의 행복한 앞날을 함께해 주세요.';

async function sharingMock(page, mode = 'native', clipboardFails = false) {
  await page.addInitScript(({ mode, clipboardFails }) => {
    window.sharedInvitations = [];
    window.copiedInvitations = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: mode === 'none' ? undefined : async data => {
      window.sharedInvitations.push(data);
      if (mode === 'cancel') throw new DOMException('Cancelled', 'AbortError');
      if (mode === 'fail') throw new DOMException('Unavailable', 'NotAllowedError');
    }});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => {
      if (clipboardFails) throw new DOMException('Denied', 'NotAllowedError');
      window.copiedInvitations.push(text);
    }}});
  }, { mode, clipboardFails });
}

async function openSharing(page) {
  await page.locator('#share-open').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: '누구에게 전하실 건가요?' })).toBeVisible();
  await expect(page.locator('#recipient-name')).toBeFocused();
}

test('query name is plain text at the card lower right on both faces, hidden when absent, and survives replay', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#recipient')).toBeHidden();
  await expect(page.locator('.arrival h1')).toHaveText('청첩장이 도착했습니다!');
  const name = '민수 & 지연 💐';
  await page.goto('./?to=' + encodeURIComponent(name));
  await expect(page.locator('#recipient')).toHaveText(name + ' 님께');
  await expect(page.locator('.arrival h1')).toHaveText(name + ' 님께 청첩장이 도착했습니다!');
  await page.locator('#seal').click();
  await page.locator('#extract').click();
  await page.waitForFunction(() => document.getAnimations().every(a => a.effect?.getTiming().iterations === Infinity || a.playState !== 'running'));
  await expect(page.locator('#recipient')).toBeVisible();
  // An inactive face must contribute no pixels, including composited text overlays.
  const frontPixels = await page.locator('#card').screenshot({ animations: 'disabled' });
  await page.locator('.card-face.back').evaluate(el => { el.style.display = 'none'; });
  expect(await page.locator('#card').screenshot({ animations: 'disabled' })).toEqual(frontPixels);
  await page.locator('.card-face.back').evaluate(el => { el.style.display = ''; });

  const recipient = await page.locator('#recipient').boundingBox();
  const card = await page.locator('#card').boundingBox();
  expect(recipient.x + recipient.width).toBeGreaterThan(card.x + card.width * .9);
  expect(recipient.y).toBeGreaterThan(card.y + card.height * .9);
  expect(recipient.x + recipient.width).toBeLessThan(card.x + card.width);
  expect(recipient.y + recipient.height).toBeLessThan(card.y + card.height);
  await page.locator('#flip').click();
  await expect(page.locator('.back .card-recipient')).toHaveText(name + ' 님께');
  await page.waitForFunction(() => document.getAnimations().every(a => a.effect?.getTiming().iterations === Infinity || a.playState !== 'running'));
  const backPixels = await page.locator('#card').screenshot({ animations: 'disabled' });
  await page.locator('.card-face.front').evaluate(el => { el.style.display = 'none'; });
  expect(await page.locator('#card').screenshot({ animations: 'disabled' })).toEqual(backPixels);
  await page.locator('.card-face.front').evaluate(el => { el.style.display = ''; });
  await page.locator('#zoom-in').click();
  await expect(page.locator('#zoom-reset')).toHaveText('150%');
  await expect(page.locator('.back .card-recipient')).toHaveText(name + ' 님께');
  expect(await page.locator('.back .card-recipient').evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
  await page.locator('#replay').click();
  await expect(page.locator('#recipient')).toHaveText(name + ' 님께');
  const markup = '<img src=x onerror=alert(1)>';
  await page.goto('./?to=' + encodeURIComponent(markup));
  await expect(page.locator('#recipient')).toHaveText(markup + ' 님께');
  await expect(page.locator('#recipient img')).toHaveCount(0);
});

test('native share uses the query name, accepts a new recipient, and opens a matching named page', async ({ page }) => {
  await sharingMock(page);
  await page.goto('./?to=' + encodeURIComponent('처음 손님') + '&old=1#unused');
  await openSharing(page);
  await expect(page.locator('#recipient-name')).toHaveValue('처음 손님');
  await expect(page.locator('#share-preview')).toHaveText('처음 손님 님께, 원식과 경민의 청첩장을 전합니다.');
  const name = '민수 & 지연 💐';
  await page.locator('#recipient-name').fill('  ' + name + '  ');
  await expect(page.locator('#share-preview')).toHaveText(name + ' 님께, 원식과 경민의 청첩장을 전합니다.');
  await page.locator('#share-submit').click();
  await expect(page.locator('#share-status')).toHaveText('초대를 공유했어요.');
  const [payload] = await page.evaluate(() => window.sharedInvitations);
  expect(payload.title).toBe('원식 & 경민 · 종이 청첩장');
  const sharedUrl = await page.locator('#share-link').inputValue();
  expect(payload.text).toBe(name + ' 님께, 원식과 경민의 청첩장을 전합니다.\n- 청첩장: ' + sharedUrl);
  expect(payload.url).toBeUndefined();
  const url = new URL(sharedUrl);
  expect(url.pathname).toBe('/paper-wedding-invitation/');
  expect([...url.searchParams]).toEqual([['to', name]]);
  expect(url.hash).toBe('');
  await expect(page.locator('#recipient')).toHaveText('처음 손님 님께');
  await page.goto(sharedUrl);
  await expect(page.locator('#recipient')).toHaveText(name + ' 님께');
});

test('no query or an emptied name shares the original default message and clean URL', async ({ page }) => {
  await sharingMock(page);
  await page.goto('./?tracking=1#unused');
  await openSharing(page);
  await expect(page.locator('#recipient-name')).toHaveValue('경민');
  await expect(page.locator('#share-preview')).toHaveText('경민 님께, 원식과 경민의 청첩장을 전합니다.');
  await page.locator('#recipient-name').fill('');
  await expect(page.locator('#share-preview')).toHaveText(DEFAULT_MESSAGE);
  await page.locator('#share-submit').click();
  let payload = await page.evaluate(() => window.sharedInvitations.at(-1));
  expect(payload.text).toBe(DEFAULT_MESSAGE + '\n- 청첩장: ' + await page.locator('#share-link').inputValue());
  expect(new URL(await page.locator('#share-link').inputValue()).search).toBe('');
  await page.goto('./?to=' + encodeURIComponent('민수'));
  await openSharing(page);
  await page.locator('#recipient-name').fill('   ');
  await page.locator('#share-submit').click();
  payload = await page.evaluate(() => window.sharedInvitations.at(-1));
  expect(payload.text).toBe(DEFAULT_MESSAGE + '\n- 청첩장: ' + await page.locator('#share-link').inputValue());
  expect(new URL(await page.locator('#share-link').inputValue()).search).toBe('');
});

test('unsupported native share copies personalized text and URL; explicit copy copies only the URL', async ({ page }) => {
  await sharingMock(page, 'none');
  await page.goto('./');
  await openSharing(page);
  await page.locator('#recipient-name').fill('민수');
  await page.locator('#share-submit').click();
  await expect(page.locator('#share-status')).toContainText('초대 문구와 링크를 복사했어요.');
  const url = await page.locator('#share-link').inputValue();
  expect(new URL(url).searchParams.get('to')).toBe('민수');
  expect(await page.evaluate(() => window.copiedInvitations)).toEqual(['민수 님께, 원식과 경민의 청첩장을 전합니다.\n- 청첩장: ' + url]);
  await page.locator('#share-copy').click();
  expect(await page.evaluate(() => window.copiedInvitations.at(-1))).toBe(url);
});

test('native cancellation stays cancelled, while actual failure offers clipboard sharing', async ({ page }) => {
  await sharingMock(page, 'cancel');
  await page.goto('./?to=' + encodeURIComponent('민수'));
  await openSharing(page);
  await page.locator('#share-submit').click();
  await expect(page.locator('#share-status')).toContainText('공유를 취소했어요.');
  expect(await page.evaluate(() => window.copiedInvitations)).toEqual([]);
  await expect(page.locator('#share-submit')).toBeEnabled();
  await page.locator('#share-close').click();
  await expect(page.locator('#share-open')).toBeFocused();
  await page.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Unavailable', 'NotAllowedError'); } }); });
  await openSharing(page);
  await page.locator('#share-submit').click();
  await expect(page.locator('#share-status')).toContainText('공유 창을 열지 못해 초대 문구와 링크를 복사했어요.');
  expect(await page.evaluate(() => window.copiedInvitations.length)).toBe(1);
});

test('clipboard denial leaves a selectable exact URL and Escape restores the share button', async ({ page }) => {
  await sharingMock(page, 'none', true);
  await page.goto('./?to=' + encodeURIComponent('민수'));
  await openSharing(page);
  await page.locator('#share-submit').click();
  await expect(page.locator('#share-status')).toContainText('자동 복사가 되지 않았어요.');
  await expect(page.locator('#share-link')).toBeFocused();
  expect(new URL(await page.locator('#share-link').inputValue()).searchParams.get('to')).toBe('민수');
  expect(await page.locator('#share-link').evaluate(input => input.selectionEnd - input.selectionStart)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#share-open')).toBeFocused();
});

test('long recipient and sharing dialog fit a 320px screen without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('./?to=' + encodeURIComponent('가나다라마바사'.repeat(10)));
  expect(await page.locator('#recipient').textContent()).toHaveLength(43);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await openSharing(page);
  const dialog = await page.getByRole('dialog').boundingBox();
  expect(dialog.x).toBeGreaterThanOrEqual(0);
  expect(dialog.x + dialog.width).toBeLessThanOrEqual(320);
  expect(await page.getByRole('dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
});
