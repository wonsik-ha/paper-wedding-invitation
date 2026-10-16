import "./style.css";
import { ARTWORK, QR_REGION } from "./config.js";
import { extractionComplete } from "./geometry.js";
import { createReader } from "./reader.js";
import { createCamera } from "./camera.js";

const scene = document.querySelector("#scene");
const card = document.querySelector("#card");
const seal = document.querySelector("#seal");
const state = {
  phase: "closed",
  side: "front",
  scale: 1,
  panX: 0,
  panY: 0,
  camera: false,
};
const touchInput = matchMedia("(pointer: coarse)");
Object.assign(document.querySelector("#qr-target").style, {
  left: QR_REGION.x * 100 + "%",
  top: QR_REGION.y * 100 + "%",
  width: QR_REGION.width * 100 + "%",
  height: QR_REGION.height * 100 + "%",
});
function guide(title, detail, action, count) {
  document.querySelector("#guide-title").textContent = title;
  document.querySelector("#guide-detail").textContent = detail;
  document.querySelector("#guide-motion").dataset.action = action;
  document.querySelector("#page-count").textContent = count + " — 04";
}
function updateGuide() {
  if (state.camera) return;
  if (state.phase === "closed")
    guide(
      "인장을 눌러 열어 주세요",
      "당신께 전하고 싶은 이야기가 있어요.",
      "seal",
      "01",
    );
  else if (state.phase === "open")
    guide(
      "카드를 위로 꺼내 주세요",
      "조금만 위로 당기면 쏙 나와요.",
      "pull",
      "02",
    );
  else if (state.scale > 1)
    guide(
      "끌어서 찬찬히 읽어 주세요",
      "확대한 채로도 뒤집기 버튼을 눌러 앞뒤를 볼 수 있어요.",
      "zoom",
      "03",
    );
  else if (state.side === "back")
    guide(
      "QR을 찍으면 다음 이야기로 이어져요",
      "QR 찍기를 누르고 휴대전화를 직접 조준해 주세요.",
      "aim",
      "03",
    );
  else
    guide(
      "카드를 눌러 뒷면도 읽어 주세요",
      touchInput.matches
        ? "두 손가락으로 벌리면 더 크게 볼 수 있어요."
        : "마우스 휠을 굴리거나 + 버튼으로 확대해 보세요.",
      "read",
      "03",
    );
}
const reader = createReader({ card, scene, state, onChange: updateGuide });
const camera = createCamera({ scene, state, reader, guide, updateGuide });
function fitCard() {
  const availableHeight = Math.max(250, window.innerHeight - 300);
  const height = Math.min(
    540,
    availableHeight,
    ((scene.clientWidth - 46) * ARTWORK.height) / ARTWORK.width,
  );
  document.documentElement.style.setProperty("--card-h", height + "px");
  document.documentElement.style.setProperty(
    "--card-w",
    (height * ARTWORK.width) / ARTWORK.height + "px",
  );
  reader.refresh();
}
function openEnvelope() {
  if (state.phase !== "closed") return;
  state.phase = "open";
  scene.dataset.phase = "open";
  seal.disabled = true;
  seal.tabIndex = -1;
  card.tabIndex = 0;
  card.setAttribute("aria-disabled", "false");
  updateGuide();
  document.querySelector("#extract").hidden = false;
  card.focus({ preventScroll: true });
}
let extractionDrag = null;
function finishExtraction() {
  if (state.phase !== "open") return;
  state.phase = "reading";
  scene.dataset.phase = "reading";
  card.style.setProperty("--pull", "0px");
  card.classList.remove("dragging");
  document.querySelector("#extract").hidden = true;
  document.querySelector("#reading-tools").hidden = false;
  document.querySelector("#chapter-label").textContent =
    "OUR WEDDING INVITATION";
  reader.refresh();
}
card.addEventListener("pointerdown", (event) => {
  if (state.phase !== "open" || event.button !== 0 || extractionDrag) return;
  card.setPointerCapture(event.pointerId);
  extractionDrag = { id: event.pointerId, y: event.clientY, pull: 0 };
  card.classList.add("dragging");
});
card.addEventListener("pointermove", (event) => {
  if (!extractionDrag || extractionDrag.id !== event.pointerId) return;
  extractionDrag.pull = Math.max(0, extractionDrag.y - event.clientY);
  card.style.setProperty("--pull", extractionDrag.pull + "px");
});
function endExtraction(event) {
  if (!extractionDrag || extractionDrag.id !== event.pointerId) return;
  const complete =
    event.type === "pointerup" &&
    extractionComplete(extractionDrag.pull, card.offsetHeight);
  extractionDrag = null;
  card.classList.remove("dragging");
  if (complete) finishExtraction();
  else card.style.setProperty("--pull", "0px");
}
for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
  card.addEventListener(name, endExtraction);
document.querySelector("#extract").addEventListener("click", finishExtraction);
card.addEventListener("keydown", (event) => {
  if (state.phase === "open" && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    finishExtraction();
  }
});
seal.addEventListener("click", openEnvelope);
document.querySelector("#replay").addEventListener("click", () => {
  camera.close({ restore: false, focus: false });
  reader.clearGesture();
  if (extractionDrag && card.hasPointerCapture(extractionDrag.id))
    card.releasePointerCapture(extractionDrag.id);
  extractionDrag = null;
  Object.assign(state, {
    phase: "closed",
    side: "front",
    scale: 1,
    panX: 0,
    panY: 0,
    camera: false,
  });
  scene.dataset.phase = "closed";
  card.style.setProperty("--pull", "0px");
  card.tabIndex = -1;
  card.setAttribute("aria-disabled", "true");
  seal.disabled = false;
  seal.tabIndex = 0;
  document.querySelector("#extract").hidden = true;
  document.querySelector("#reading-tools").hidden = true;
  document.querySelector("#chapter-label").textContent = "WITH LOVE, TO YOU";
  reader.refresh();
  seal.focus({ preventScroll: true });
});
document
  .querySelector("#reload")
  .addEventListener("click", () => window.location.reload());
for (const img of document.querySelectorAll(".card img, .envelope-photo img")) {
  img.addEventListener("error", () => {
    document.querySelector("#asset-error").hidden = false;
  });
  if (img.complete && !img.naturalWidth)
    document.querySelector("#asset-error").hidden = false;
}
window.addEventListener("resize", fitCard);
touchInput.addEventListener("change", updateGuide);
fitCard();
