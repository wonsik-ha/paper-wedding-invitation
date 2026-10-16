import { MOBILE_INVITATION_URL } from "./config.js";
import { cameraAligned, clamp } from "./geometry.js";

export function createCamera({ scene, state, reader, guide, updateGuide }) {
  const layer = document.querySelector("#camera-layer");
  const openButton = document.querySelector("#camera-open");
  const tools = document.querySelector("#reading-tools");
  layer.innerHTML = `
    <div class="phone" role="group" aria-label="폴드8 QR 촬영 · 휴대전화를 끌거나 방향키로 조준" tabindex="0">
      <div class="phone-top"><span aria-hidden="true">9:41</span><i aria-hidden="true"></i><button id="camera-close" type="button" aria-label="촬영 닫기">×</button></div>
      <div class="viewfinder" aria-hidden="true"><img class="camera-preview" src="${import.meta.env.BASE_URL}back.webp" alt="" draggable="false"><div class="reticle"><i></i></div><div class="capture-flash"></div></div>
      <p class="camera-status" id="camera-status" role="status">QR을 네모 안에 맞춰 주세요</p>
      <button id="shutter" class="shutter" type="button" aria-label="QR 촬영"><span></span></button>
      <span class="camera-mode" aria-hidden="true">사진 <b>1×</b></span>
      <span class="phone-label" aria-hidden="true">GALAXY Z FOLD8</span>
    </div>`;
  const phone = layer.querySelector(".phone");
  const viewfinder = layer.querySelector(".viewfinder");
  const reticle = layer.querySelector(".reticle");
  const preview = layer.querySelector(".camera-preview");
  const status = layer.querySelector("#camera-status");
  const shutter = layer.querySelector("#shutter");
  let position = { x: 0, y: 0 };
  let drag = null;
  let previousView = null;
  let navigationTimer = null;
  let captured = false;
  let frame = null;

  function aligned() {
    const aim = reticle.getBoundingClientRect();
    const target = document.querySelector("#qr-target").getBoundingClientRect();
    return cameraAligned(
      { x: aim.left + aim.width / 2, y: aim.top + aim.height / 2 },
      target,
    );
  }
  function render() {
    position.x = clamp(
      position.x,
      0,
      Math.max(0, scene.clientWidth - phone.offsetWidth),
    );
    position.y = clamp(
      position.y,
      0,
      Math.max(0, scene.clientHeight - phone.offsetHeight),
    );
    phone.style.left = position.x + "px";
    phone.style.top = position.y + "px";
    const art = document.querySelector("#back-image").getBoundingClientRect();
    const windowRect = viewfinder.getBoundingClientRect();
    preview.style.width = art.width + "px";
    preview.style.height = art.height + "px";
    preview.style.left = art.left - windowRect.left + "px";
    preview.style.top = art.top - windowRect.top + "px";
    const ready = aligned();
    phone.dataset.aligned = String(ready);
    if (!captured)
      status.textContent = ready
        ? "준비됐어요 · 촬영해 주세요"
        : "QR을 네모 안에 맞춰 주세요";
  }
  function follow() {
    if (!state.camera) return;
    render();
    frame = requestAnimationFrame(follow);
  }
  function open() {
    if (state.phase !== "reading" || state.side !== "back" || state.camera)
      return;
    reader.clearGesture();
    previousView = { scale: state.scale, panX: state.panX, panY: state.panY };
    reader.setScale(1);
    state.camera = true;
    scene.dataset.camera = "true";
    tools.inert = true;
    document.querySelector("#card").tabIndex = -1;
    layer.hidden = false;
    captured = false;
    shutter.disabled = false;
    position = {
      x: Math.max(0, (scene.clientWidth - phone.offsetWidth) / 2),
      y: 30,
    };
    guide(
      "휴대전화를 끌어 QR에 맞춰 주세요",
      "카드는 원래 크기로 맞췄어요. 조준한 뒤 동그란 촬영 버튼을 눌러 주세요.",
      "aim",
      "04",
    );
    follow();
    phone.focus({ preventScroll: true });
  }
  function close({ restore = true, focus = true } = {}) {
    clearTimeout(navigationTimer);
    navigationTimer = null;
    cancelAnimationFrame(frame);
    if (drag && phone.hasPointerCapture(drag.id))
      phone.releasePointerCapture(drag.id);
    drag = null;
    state.camera = false;
    captured = false;
    layer.hidden = true;
    phone.classList.remove("captured", "dragging");
    scene.removeAttribute("data-camera");
    tools.inert = false;
    document.querySelector("#card").tabIndex =
      state.phase === "reading" ? 0 : -1;
    if (restore && previousView) Object.assign(state, previousView);
    previousView = null;
    reader.refresh();
    updateGuide();
    if (focus) openButton.focus({ preventScroll: true });
  }
  openButton.addEventListener("click", open);
  layer.querySelector("#camera-close").addEventListener("click", () => close());
  phone.addEventListener("pointerdown", (event) => {
    if (captured || event.button !== 0 || event.target.closest("button"))
      return;
    phone.setPointerCapture(event.pointerId);
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: { ...position },
    };
    phone.classList.add("dragging");
  });
  phone.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    position = {
      x: drag.start.x + event.clientX - drag.x,
      y: drag.start.y + event.clientY - drag.y,
    };
    render();
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    phone.addEventListener(name, (event) => {
      if (drag?.id === event.pointerId) {
        drag = null;
        phone.classList.remove("dragging");
      }
    });
  phone.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (
      captured ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    const step = event.shiftKey ? 2 : 12;
    position.x +=
      event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    position.y +=
      event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    render();
  });
  shutter.addEventListener("click", () => {
    if (captured || !state.camera) return;
    if (!aligned()) {
      guide(
        "QR에 조금 더 가까이 맞춰 주세요",
        "휴대전화의 네모 가운데에 QR을 넣고 다시 찍어 주세요.",
        "aim",
        "04",
      );
      return;
    }
    captured = true;
    shutter.disabled = true;
    phone.classList.add("captured");
    status.textContent = "담았어요! 청첩장을 열고 있어요";
    guide("초대를 담았어요", "모바일 청첩장으로 이어집니다.", "read", "04");
    navigationTimer = setTimeout(
      () => window.location.assign(MOBILE_INVITATION_URL),
      650,
    );
  });
  return { close };
}
