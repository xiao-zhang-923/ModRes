import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const outputDirectory = fileURLToPath(new URL('../public/icons/', import.meta.url));
const sizes = [16, 32, 48, 128];
const supersampling = 4;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([name, data]);
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(payload), data.length + 8);
  return chunk;
}

function distanceToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const amount = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
  return Math.hypot(x - (x1 + amount * dx), y - (y1 + amount * dy));
}

function roundedSquareDistance(x, y, size, radius) {
  const center = size / 2;
  const halfInner = size / 2 - radius;
  const qx = Math.abs(x - center) - halfInner;
  const qy = Math.abs(y - center) - halfInner;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function mix(start, end, amount) {
  return start + (end - start) * amount;
}

function logoDistance(x, y, size) {
  const unit = size / 32;
  const segments = [
    [8.5, 9.2, 5.1, 16],
    [5.1, 16, 8.5, 22.8],
    [23.5, 9.2, 26.9, 16],
    [26.9, 16, 23.5, 22.8],
  ];
  let distance = Number.POSITIVE_INFINITY;
  for (const [x1, y1, x2, y2] of segments) {
    distance = Math.min(
      distance,
      distanceToSegment(x, y, x1 * unit, y1 * unit, x2 * unit, y2 * unit),
    );
  }

  let previous = { x: 11.2 * unit, y: 19.2 * unit };
  for (let step = 1; step <= 24; step += 1) {
    const amount = step / 24;
    const inverse = 1 - amount;
    const current = {
      x: (inverse * inverse * 11.2 + 2 * inverse * amount * 16 + amount * amount * 20.8) * unit,
      y: (inverse * inverse * 19.2 + 2 * inverse * amount * 9.2 + amount * amount * 19.2) * unit,
    };
    distance = Math.min(
      distance,
      distanceToSegment(x, y, previous.x, previous.y, current.x, current.y),
    );
    previous = current;
  }
  return distance;
}

function samplePixel(x, y, size) {
  const edge = roundedSquareDistance(x, y, size, size * 0.245);
  if (edge > 0) return [0, 0, 0, 0];

  const diagonal = Math.max(0, Math.min(1, (x * 0.38 + y * 0.62) / size));
  const highlightDistance = Math.hypot(x - size * 0.22, y - size * 0.12) / (size * 0.75);
  const highlight = Math.max(0, 1 - highlightDistance) * 34;
  let red = mix(112, 35, diagonal) + highlight;
  let green = mix(185, 95, diagonal) + highlight;
  let blue = mix(232, 157, diagonal) + highlight * 0.45;

  if (edge > -size * 0.025) {
    red += 16;
    green += 12;
    blue += 5;
  }

  const strokeWidth = Math.max(1.5, size / 15.5);
  const pathDistance = logoDistance(x, y, size);
  if (pathDistance <= strokeWidth / 2) {
    const pathBlend = Math.min(1, (strokeWidth / 2 - pathDistance) * 2.2 + 0.72);
    red = mix(red, 246, pathBlend);
    green = mix(green, 252, pathBlend);
    blue = mix(blue, 255, pathBlend);
  }

  const unit = size / 32;
  const dotDistance = Math.hypot(x - 16 * unit, y - 10.7 * unit);
  if (dotDistance <= 1.55 * unit) {
    red = 227;
    green = 246;
    blue = 255;
  }

  return [
    Math.max(0, Math.min(255, Math.round(red))),
    Math.max(0, Math.min(255, Math.round(green))),
    Math.max(0, Math.min(255, Math.round(blue))),
    255,
  ];
}

function renderIcon(size) {
  const highSize = size * supersampling;
  const highPixels = new Uint8Array(highSize * highSize * 4);

  for (let y = 0; y < highSize; y += 1) {
    for (let x = 0; x < highSize; x += 1) {
      const color = samplePixel(
        (x + 0.5) / supersampling,
        (y + 0.5) / supersampling,
        size,
      );
      const offset = (y * highSize + x) * 4;
      highPixels.set(color, offset);
    }
  }

  const pixels = new Uint8Array(size * size * 4);
  const samplesPerPixel = supersampling * supersampling;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let sy = 0; sy < supersampling; sy += 1) {
        for (let sx = 0; sx < supersampling; sx += 1) {
          const highOffset = (
            (y * supersampling + sy) * highSize + (x * supersampling + sx)
          ) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            totals[channel] += highPixels[highOffset + channel];
          }
        }
      }
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[offset + channel] = Math.round(totals[channel] / samplesPerPixel);
      }
    }
  }
  return pixels;
}

function encodePng(size, pixels) {
  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    scanlines[rowOffset] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * size * 4, size * 4).copy(
      scanlines,
      rowOffset + 1,
    );
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND'),
  ]);
}

await mkdir(outputDirectory, { recursive: true });
for (const size of sizes) {
  const file = new URL(`../public/icons/icon-${size}.png`, import.meta.url);
  await writeFile(file, encodePng(size, renderIcon(size)));
  console.log(`Generated ${fileURLToPath(file)}`);
}
