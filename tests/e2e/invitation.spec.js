import { test, expect } from '@playwright/test';

const DESTINATION = 'https://wonsik-ha.github.io/wedding-invitation/';

// ---------------------------------------------------------------- helpers

/** Wait until every finite CSS transition/animation has finished (guide loops are infinite). */
async function settle(page) {
  await page.waitForFunction(() => document.getAnimations().every(animation =>
    animation.effect?.getTiming().iterations === Infinity || animation.playState !== 'running'));
}

async function loadFresh(page) {
  await page.goto('./');
  await expect(page.locator('#scene')).toHaveAttribute('data-phase', 'closed');
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll('.card img, .envelope-photo img, .phone-body')].every(img => img.complete && img.naturalWidth > 0))).toBe(true);
  await settle(page);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const scene = document.querySelector('#scene');
    const card = document.querySelector('#card');
    const value = name => parseFloat(card.style.getPropertyValue(name)) || 0;
    return {
      phase: scene.dataset.phase,
      side: scene.dataset.side,
      scale: Number(scene.dataset.scale),
      camera: scene.dataset.camera === 'true',
      panX: value('--pan-x'),
      panY: value('--pan-y'),
      pull: value('--pull'),
    };
  });
}

/**
 * Viewport point at a fraction of an element's box, plus whether real hit testing lands on
 * that element (so a guest could actually press there).
 */
async function pointOn(page, selector, fx = 0.5, fy = 0.5) {
  return page.evaluate(([sel, fx, fy]) => {
    const element = document.querySelector(sel);
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width * fx;
    const y = rect.top + rect.height * fy;
    const hit = document.elementFromPoint(x, y);
    return { x, y, hit: !!hit && element.contains(hit), hitName: hit ? hit.className || hit.tagName : null, height: element.offsetHeight };
  }, [selector, fx, fy]);
}

async function mouseDrag(page, from, to, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

/** A point on the envelope-held card that is not covered by the pocket. */
async function cardGrabPoint(page) {
  await settle(page);
  const point = await pointOn(page, '#card', 0.5, 0.3);
  expect(point.hit, `card should be grabbable above the pocket, hit ${point.hitName}`).toBe(true);
  return point;
}

async function openSeal(page) {
  await page.locator('#seal').click();
  await expect(page.locator('#scene')).toHaveAttribute('data-phase', 'open');
  await settle(page);
}

async function toReading(page) {
  await openSeal(page);
  await page.locator('#extract').click();
  await expect(page.locator('#scene')).toHaveAttribute('data-phase', 'reading');
  await settle(page);
}

async function toBack(page) {
  await toReading(page);
  await page.locator('#flip').click();
  await expect(page.locator('#scene')).toHaveAttribute('data-side', 'back');
  await settle(page);
}

async function openCamera(page) {
  await page.locator('#camera-open').click();
  await expect(page.locator('#scene')).toHaveAttribute('data-camera', 'true');
  await expect(page.locator('.phone')).toBeVisible();
  await settle(page);
  // Keep the whole camera scene inside the viewport so pointer coordinates stay on screen.
  await page.evaluate(() => document.querySelector('#scene').scrollIntoView({ block: 'center' }));
  await settle(page);
}

async function aimGeometry(page) {
  return page.evaluate(() => {
    const centre = rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    const phone = document.querySelector('.phone').getBoundingClientRect();
    return {
      reticle: centre(document.querySelector('.reticle').getBoundingClientRect()),
      qr: centre(document.querySelector('#qr-target').getBoundingClientRect()),
      // Top bar of the phone, left of the close button: draggable, not a button.
      grab: { x: phone.left + 22, y: phone.top + 22 },
    };
  });
}

async function grabPhonePoint(page) {
  const geometry = await aimGeometry(page);
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return !!element?.closest('.phone') && !element.closest('button');
  }, geometry.grab);
  expect(hit, 'phone body should be grabbable').toBe(true);
  return geometry;
}

async function dragPhoneToQr(page) {
  const { reticle, qr, grab } = await grabPhonePoint(page);
  await mouseDrag(page, grab, { x: grab.x + qr.x - reticle.x, y: grab.y + qr.y - reticle.y }, 15);
  await expect(page.locator('.phone')).toHaveAttribute('data-aligned', 'true');
}

async function keyboardAimAtQr(page) {
  const phone = page.locator('.phone');
  await expect(phone).toBeFocused();
  for (let i = 0; i < 120; i++) {
    const { reticle, qr } = await aimGeometry(page);
    const dx = qr.x - reticle.x;
    const dy = qr.y - reticle.y;
    if (Math.abs(dx) <= 4 && Math.abs(dy) <= 4) break;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const delta = horizontal ? dx : dy;
    const key = horizontal ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
    await page.keyboard.press(Math.abs(delta) > 12 ? key : `Shift+${key}`);
  }
  await expect(phone).toHaveAttribute('data-aligned', 'true');
}

