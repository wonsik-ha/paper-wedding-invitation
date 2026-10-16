export const MAX_NAME_LENGTH = 40;
const RECIPIENT_PARAM = "to";

// Returns plain text only; callers must render it via textContent.
export function normalizeRecipient(value) {
  if (typeof value !== "string") return "";
  const cleaned = value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Array.from splits by code point, so surrogate pairs are never cut in half.
  return Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join("").trim();
}

export function getRecipient(search) {
  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(search ?? "");
  return normalizeRecipient(params.get(RECIPIENT_PARAM) ?? "");
}

export function buildRecipientUrl(href, name) {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  const recipient = normalizeRecipient(name);
  if (recipient) url.searchParams.set(RECIPIENT_PARAM, recipient);
  return url.href;
}
