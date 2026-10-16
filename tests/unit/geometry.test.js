import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  clamp,
  distance,
  extractionComplete,
  constrainPan,
  cameraAligned,
} from "../../src/geometry.js";
import { ARTWORK, QR_REGION, MOBILE_INVITATION_URL } from "../../src/config.js";

test("clamp keeps values inside inclusive bounds", () => {
  assert.equal(clamp(0.5, 1, 4), 1);
  assert.equal(clamp(1, 1, 4), 1);
  assert.equal(clamp(2.5, 1, 4), 2.5);
  assert.equal(clamp(4, 1, 4), 4);
  assert.equal(clamp(9, 1, 4), 4);
  assert.equal(clamp(-0.0001, 0, 10), 0);
});

test("distance is Euclidean and symmetric", () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(distance({ x: 3, y: 4 }, { x: 0, y: 0 }), 5);
  assert.equal(distance({ x: 7, y: 7 }, { x: 7, y: 7 }), 0);
});

test("a gentle pull extracts the card, with a 24–40px threshold", () => {
  for (const [height, threshold] of [
    [250, 24],
    [400, 32],
    [540, 40],
  ]) {
    assert.equal(extractionComplete(0, height), false);
    assert.equal(
      extractionComplete(8, height),
      false,
      "accidental motion must not extract",
    );
    assert.equal(extractionComplete(threshold - 0.001, height), false);
    assert.equal(extractionComplete(threshold, height), true);
    assert.equal(
      extractionComplete(40, height),
      true,
      "never requires more than 40px",
    );
  }
});

test("constrainPan forbids any pan at scale 1", () => {
  assert.deepEqual(constrainPan(120, -80, 1, 300, 442), { x: 0, y: 0 });
});

test("constrainPan allows half the overflow on each axis and clamps beyond", () => {
  const width = 300;
  const height = 440;
  const scale = 2;
  // At 2x the card overflows by one card size; half on each side.
  assert.deepEqual(constrainPan(150, 220, scale, width, height), {
    x: 150,
    y: 220,
  });
  assert.deepEqual(constrainPan(-150, -220, scale, width, height), {
    x: -150,
    y: -220,
  });
  assert.deepEqual(constrainPan(151, 221, scale, width, height), {
    x: 150,
    y: 220,
  });
  assert.deepEqual(constrainPan(-1e6, 1e6, scale, width, height), {
    x: -150,
    y: 220,
  });
  assert.deepEqual(constrainPan(10, -20, scale, width, height), {
    x: 10,
    y: -20,
  });
  // Maximum supported zoom.
  assert.deepEqual(constrainPan(1e6, 1e6, 4, width, height), {
    x: 450,
    y: 660,
  });
});

test("cameraAligned is inclusive on every edge and rejects just outside", () => {
  const target = { left: 100, right: 150, top: 200, bottom: 250 };
  for (const aim of [
    { x: 100, y: 200 },
    { x: 150, y: 200 },
    { x: 100, y: 250 },
    { x: 150, y: 250 },
    { x: 125, y: 225 },
  ])
    assert.equal(cameraAligned(aim, target), true, JSON.stringify(aim));
  for (const aim of [
    { x: 99.9, y: 225 },
    { x: 150.1, y: 225 },
    { x: 125, y: 199.9 },
    { x: 125, y: 250.1 },
    { x: 0, y: 0 },
  ])
    assert.equal(cameraAligned(aim, target), false, JSON.stringify(aim));
});

test("QR region is a square inside the artwork", () => {
  for (const key of ["x", "y", "width", "height"]) {
    assert.ok(QR_REGION[key] > 0 && QR_REGION[key] < 1, key);
  }
  assert.ok(QR_REGION.x + QR_REGION.width <= 1);
  assert.ok(QR_REGION.y + QR_REGION.height <= 1);
  const pxWidth = QR_REGION.width * ARTWORK.width;
  const pxHeight = QR_REGION.height * ARTWORK.height;
  assert.ok(
    Math.abs(pxWidth - pxHeight) < 1e-9,
    "QR region must be square in artwork pixels",
  );
  // The QR sits in the lower part of the back of the card.
  assert.ok(QR_REGION.y > 0.5);
});

test("mobile invitation destination is the exact production URL", () => {
  assert.equal(
    MOBILE_INVITATION_URL,
    "https://wonsik-ha.github.io/wedding-invitation/",
  );
});

async function webpSize(path) {
  const buffer = await readFile(path);
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8 ") {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  throw new Error(`Unknown WebP chunk ${chunk}`);
}

test("ARTWORK size matches both supplied card images (QR mapping depends on it)", async () => {
  for (const name of ["front.webp", "back.webp"]) {
    const size = await webpSize(
      new URL(`../../public/${name}`, import.meta.url),
    );
    assert.deepEqual(
      size,
      { width: ARTWORK.width, height: ARTWORK.height },
      name,
    );
  }
});