/** Stub the real site (never hit the network) and record top-level navigations to it. */
async function interceptDestination(page) {
  const requests = [];
  page.on('request', request => {
    if (request.isNavigationRequest() && request.url().startsWith('https://wonsik-ha.github.io/')) requests.push(request.url());
  });
  await page.route('https://wonsik-ha.github.io/**', route => route.fulfill({ status: 404, body: '' }));
  await page.route(DESTINATION, route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><link rel="icon" href="data:,"><title>mobile invitation stub</title>',
  }));
  return requests;
}

async function expectGuide(page, title, count, action) {
  await expect(page.locator('#guide-title')).toHaveText(title);
  await expect(page.locator('#page-count')).toHaveText(`${count} — 04`);
  if (action) await expect(page.locator('#guide-motion')).toHaveAttribute('data-action', action);
}

// ---------------------------------------------------------------- flow

test.describe('envelope', () => {
  test('fresh load is a closed envelope with an enabled seal and nothing else actionable', async ({ page }) => {
    await loadFresh(page);
    const scene = page.locator('#scene');
    await expect(scene).toHaveAttribute('data-side', 'front');
    await expect(scene).toHaveAttribute('data-scale', '1.00');
    await expect(page.locator('.arrival h1')).toHaveText('청첩장이 도착했습니다!');
    await expect(page.locator('#card')).toBeHidden();
    await expect(page.locator('#seal')).toBeVisible();
    await expect(page.locator('#seal')).toBeEnabled();
    await expect(page.locator('#seal')).toHaveAccessibleName('인장을 눌러 봉투 열기');
    await expect(page.locator('#card')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#card')).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('#extract')).toBeHidden();
    await expect(page.locator('#reading-tools')).toBeHidden();
    await expect(page.locator('#camera-layer')).toBeHidden();
    await expect(page.locator('#asset-error')).toBeHidden();
    await expectGuide(page, '인장을 눌러 열어 주세요', '01', 'seal');
    await expect(page.locator('.guide-copy')).toHaveAttribute('role', 'status');

    // Dragging over the closed envelope must not open or extract anything.
    const box = await page.locator('.envelope-pocket').boundingBox();
    await mouseDrag(page, { x: box.x + box.width / 2, y: box.y + box.height * 0.8 }, { x: box.x + box.width / 2, y: box.y - 100 });
    expect((await snapshot(page)).phase).toBe('closed');
  });

  test('pressing the seal opens the envelope but does not extract the card', async ({ page }) => {
    await loadFresh(page);
    await openSeal(page);
    await page.waitForTimeout(400);
    const state = await snapshot(page);
    expect(state.phase).toBe('open');
    expect(state.side).toBe('front');
    await expect(page.locator('#seal')).toBeDisabled();
    await expect(page.locator('#card')).toBeFocused();
    await expect(page.locator('#card')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.locator('#extract')).toBeVisible();
    await expect(page.locator('#reading-tools')).toBeHidden();
    await expect(page.locator('#chapter-label')).toHaveText('WITH LOVE, TO YOU');
    await expectGuide(page, '카드를 위로 꺼내 주세요', '02', 'pull');
  });

  test('short mouse pull springs back; pulling past threshold then back down also springs back', async ({ page }) => {
    await loadFresh(page);
    await openSeal(page);
    const before = await page.locator('#card').boundingBox();
    const grab = await cardGrabPoint(page);

    await mouseDrag(page, grab, { x: grab.x, y: grab.y - 8 });
    await settle(page);
    let state = await snapshot(page);
    expect(state.phase).toBe('open');
    expect(state.pull).toBe(0);
    const after = await page.locator('#card').boundingBox();
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);

    // Pull far, return low before releasing: the release position decides.
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x, grab.y - 40, { steps: 10 });
    expect((await snapshot(page)).pull).toBeGreaterThanOrEqual(39);
    await page.mouse.move(grab.x, grab.y - 6, { steps: 6 });
    await page.mouse.up();
    state = await snapshot(page);
    expect(state.phase).toBe('open');
    expect(state.pull).toBe(0);
  });

  test('a 40px mouse pull extracts the card, front side up, without flipping', async ({ page }) => {
    await loadFresh(page);
    await openSeal(page);
    const grab = await cardGrabPoint(page);
    await mouseDrag(page, grab, { x: grab.x, y: grab.y - 40 });
    await expect(page.locator('#scene')).toHaveAttribute('data-phase', 'reading');
    await settle(page);
    const state = await snapshot(page);
    expect(state.side).toBe('front');
    expect(state.scale).toBe(1);
    expect(state.pull).toBe(0);
    await expect(page.locator('#extract')).toBeHidden();
    await expect(page.locator('#reading-tools')).toBeVisible();
    await expect(page.locator('#camera-open')).toBeHidden();
    await expect(page.locator('#chapter-label')).toHaveText('OUR WEDDING INVITATION');
    await expectGuide(page, '카드를 눌러 뒷면도 읽어 주세요', '03', 'read');
  });
});

