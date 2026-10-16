import { clamp, constrainPan, distance } from "./geometry.js";

export function createReader({ card, scene, state, onChange }) {
  const pointers = new Map();
  let gesture = null;
  const enabled = () => state.phase === "reading" && !state.camera;

  function refresh() {
    const pan = constrainPan(
      state.panX,
      state.panY,
      state.scale,
      card.offsetWidth,
      card.offsetHeight,
    );
    state.panX = pan.x;
    state.panY = pan.y;
    card.style.setProperty("--scale", state.scale);
    card.style.setProperty("--pan-x", pan.x + "px");
    card.style.setProperty("--pan-y", pan.y + "px");
    scene.dataset.scale = state.scale.toFixed(2);
    scene.dataset.side = state.side;
    card.setAttribute(
      "aria-label",
      `청첩장 ${state.side === "front" ? "앞면" : "뒷면"} · ${Math.round(state.scale * 100)}%`,
    );
    document.querySelector("#zoom-reset").textContent =
      Math.round(state.scale * 100) + "%";
    document.querySelector("#zoom-in").disabled = state.scale >= 4;
    document.querySelector("#zoom-out").disabled = state.scale <= 1;
    document.querySelector("#camera-open").hidden = state.side !== "back";
    onChange();
  }

  function setScale(next, point) {
    if (!enabled()) return;
    const scale = clamp(next, 1, 4);
    if (point) {
      const rect = card.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      const ratio = scale / state.scale;
      state.panX += (point.x - center.x) * (1 - ratio);
      state.panY += (point.y - center.y) * (1 - ratio);
    }
    state.scale = scale;
    refresh();
  }

  function flip() {
    if (!enabled()) return;
    state.side = state.side === "front" ? "back" : "front";
    refresh();
  }

  function baseline(suppressed = false) {
    const points = [...pointers.values()];
    const rect = card.getBoundingClientRect();
    const mid =
      points.length > 1
        ? {
            x: (points[0].x + points[1].x) / 2,
            y: (points[0].y + points[1].y) / 2,
          }
        : points[0];
    gesture = {
      points,
      mid,
      scale: state.scale,
      panX: state.panX,
      panY: state.panY,
      center: {
        x: rect.left + rect.width / 2 - state.panX,
        y: rect.top + rect.height / 2 - state.panY,
      },
      distance: points.length > 1 ? distance(points[0], points[1]) : 0,
      suppressed: suppressed || points.length > 1,
    };
  }

  card.addEventListener("pointerdown", (event) => {
    if (!enabled() || event.button !== 0) return;
    card.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    card.classList.add("dragging");
    baseline(gesture?.suppressed);
  });
  card.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.values()];
    if (points.length > 1) {
      const mid = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      };
      state.scale = clamp(
        (gesture.scale * distance(points[0], points[1])) /
          Math.max(1, gesture.distance),
        1,
        4,
      );
      state.panX =
        mid.x -
        gesture.center.x -
        ((gesture.mid.x - gesture.center.x - gesture.panX) * state.scale) /
          gesture.scale;
      state.panY =
        mid.y -
        gesture.center.y -
        ((gesture.mid.y - gesture.center.y - gesture.panY) * state.scale) /
          gesture.scale;
    } else {
      const dx = points[0].x - gesture.mid.x;
      const dy = points[0].y - gesture.mid.y;
      if (Math.hypot(dx, dy) > 6) gesture.suppressed = true;
      if (state.scale > 1) {
        state.panX = gesture.panX + dx;
        state.panY = gesture.panY + dy;
      }
    }
    refresh();
  });
  function release(event) {
    if (!pointers.has(event.pointerId)) return;
    const tap =
      event.type === "pointerup" && !gesture.suppressed && pointers.size === 1;
    pointers.delete(event.pointerId);
    if (pointers.size) baseline(true);
    else {
      gesture = null;
      card.classList.remove("dragging");
      if (tap && state.scale === 1) flip();
    }
  }
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    card.addEventListener(name, release);
  card.addEventListener(
    "wheel",
    (event) => {
      if (!enabled()) return;
      event.preventDefault();
      setScale(state.scale * Math.exp(-event.deltaY * 0.002), {
        x: event.clientX,
        y: event.clientY,
      });
    },
    { passive: false },
  );
  card.addEventListener("keydown", (event) => {
    if (!enabled()) return;
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      flip();
    }
    if (["+", "="].includes(event.key)) {
      event.preventDefault();
      setScale(state.scale + 0.5);
    }
    if (event.key === "-") {
      event.preventDefault();
      setScale(state.scale - 0.5);
    }
    if (event.key === "0") setScale(1);
    if (
      state.scale > 1 &&
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      event.preventDefault();
      state.panX +=
        event.key === "ArrowLeft" ? 30 : event.key === "ArrowRight" ? -30 : 0;
      state.panY +=
        event.key === "ArrowUp" ? 30 : event.key === "ArrowDown" ? -30 : 0;
      refresh();
    }
  });
  document.querySelector("#flip").addEventListener("click", flip);
  document
    .querySelector("#zoom-in")
    .addEventListener("click", () => setScale(state.scale + 0.5));
  document
    .querySelector("#zoom-out")
    .addEventListener("click", () => setScale(state.scale - 0.5));
  document
    .querySelector("#zoom-reset")
    .addEventListener("click", () => setScale(1));
  function clearGesture() {
    for (const id of pointers.keys())
      if (card.hasPointerCapture(id)) card.releasePointerCapture(id);
    pointers.clear();
    gesture = null;
    card.classList.remove("dragging");
  }
  return { refresh, setScale, clearGesture };
}
