const photos = Array.from({ length: 7 }, (_, index) => ({
  src: `${import.meta.env.BASE_URL}bears/bear-${index + 1}.png`,
  alt: `곰 사진 ${index + 1}`,
}));

export function createGallery({ screen, onChange }) {
  const panel = document.createElement("section");
  panel.className = "gallery-panel";
  panel.setAttribute("aria-label", "곰 사진첩");
  panel.hidden = true;
  panel.innerHTML = `
    <header class="gallery-heading"><button type="button" class="gallery-back" aria-label="QR 촬영으로 돌아가기">‹</button><div><strong>사진</strong><span>곰 사진 · 7장</span></div></header>
    <div class="gallery-grid">${photos.map((photo, index) => `<button type="button" aria-label="${photo.alt} 보기" data-photo="${index}"><img src="${photo.src}" alt="${photo.alt}" draggable="false"></button>`).join("")}</div>
    <div class="photo-viewer" hidden>
      <img class="gallery-photo" alt="" draggable="false">
      <p class="photo-error" hidden>사진을 불러오지 못했어요.</p>
      <div class="photo-controls"><button type="button" class="photo-previous" aria-label="이전 사진">‹</button><span class="photo-count" role="status"></span><button type="button" class="photo-next" aria-label="다음 사진">›</button></div>
    </div>`;
  screen.append(panel);
  const backButton = panel.querySelector(".gallery-back");
  const grid = panel.querySelector(".gallery-grid");
  const viewer = panel.querySelector(".photo-viewer");
  const image = panel.querySelector(".gallery-photo");
  const error = panel.querySelector(".photo-error");
  const previous = panel.querySelector(".photo-previous");
  const next = panel.querySelector(".photo-next");
  let mode = null;
  let selected = 0;

  function render() {
    panel.hidden = !mode;
    grid.hidden = mode !== "gallery";
    viewer.hidden = mode !== "photo";
    backButton.setAttribute(
      "aria-label",
      mode === "photo" ? "사진첩으로 돌아가기" : "QR 촬영으로 돌아가기",
    );
    if (mode === "photo") {
      error.hidden = true;
      image.src = photos[selected].src;
      image.alt = photos[selected].alt;
      panel.querySelector(".photo-count").textContent =
        `${selected + 1} / ${photos.length}`;
      previous.disabled = selected === 0;
      next.disabled = selected === photos.length - 1;
    }
    onChange(mode);
  }
  function open() {
    mode = "gallery";
    render();
    backButton.focus({ preventScroll: true });
  }
  function back() {
    if (!mode) return false;
    mode = mode === "photo" ? "gallery" : null;
    render();
    if (mode)
      grid
        .querySelector(`[data-photo="${selected}"]`)
        .focus({ preventScroll: true });
    return true;
  }
  function move(delta) {
    selected = Math.max(0, Math.min(photos.length - 1, selected + delta));
    render();
  }
  grid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-photo]");
    if (!button) return;
    selected = Number(button.dataset.photo);
    mode = "photo";
    render();
    backButton.focus({ preventScroll: true });
  });
  backButton.addEventListener("click", back);
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  image.addEventListener("error", () => {
    error.hidden = false;
  });
  return {
    open,
    back,
    isOpen: () => Boolean(mode),
    reset() {
      mode = null;
      selected = 0;
      render();
    },
    handleKey(event) {
      if (mode !== "photo" || !["ArrowLeft", "ArrowRight"].includes(event.key))
        return false;
      event.preventDefault();
      move(event.key === "ArrowLeft" ? -1 : 1);
      return true;
    },
  };
}