test.describe('reading', () => {
  test.beforeEach(async ({ page }) => {
    await loadFresh(page);
    await toReading(page);
  });

  test('clicking the card flips it both ways; the label follows', async ({ page }) => {
    const card = page.locator('#card');
    await card.click();
    await expect(page.locator('#scene')).toHaveAttribute('data-side', 'back');
    await expect(card).toHaveAttribute('aria-label', '청첩장 뒷면 · 100%');
    await expect(page.locator('#camera-open')).toBeVisible();
    await settle(page);
    await card.click();
    await expect(page.locator('#scene')).toHaveAttribute('data-side', 'front');
    await expect(card).toHaveAttribute('aria-label', '청첩장 앞면 · 100%');
    await expect(page.locator('#camera-open')).toBeHidden();
  });

  test('a drag at 100% neither flips nor pans; a near-still press still flips', async ({ page }) => {
    const centre = await pointOn(page, '#card');
    await mouseDrag(page, centre, { x: centre.x + 40, y: centre.y + 25 });
    let state = await snapshot(page);
    expect(state.side).toBe('front');
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
    // Within the 6px tap tolerance.
    await mouseDrag(page, centre, { x: centre.x + 3, y: centre.y + 2 }, 2);
    state = await snapshot(page);
    expect(state.side).toBe('back');
  });

  test('wheel zooms around the cursor, clamps at 100% and 400%, and does not scroll the page', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Wheel input is a desktop gesture; mobile WebKit emulation has no wheel.');
    const off = await pointOn(page, '#card', 0.25, 0.25);
    const scrollBefore = await page.evaluate(() => scrollY);
    await page.mouse.move(off.x, off.y);
    await page.mouse.wheel(0, -300);
    await expect.poll(async () => (await snapshot(page)).scale).toBeGreaterThan(1.5);
    let state = await snapshot(page);
    // Zooming toward the upper-left quarter shifts content down/right to keep it under the cursor.
    expect(state.panX).toBeGreaterThan(0);
    expect(state.panY).toBeGreaterThan(0);
    expect(state.side).toBe('front');
    await expectGuide(page, '끌어서 찬찬히 읽어 주세요', '03', 'zoom');
    expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);

    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -500);
    await expect.poll(async () => (await snapshot(page)).scale).toBe(4);
    await expect(page.locator('#zoom-in')).toBeDisabled();

    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 500);
    await expect.poll(async () => (await snapshot(page)).scale).toBe(1);
    state = await snapshot(page);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
  });

  test('panning a zoomed card moves it within bounds and never flips', async ({ page }) => {
    await page.locator('#zoom-in').click();
    await page.locator('#zoom-in').click();
    await settle(page);
    expect((await snapshot(page)).scale).toBe(2);
    const centre = await pointOn(page, '#card');
    await mouseDrag(page, centre, { x: centre.x - 60, y: centre.y - 70 });
    let state = await snapshot(page);
    expect(state.side).toBe('front');
    expect(state.panX).toBeCloseTo(-60, 0);
    expect(state.panY).toBeCloseTo(-70, 0);

    // Dragging far is constrained to half the overflow (card size at 2x). Repeated on-screen
    // drags from the unzoomed centre, which the zoomed card always still covers.
    const size = await page.evaluate(() => ({ w: document.querySelector('#card').offsetWidth, h: document.querySelector('#card').offsetHeight }));
    for (let i = 0; i < 4; i++) await mouseDrag(page, centre, { x: centre.x + 100, y: centre.y + 100 });
    state = await snapshot(page);
    expect(state.side).toBe('front');
    expect(state.panX).toBeCloseTo(size.w / 2, 0);
    expect(state.panY).toBeCloseTo(size.h / 2, 0);
  });

  test('controls: flip while enlarged preserves zoom and pan, reset restores 100% and centre', async ({ page }) => {
    const zoomIn = page.locator('#zoom-in');
    const zoomOut = page.locator('#zoom-out');
    const reset = page.locator('#zoom-reset');
    const flip = page.locator('#flip');
    await expect(zoomOut).toBeDisabled();
    await expect(reset).toHaveText('100%');
    for (const label of ['150%', '200%', '250%', '300%', '350%', '400%']) {
      await zoomIn.click();
      await expect(reset).toHaveText(label);
    }
    await expect(zoomIn).toBeDisabled();
    await expect(flip).toBeEnabled();
    await page.locator('#card').press('ArrowRight');
    expect((await snapshot(page)).panX).toBe(-30);
    await flip.click();
    let enlarged = await snapshot(page);
    expect([enlarged.side, enlarged.scale, enlarged.panX]).toEqual(['back', 4, -30]);
    await flip.click();
    enlarged = await snapshot(page);
    expect([enlarged.side, enlarged.scale, enlarged.panX]).toEqual(['front', 4, -30]);
    await zoomOut.click();
    await expect(reset).toHaveText('350%');
    await reset.click();
    await expect(reset).toHaveText('100%');
    const state = await snapshot(page);
    expect(state.scale).toBe(1);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
    await expect(flip).toBeEnabled();
    await expect(zoomOut).toBeDisabled();
    for (const id of ['#flip', '#zoom-in', '#zoom-out', '#zoom-reset', '#replay']) {
      await expect(page.locator(id)).toHaveAccessibleName(/.+/);
    }
  });

  test('replay and zoom controls stay reachable at maximum zoom', async ({ page }) => {
    for (let i = 0; i < 6; i++) await page.locator('#zoom-in').click();
    await settle(page);
    for (const id of ['#replay', '#zoom-reset', '#zoom-out']) {
      const point = await pointOn(page, id);
      expect(point.hit, `${id} should not be covered by the zoomed card (hit ${point.hitName})`).toBe(true);
    }
  });
});

