export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const extractionComplete = (pull, height) =>
  pull >= clamp(height * 0.08, 24, 40);
export function constrainPan(x, y, scale, width, height) {
  if (scale <= 1) return { x: 0, y: 0 };
  const maxX = (width * (scale - 1)) / 2;
  const maxY = (height * (scale - 1)) / 2;
  return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
}
export function cameraAligned(aim, target) {
  return (
    aim.x >= target.left &&
    aim.x <= target.right &&
    aim.y >= target.top &&
    aim.y <= target.bottom
  );
}
