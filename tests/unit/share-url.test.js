import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_NAME_LENGTH,
  normalizeRecipient,
  getRecipient,
  buildRecipientUrl,
} from "../../src/share-url.js";

const BASE = "https://wonsik-ha.github.io/paper-wedding-invitation/";

const roundTrip = (name) =>
  getRecipient(new URL(buildRecipientUrl(BASE, name)).search);

test("MAX_NAME_LENGTH is 40", () => {
  assert.equal(MAX_NAME_LENGTH, 40);
});

test("Korean, emoji and special characters survive a URL round trip", () => {
  for (const name of [
    "김철수",
    "민지 & 지훈 💐",
    "👨‍👩‍👧 가족",
    "A+B=C? #1 / 100% 'quote' \"dq\"",
    "Ünïcødé — ok",
  ]) {
    assert.equal(roundTrip(name), name);
  }
});

test("ampersand and plus do not split or corrupt the query", () => {
  const href = buildRecipientUrl(BASE, "Tom & Jerry+1");
  const url = new URL(href);
  assert.deepEqual([...url.searchParams.keys()], ["to"]);
  assert.equal(getRecipient(url.search), "Tom & Jerry+1");
});

test("HTML-looking input is kept as a literal string", () => {
  const html = '<img src=x onerror="alert(1)">';
  assert.equal(normalizeRecipient(html), html);
  assert.equal(roundTrip("<b>홍길동</b>"), "<b>홍길동</b>");
  const href = buildRecipientUrl(BASE, "<script>");
  assert.ok(
    !href.includes("<"),
    "angle brackets are percent-encoded in the URL",
  );
});

test("missing, empty and blank recipients yield an empty string", () => {
  assert.equal(getRecipient(""), "");
  assert.equal(getRecipient("?other=1"), "");
  assert.equal(getRecipient("?to="), "");
  assert.equal(getRecipient("?to=%20%20%09"), "");
  assert.equal(getRecipient(undefined), "");
  assert.equal(getRecipient(new URLSearchParams("to=%E2%80%83")), "");
});

test("getRecipient accepts strings with or without ? and URLSearchParams", () => {
  assert.equal(getRecipient("?to=%EA%B9%80"), "김");
  assert.equal(getRecipient("to=%EA%B9%80"), "김");
  assert.equal(getRecipient(new URLSearchParams({ to: "  김  " })), "김");
});

test("non-string values normalize to empty", () => {
  for (const value of [undefined, null, 42, {}, ["김"]]) {
    assert.equal(normalizeRecipient(value), "");
  }
});

test("whitespace is collapsed and trimmed, controls become spaces", () => {
  assert.equal(normalizeRecipient("  김   철수  "), "김 철수");
  assert.equal(normalizeRecipient("김\n\t철수\r\n"), "김 철수");
  assert.equal(normalizeRecipient("a\u0000b\u0007c\u007fd"), "a b c d");
  assert.equal(normalizeRecipient("\u001b[31m빨강"), "[31m빨강");
  assert.equal(getRecipient("?to=%00%E2%80%83%EA%B9%80%0A"), "김");
});

test("input is NFC normalized", () => {
  const decomposed = "가"; // ᄀ + ᅡ → 가
  assert.equal(normalizeRecipient(decomposed), "가");
  assert.equal(normalizeRecipient("é"), "é");
});

test("names are capped at 40 code points without splitting surrogates", () => {
  assert.equal(normalizeRecipient("가".repeat(50)), "가".repeat(40));
  const emojis = normalizeRecipient("😀".repeat(45));
  assert.equal(Array.from(emojis).length, MAX_NAME_LENGTH);
  assert.equal(emojis, "😀".repeat(40));
  const mixed = normalizeRecipient("a".repeat(39) + "😀😀");
  assert.equal(mixed, "a".repeat(39) + "😀");
  assert.ok(!/[\ud800-\udbff]$/.test(mixed), "no dangling high surrogate");
  assert.equal(roundTrip("한".repeat(60)), "한".repeat(40));
});

test("truncation does not leave a trailing space", () => {
  assert.equal(normalizeRecipient("a".repeat(39) + " bcd"), "a".repeat(39));
});

test("buildRecipientUrl replaces stale recipient, other params and hash", () => {
  const href = buildRecipientUrl(
    `${BASE}?to=old&utm_source=kakao&to=dup#gallery`,
    "새 손님",
  );
  const url = new URL(href);
  assert.equal(url.origin, "https://wonsik-ha.github.io");
  assert.equal(url.pathname, "/paper-wedding-invitation/");
  assert.equal(url.hash, "");
  assert.deepEqual([...url.searchParams.entries()], [["to", "새 손님"]]);
});

test("buildRecipientUrl with blank name returns a clean base URL", () => {
  assert.equal(buildRecipientUrl(`${BASE}?to=old#x`, "   "), BASE);
  assert.equal(buildRecipientUrl(`${BASE}?a=1`, undefined), BASE);
});

test("buildRecipientUrl preserves nested paths, files and ports", () => {
  assert.equal(
    buildRecipientUrl("http://127.0.0.1:5173/repo/sub/index.html?x=1#h", "김"),
    "http://127.0.0.1:5173/repo/sub/index.html?to=%EA%B9%80",
  );
});

test("buildRecipientUrl stores the normalized name", () => {
  const url = new URL(buildRecipientUrl(BASE, "  김\n철수  "));
  assert.equal(url.searchParams.get("to"), "김 철수");
});

test("buildRecipientUrl rejects relative hrefs", () => {
  assert.throws(
    () => buildRecipientUrl("/paper-wedding-invitation/", "김"),
    TypeError,
  );
});