test.describe('keyboard', () => {
  test('whole flow is operable from the keyboard, including camera escape and aiming', async ({ page, browserName }) => {
    await loadFresh(page);
    const requests = await interceptDestination(page);
    if (browserName === 'chromium') {
      await page.keyboard.press('Tab');
      await expect(page.locator('#share-open')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#replay')).toBeFocused();
      await page.keyboard.press('Tab');
    } else {
      // WebKit only tabs to buttons with the macOS "keyboard navigation" preference.
      await page.locator('#seal').focus();
    }
    await expect(page.locator('#seal')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#scene')).toHaveAttribute('data-phase', 'open');
    await expect(page.locator('#card')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#scene')).toHaveAttribute('data-phase', 'reading');
    expect((await snapshot(page)).side).toBe('front');
    await settle(page);

    await page.keyboard.press('Enter');
    await expect(page.locator('#scene')).toHaveAttribute('data-side', 'back');
    // keyboard.type emits keydown with key '+' (press() would parse '+' as a chord separator).
    await page.keyboard.type('+');
    await page.keyboard.type('=');
    await expect(page.locator('#scene')).toHaveAttribute('data-scale', '2.00');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    let state = await snapshot(page);
    expect([state.panX, state.panY]).toEqual([30, 30]);
    await page.keyboard.press('Enter');
    expect((await snapshot(page)).side).toBe('front');
    await page.keyboard.press('Enter');
    expect((await snapshot(page)).side).toBe('back');
    await page.keyboard.type('-');
    await expect(page.locator('#scene')).toHaveAttribute('data-scale', '1.50');
    await page.keyboard.type('0');
    state = await snapshot(page);
    expect([state.scale, state.panX, state.panY]).toEqual([1, 0, 0]);
    await settle(page);

    await page.locator('#camera-open').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.phone')).toBeFocused();
    await expect(page.locator('#reading-tools')).toHaveJSProperty('inert', true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#camera-layer')).toBeHidden();
    await expect(page.locator('#camera-open')).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator('.phone')).toBeFocused();
    await settle(page);
    await page.evaluate(() => document.querySelector('#scene').scrollIntoView({ block: 'center' }));
    await keyboardAimAtQr(page);
    const navigation = page.waitForRequest(DESTINATION);
    await page.locator('#shutter').focus();
    await page.keyboard.press('Enter');
    expect((await navigation).url()).toBe(DESTINATION);
    await page.waitForURL(DESTINATION);
    expect(page.url()).toBe(DESTINATION);
    expect(requests).toEqual([DESTINATION]);
  });
});

test.describe('guides', () => {
  test('the persistent guide follows every stage', async ({ page }) => {
    await loadFresh(page);
    await expectGuide(page, '인장을 눌러 열어 주세요', '01', 'seal');
    await openSeal(page);
    await expectGuide(page, '카드를 위로 꺼내 주세요', '02', 'pull');
    await page.locator('#extract').click();
    await expectGuide(page, '카드를 눌러 뒷면도 읽어 주세요', '03', 'read');
    await page.locator('#flip').click();
    await expectGuide(page, 'QR을 찍으면 다음 이야기로 이어져요', '03', 'aim');
    await page.locator('#zoom-in').click();
    await expectGuide(page, '끌어서 찬찬히 읽어 주세요', '03', 'zoom');
    await page.locator('#zoom-reset').click();
    await expectGuide(page, 'QR을 찍으면 다음 이야기로 이어져요', '03', 'aim');
    await settle(page);
    await openCamera(page);
    await expectGuide(page, '휴대전화를 끌어 QR에 맞춰 주세요', '04', 'aim');
    await expect(page.locator('#camera-status')).toHaveText('QR 코드를 찾는 중입니다.');
    await page.locator('#camera-close').click();
    await expectGuide(page, 'QR을 찍으면 다음 이야기로 이어져요', '03', 'aim');
    await page.locator('#replay').click();
    await expectGuide(page, '인장을 눌러 열어 주세요', '01', 'seal');
    // The guide sits outside the scene and never covers the card.
    const overlap = await page.evaluate(() => {
      const a = document.querySelector('#guidance').getBoundingClientRect();
      const b = document.querySelector('#scene').getBoundingClientRect();
      return a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    });
    expect(overlap).toBe(false);
  });
});

test.describe('camera', () => {
  test.beforeEach(async ({ page }) => {
    await loadFresh(page);
    await toBack(page);
  });

  test('opening the camera resets zoom; closing restores the previous zoom and pan and focus', async ({ page }) => {
    await page.locator('#zoom-in').click();
    await page.locator('#zoom-in').click();
    await settle(page);
    const centre = await pointOn(page, '#card');
    await mouseDrag(page, centre, { x: centre.x + 35, y: centre.y - 45 });
    const before = await snapshot(page);
    expect(before.scale).toBe(2);
    expect(before.panX).not.toBe(0);
    expect(before.side).toBe('back');

    await openCamera(page);
    let state = await snapshot(page);
    expect([state.scale, state.panX, state.panY, state.camera]).toEqual([1, 0, 0, true]);
    await expect(page.locator('.phone')).toBeFocused();
    await expect(page.locator('#card')).toHaveAttribute('tabindex', '-1');

    await page.locator('#camera-close').click();
    await expect(page.locator('#camera-layer')).toBeHidden();
    state = await snapshot(page);
    expect(state.camera).toBe(false);
    expect(state.scale).toBe(before.scale);
    expect(state.panX).toBeCloseTo(before.panX, 3);
    expect(state.panY).toBeCloseTo(before.panY, 3);
    expect(state.side).toBe('back');
    await expect(page.locator('#camera-open')).toBeFocused();
    await expect(page.locator('#card')).toHaveAttribute('tabindex', '0');
    await expect(page.locator('#reading-tools')).toHaveJSProperty('inert', false);
  });

  test('shutter while misaimed stays in the camera, guides, and never navigates', async ({ page }) => {
    const requests = await interceptDestination(page);
    await openCamera(page);
    await expect(page.locator('.phone')).toHaveAttribute('data-aligned', 'false');
    await page.locator('#shutter').click();
    await expectGuide(page, 'QR에 조금 더 가까이 맞춰 주세요', '04', 'aim');
    await page.waitForTimeout(1200);
    await expect(page.locator('#camera-layer')).toBeVisible();
    await expect(page.locator('#shutter')).toBeEnabled();
    await expect(page.locator('.phone')).not.toHaveClass(/captured/);
    expect(requests).toEqual([]);
    expect(new URL(page.url()).pathname).toBe('/paper-wedding-invitation/');
  });

  test('dragging the phone onto the QR then pressing the shutter goes to the exact mobile invitation', async ({ page }) => {
    const requests = await interceptDestination(page);
    await openCamera(page);
    await expect(page.locator('.phone')).toHaveAttribute('data-aligned', 'false');
    await dragPhoneToQr(page);
    await expect(page.locator('#camera-status')).toHaveText('준비됐어요 · 촬영해 주세요');
    // Dragging the phone must not affect the card underneath.
    const state = await snapshot(page);
    expect([state.side, state.scale]).toEqual(['back', 1]);

    const navigation = page.waitForRequest(DESTINATION);
    await page.locator('#shutter').click();
    await expectGuide(page, '초대를 담았어요', '04', 'read');
    expect((await navigation).url()).toBe(DESTINATION);
    await page.waitForURL(DESTINATION);
    expect(page.url()).toBe(DESTINATION);
    expect(requests).toEqual([DESTINATION]);
  });

  test('replay during a pending capture navigation cancels it and fully resets', async ({ page }) => {
    const requests = await interceptDestination(page);
    await openCamera(page);
    await dragPhoneToQr(page);
    const shutter = await pointOn(page, '#shutter');
    const replay = await pointOn(page, '#replay');
    expect(shutter.hit && replay.hit).toBe(true);
    // Two raw clicks back to back, real timers: replay must land inside the capture delay.
    const started = Date.now();
    await page.mouse.click(shutter.x, shutter.y);
    await page.mouse.click(replay.x, replay.y);
    const gap = Date.now() - started;
    expect(gap, 'replay must be clicked while navigation is still pending (650ms)').toBeLessThan(500);
    await page.waitForTimeout(1500);

    expect(requests).toEqual([]);
    expect(new URL(page.url()).pathname).toBe('/paper-wedding-invitation/');
    const state = await snapshot(page);
    expect(state).toEqual({ phase: 'closed', side: 'front', scale: 1, camera: false, panX: 0, panY: 0, pull: 0 });
    await expect(page.locator('#camera-layer')).toBeHidden();
    await expect(page.locator('#reading-tools')).toBeHidden();
    await expect(page.locator('#extract')).toBeHidden();
    await expect(page.locator('#seal')).toBeEnabled();
    await expect(page.locator('#seal')).toBeFocused();
    await expect(page.locator('#card')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#chapter-label')).toHaveText('WITH LOVE, TO YOU');
    await expectGuide(page, '인장을 눌러 열어 주세요', '01', 'seal');

    // The camera comes back clean after a replayed flow.
    await toBack(page);
    await openCamera(page);
    await expect(page.locator('#shutter')).toBeEnabled();
    await expect(page.locator('.phone')).not.toHaveClass(/captured/);
    await expect(page.locator('.phone')).toHaveAttribute('data-aligned', 'false');
  });
});

// ---------------------------------------------------------------- touch

test.describe('touch on Chromium via real CDP touch events', () => {
  test.use({ hasTouch: true });
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP Input.dispatchTouchEvent is Chromium-only.');

  async function touchscreen(page) {
    const cdp = await page.context().newCDPSession(page);
    const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    return {
      async drag(from, to, steps = 10) {
        await send('touchStart', [{ x: from.x, y: from.y, id: 1 }]);
        for (let i = 1; i <= steps; i++) {
          await send('touchMove', [{ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps, id: 1 }]);
        }
        await send('touchEnd', []);
      },
      async pinch(centre, startGap, endGap, steps = 10) {
        const points = gap => [{ x: centre.x - gap / 2, y: centre.y, id: 1 }, { x: centre.x + gap / 2, y: centre.y, id: 2 }];
        await send('touchStart', points(startGap));
        for (let i = 1; i <= steps; i++) await send('touchMove', points(startGap + (endGap - startGap) * i / steps));
        await send('touchEnd', []);
      },
    };
  }

  test('short touch pull springs back, sufficient touch pull extracts front-up', async ({ page }) => {
    await loadFresh(page);
    await openSeal(page);
    const touch = await touchscreen(page);
    const grab = await cardGrabPoint(page);
    await touch.drag(grab, { x: grab.x, y: grab.y - 8 });
    let state = await snapshot(page);
    expect([state.phase, state.pull]).toEqual(['open', 0]);
    await touch.drag(grab, { x: grab.x, y: grab.y - 40 });
    await expect(page.locator('#scene')).toHaveAttribute('data-phase', 'reading');
    state = await snapshot(page);
    expect(state.side).toBe('front');
  });

  test('tap flips; pinch zooms without flipping; one-finger pan when zoomed does not flip', async ({ page }) => {
    await loadFresh(page);
    await toReading(page);
    await page.locator('#card').tap();
    await expect(page.locator('#scene')).toHaveAttribute('data-side', 'back');
    await settle(page);

    const touch = await touchscreen(page);
    const centre = await pointOn(page, '#card');
    await touch.pinch(centre, 60, 150);
    let state = await snapshot(page);
    expect(state.scale).toBeGreaterThan(2);
    expect(state.scale).toBeLessThan(3);
    expect(state.side).toBe('back');
    await expectGuide(page, '끌어서 찬찬히 읽어 주세요', '03', 'zoom');

    // Pinch past the limit clamps at 400%.
    await touch.pinch(centre, 40, 400);
    expect((await snapshot(page)).scale).toBe(4);

    const panFrom = await pointOn(page, '#card');
    const before = await snapshot(page);
    await touch.drag(panFrom, { x: panFrom.x + 50, y: panFrom.y + 30 });
    state = await snapshot(page);
    expect(state.side).toBe('back');
    expect(state.panX).toBeCloseTo(before.panX + 50, 0);

    await touch.pinch(centre, 300, 20);
    state = await snapshot(page);
    expect([state.scale, state.panX, state.panY, state.side]).toEqual([1, 0, 0, 'back']);
  });

  test('phone can be aimed by touch and the capture navigates', async ({ page }) => {
    const requests = await interceptDestination(page);
    await loadFresh(page);
    await toBack(page);
    await openCamera(page);
    const touch = await touchscreen(page);
    const { reticle, qr, grab } = await grabPhonePoint(page);
    await touch.drag(grab, { x: grab.x + qr.x - reticle.x, y: grab.y + qr.y - reticle.y }, 15);
    await expect(page.locator('.phone')).toHaveAttribute('data-aligned', 'true');
    const navigation = page.waitForRequest(DESTINATION);
    await page.locator('#shutter').tap();
    expect((await navigation).url()).toBe(DESTINATION);
    await page.waitForURL(DESTINATION);
    expect(requests).toEqual([DESTINATION]);
  });
});

// ---------------------------------------------------------------- layout

const WIDTHS = [
  { name: '320', width: 320, height: 568 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
  { name: 'desktop', width: 1280, height: 800 },
];

async function expectFitsHorizontally(page, label) {
  const report = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders = [];
    const selectors = ['.masthead', '#replay', '.chapter', '#guidance', '.guide-copy', '#extract', '#reading-tools button',
      'footer', 'footer > *', '.phone', '#card', '.envelope-back', '#seal'];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (element.closest('[hidden]') || !element.getClientRects().length) continue;
        if (element.id === 'card' && Number(document.querySelector('#scene').dataset.scale) > 1) continue;
        const rect = element.getBoundingClientRect();
        if (rect.left < -0.5 || rect.right > width + 0.5) offenders.push(`${selector} [${Math.round(rect.left)}, ${Math.round(rect.right)}]`);
      }
    }
    return { width, scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth, offenders };
  });
  expect(report.offenders, `${label}: elements outside 0..${report.width}px`).toEqual([]);
  expect(report.scrollWidth, `${label}: document scroll width`).toBeLessThanOrEqual(report.width);
  expect(report.bodyScrollWidth, `${label}: body scroll width`).toBeLessThanOrEqual(report.width);
}

test.describe('responsive layout', () => {
  for (const viewport of WIDTHS) {
    test(`${viewport.name}px wide: no horizontal overflow at any stage`, async ({ page, isMobile }, testInfo) => {
      test.skip(isMobile && viewport.name === 'desktop', 'Desktop width runs in the desktop project.');
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loadFresh(page);
      await expectFitsHorizontally(page, 'closed');
      await openSeal(page);
      await expectFitsHorizontally(page, 'open');
      await page.locator('#extract').click();
      await settle(page);
      await expectFitsHorizontally(page, 'reading front');
      await page.locator('#flip').click();
      await settle(page);
      await expectFitsHorizontally(page, 'reading back');
      // Tools must be one tap away and at least 44px tall.
      for (const id of ['#flip', '#zoom-in', '#zoom-out', '#zoom-reset', '#replay']) {
        const box = await page.locator(id).boundingBox();
        expect(box.height, `${id} height`).toBeGreaterThanOrEqual(44);
      }
      await openCamera(page);
      await expectFitsHorizontally(page, 'camera');
      // Phone and shutter fully on screen vertically when the scene is centred.
      const phone = await page.locator('.phone').boundingBox();
      expect(phone.y).toBeGreaterThanOrEqual(0);
      expect(phone.y + phone.height).toBeLessThanOrEqual(viewport.height + 0.5);
      await testInfo.attach(`camera-${viewport.name}`, { body: await page.screenshot(), contentType: 'image/png' });
    });
  }

  test('resizing keeps the current stage and side', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Covered once in the desktop project.');
    await loadFresh(page);
    await toBack(page);
    await page.locator('#zoom-in').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    const state = await snapshot(page);
    expect([state.phase, state.side, state.scale]).toEqual(['reading', 'back', 1.5]);
    await page.locator('#zoom-reset').click();
    await settle(page);
    await expectFitsHorizontally(page, 'after resize');
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('guide stays readable without animation and every essential step works via controls', async ({ page }) => {
    const requests = await interceptDestination(page);
    await loadFresh(page);
    const motion = await page.evaluate(() => {
      const guideMotion = getComputedStyle(document.querySelector('#guide-motion'));
      const rig = getComputedStyle(document.querySelector('.rig'));
      return { animation: guideMotion.animationName, transition: parseFloat(rig.transitionDuration) };
    });
    expect(motion.animation).toBe('none');
    expect(motion.transition).toBeLessThan(0.05);
    await expectGuide(page, '인장을 눌러 열어 주세요', '01');

    await page.locator('#seal').click();
    await expectGuide(page, '카드를 위로 꺼내 주세요', '02');
    await page.locator('#extract').click();
    await expectGuide(page, '카드를 눌러 뒷면도 읽어 주세요', '03');
    await page.locator('#flip').click();
    await expect(page.locator('#scene')).toHaveAttribute('data-side', 'back');
    await page.locator('#zoom-in').click();
    await expect(page.locator('#zoom-reset')).toHaveText('150%');
    await page.locator('#zoom-reset').click();
    await page.locator('#camera-open').click();
    await expect(page.locator('.phone')).toBeFocused();
    await page.evaluate(() => document.querySelector('#scene').scrollIntoView({ block: 'center' }));
    await keyboardAimAtQr(page);
    const navigation = page.waitForRequest(DESTINATION);
    await page.locator('#shutter').click();
    expect((await navigation).url()).toBe(DESTINATION);
    await page.waitForURL(DESTINATION);
    expect(requests).toEqual([DESTINATION]);
  });
});

for (const asset of ['front.webp', 'vellum-envelope.png', 'phone-body.png']) {
  test(`a failed ${asset} shows recovery guidance and reload recovers`, async ({ page }) => {
    const pattern = `**/${asset}`;
    await page.route(pattern, route => route.fulfill({ status: 404, body: '' }));
    await page.goto('./');
    await expect(page.locator('#asset-error')).toBeVisible();
    await page.unroute(pattern);
    await page.locator('#reload').click();
    await expect(page.locator('#asset-error')).toBeHidden();
    await expect.poll(() => page.evaluate(() =>
      [...document.querySelectorAll('.card img, .envelope-photo img, .phone-body')].every(img => img.complete && img.naturalWidth > 0))).toBe(true);
    await expect(page.locator('#scene')).toHaveAttribute('data-phase', 'closed');
  });
}

test('supplied Galaxy body contains the scanner UI; light and gallery controls work', async ({ page }) => {
  await loadFresh(page);
  await toBack(page);
  await openCamera(page);
  await expect(page.locator('.phone-body')).toBeVisible();
  await expect(page.locator('.reticle i')).toHaveCount(4);
  await expect(page.locator('#camera-status')).toHaveText('QR 코드를 찾는 중입니다.');
  await page.getByRole('button', { name: '조명 켜기', exact: true }).click();
  await expect(page.locator('.phone')).toHaveClass(/light-on/);
  await expect(page.locator('#camera-light')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '갤러리 열기', exact: true }).click();
  await expect(page.locator('.gallery-grid button')).toHaveCount(7);
  await page.locator('#camera-close').click();
  await expect(page.locator('#camera-layer')).toBeHidden();
  await expect(page.locator('#camera-open')).toBeFocused();
  await openCamera(page);
  await expect(page.locator('#camera-light')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.phone')).not.toHaveClass(/light-on/);
});


test('bear gallery opens every supplied image within the phone and returns to manual QR aiming', async ({ page }) => {
  await loadFresh(page);
  await toBack(page);
  await openCamera(page);
  await page.locator('#camera-gallery').click();
  await expect(page.locator('.phone')).toHaveAttribute('data-screen', 'gallery');
  await expect(page.locator('#shutter')).toBeHidden();
  await expect(page.locator('.gallery-grid button')).toHaveCount(7);
  await expect.poll(() => page.locator('.gallery-grid img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  const before = await page.locator('.phone').boundingBox();
  for (let index = 0; index < 7; index++) {
    await page.getByRole('button', { name: `곰 사진 ${index + 1} 보기`, exact: true }).click();
    await expect(page.locator('.phone')).toHaveAttribute('data-screen', 'photo');
    await expect(page.locator('.gallery-photo')).toHaveAttribute('src', new RegExp(`bear-${index + 1}\\.png$`));
    await expect.poll(() => page.locator('.gallery-photo').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(page.locator('.gallery-photo')).toHaveCSS('object-fit', 'contain');
    await expect(page.locator('.photo-count')).toHaveText(`${index + 1} / 7`);
    const image = await page.locator('.gallery-photo').boundingBox();
    expect(image.x).toBeGreaterThan(before.x);
    expect(image.x + image.width).toBeLessThan(before.x + before.width);
    expect(image.y + image.height).toBeLessThan(before.y + before.height);
    await page.getByRole('button', { name: '사진첩으로 돌아가기', exact: true }).click();
    await expect(page.locator('.gallery-grid')).toBeVisible();
  }
  const after = await page.locator('.phone').boundingBox();
  expect(after).toEqual(before); // Looking through photos must not drag the phone.
  await page.locator('#phone-back').click();
  await expect(page.locator('.phone')).toHaveAttribute('data-screen', 'camera');
  await expect(page.locator('#camera-gallery')).toBeFocused();
  await dragPhoneToQr(page);
  const requests = await interceptDestination(page);
  await page.locator('#shutter').click();
  await page.waitForURL(DESTINATION);
  expect(requests).toEqual([DESTINATION]);
});

test('photo navigation, nested Escape, home and replay keep gallery state isolated', async ({ page }) => {
  await loadFresh(page);
  await toBack(page);
  await openCamera(page);
  await page.locator('#phone-albums').click();
  await page.getByRole('button', { name: '곰 사진 1 보기', exact: true }).click();
  await expect(page.locator('.photo-previous')).toBeDisabled();
  await page.locator('.photo-next').click();
  await expect(page.locator('.photo-count')).toHaveText('2 / 7');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.photo-count')).toHaveText('3 / 7');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.photo-count')).toHaveText('2 / 7');
  await page.keyboard.press('Escape');
  await expect(page.locator('.phone')).toHaveAttribute('data-screen', 'gallery');
  await expect(page.getByRole('button', { name: '곰 사진 2 보기', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.phone')).toHaveAttribute('data-screen', 'camera');
  await page.locator('#camera-gallery').click();
  await page.getByRole('button', { name: '곰 사진 7 보기', exact: true }).click();
  await expect(page.locator('.photo-next')).toBeDisabled();
  await page.locator('#phone-home').click();
  await expect(page.locator('.phone')).toHaveAttribute('data-screen', 'camera');
  await page.locator('#camera-gallery').click();
  await page.locator('#replay').click();
  await expect(page.locator('#camera-layer')).toBeHidden();
  await toBack(page);
  await openCamera(page);
  await expect(page.locator('.phone')).toHaveAttribute('data-screen', 'camera');
  await expect(page.locator('.gallery-panel')).toBeHidden();
});

test('a missing album photo reports the failure and the next photo remains usable', async ({ page }) => {
  await page.route('**/bears/bear-2.png', route => route.abort());
  await loadFresh(page);
  await toBack(page);
  await openCamera(page);
  await page.locator('#camera-gallery').click();
  await page.getByRole('button', { name: '곰 사진 2 보기', exact: true }).click();
  await expect(page.locator('.photo-error')).toBeVisible();
  await page.locator('.photo-next').click();
  await expect.poll(() => page.locator('.gallery-photo').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.locator('.photo-error')).toBeHidden();
  await expect(page.locator('.photo-count')).toHaveText('3 / 7');
  await page.locator('#phone-back').click();
  await expect(page.locator('.gallery-grid')).toBeVisible();
});
