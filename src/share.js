import {
  buildRecipientUrl,
  getRecipient,
  normalizeRecipient,
} from "./share-url.js";

export function setupSharing() {
  const name = getRecipient(window.location.search);
  if (name)
    document.querySelector(".arrival h1").textContent =
      `${name} 님께 청첩장이 도착했습니다!`;
  for (const recipient of document.querySelectorAll(".card-recipient")) {
    recipient.textContent = name ? `${name} 님께` : "";
    recipient.title = recipient.textContent;
    recipient.hidden = !name;
  }

  const open = document.querySelector("#share-open");
  const dialog = document.querySelector("#share-dialog");
  const form = document.querySelector("#share-form");
  const input = document.querySelector("#recipient-name");
  const submit = document.querySelector("#share-submit");
  const result = document.querySelector("#share-result");
  const link = document.querySelector("#share-link");
  const status = document.querySelector("#share-status");
  const preview = document.querySelector("#share-preview");
  const defaultMessage = document.querySelector(
    'meta[property="og:description"]',
  ).content;
  const messageFor = (to) =>
    to ? `${to} 님께, 원식과 경민의 청첩장을 전합니다.` : defaultMessage;

  open.addEventListener("click", () => {
    form.reset();
    input.value = name || "경민";
    preview.textContent = messageFor(input.value);
    result.hidden = true;
    status.textContent = "";
    dialog.showModal();
    input.focus();
  });
  document
    .querySelector("#share-close")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => open.focus({ preventScroll: true }));
  input.addEventListener("input", () => {
    preview.textContent = messageFor(normalizeRecipient(input.value));
    result.hidden = true;
    status.textContent = "";
  });
  link.addEventListener("click", () => link.select());

  async function copyText(value, message) {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      status.textContent = message;
    } catch {
      status.textContent =
        "자동 복사가 되지 않았어요. 아래 링크를 선택해 직접 복사해 주세요.";
      link.focus();
      link.select();
    }
  }
  document
    .querySelector("#share-copy")
    .addEventListener("click", () =>
      copyText(link.value, "링크를 복사했어요. 받는 분께 전해 주세요."),
    );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const to = normalizeRecipient(input.value);
    input.value = to;
    link.value = buildRecipientUrl(window.location.href, to);
    result.hidden = false;
    const invitation = `${messageFor(to)}\n- 청첩장: ${link.value}`;
    status.textContent = "";
    submit.disabled = true;
    try {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: "원식 & 경민 · 종이 청첩장",
            text: invitation,
          });
          status.textContent = "초대를 공유했어요.";
          return;
        } catch (error) {
          if (error.name === "AbortError") {
            status.textContent = "공유를 취소했어요. 다시 공유할 수 있어요.";
            return;
          }
          await copyText(
            invitation,
            "공유 창을 열지 못해 초대 문구와 링크를 복사했어요.",
          );
          return;
        }
      }
      await copyText(
        invitation,
        "초대 문구와 링크를 복사했어요. 받는 분께 전해 주세요.",
      );
    } finally {
      submit.disabled = false;
    }
  });
}
