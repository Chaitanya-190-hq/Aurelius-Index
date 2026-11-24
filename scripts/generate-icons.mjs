#!/usr/bin/env node
/* ============================================================
   scripts/generate-icons.mjs
   ------------------------------------------------------------
   Renders every shipped icon with a tiny software rasteriser and
   writes PNG files. No dependencies, no canvas package, no
   external artwork — the shapes below are original.

   Run:  node scripts/generate-icons.mjs
   Output:
     assets/icons/icon-192.png
     assets/icons/icon-512.png
     assets/icons/icon-maskable-512.png
     assets/icons/apple-touch-icon-180.png
     assets/presets/<name>-192.png / -512.png
   ============================================================ */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DESIGN = 512;          // artwork is authored in a 512×512 space
const SCALE = 3;             // render 3× then downsample for anti-aliasing
const RENDER = DESIGN * SCALE;

/* ── PNG encoding ────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ── Colour helpers ──────────────────────────────────────── */

function hex(value) {
  const clean = value.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
    1,
  ];
}

function rgba(color, alpha) {
  return [color[0], color[1], color[2], alpha];
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    (a[3] ?? 1) + ((b[3] ?? 1) - (a[3] ?? 1)) * t,
  ];
}

function sampleStops(stops, t) {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (clamped >= a.at && clamped <= b.at) {
      const local = b.at === a.at ? 0 : (clamped - a.at) / (b.at - a.at);
      return mix(a.color, b.color, local);
    }
  }
  return stops[stops.length - 1].color;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Software canvas (straight alpha, float channels) ─────── */

class Canvas {
  constructor() {
    this.size = RENDER;
    this.data = new Float32Array(RENDER * RENDER * 4);
  }

  /** Alpha-blend one device pixel. */
  put(x, y, color) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const alpha = color[3] ?? 1;
    if (alpha <= 0) return;
    const i = (y * this.size + x) * 4;
    const d = this.data;
    const da = d[i + 3];
    const outA = alpha + da * (1 - alpha);
    if (outA <= 0) {
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
      return;
    }
    d[i] = (color[0] * alpha + d[i] * da * (1 - alpha)) / outA;
    d[i + 1] = (color[1] * alpha + d[i + 1] * da * (1 - alpha)) / outA;
    d[i + 2] = (color[2] * alpha + d[i + 2] * da * (1 - alpha)) / outA;
    d[i + 3] = outA;
  }

  /** Iterate device pixels in a design-space rectangle. */
  forPixels(x, y, w, h, paint) {
    const x0 = Math.max(0, Math.floor(x * SCALE));
    const y0 = Math.max(0, Math.floor(y * SCALE));
    const x1 = Math.min(this.size, Math.ceil((x + w) * SCALE));
    const y1 = Math.min(this.size, Math.ceil((y + h) * SCALE));
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) {
        const color = paint((px + 0.5) / SCALE, (py + 0.5) / SCALE);
        if (color) this.put(px, py, color);
      }
    }
  }

  fill(color) {
    this.forPixels(0, 0, DESIGN, DESIGN, () => color);
  }

  /**
   * Fill using a linear gradient. Pixels outside the gradient's 0..1 range are
   * left untouched, so a gradient can cover part of the canvas only.
   * Pass `clampEnds` for a full-canvas wash.
   */
  linear(x0, y0, x1, y1, stops, { clampEnds = false } = {}) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const lenSq = dx * dx + dy * dy || 1;
    this.forPixels(0, 0, DESIGN, DESIGN, (x, y) => {
      const t = ((x - x0) * dx + (y - y0) * dy) / lenSq;
      if (!clampEnds && (t < 0 || t > 1)) return null;
      return sampleStops(stops, t);
    });
  }

  radial(cx, cy, radius, stops) {
    this.forPixels(0, 0, DESIGN, DESIGN, (x, y) => {
      const t = Math.hypot(x - cx, y - cy) / radius;
      if (t > 1) return null;
      return sampleStops(stops, t);
    });
  }

  rect(x, y, w, h, color) {
    this.forPixels(x, y, w, h, () => color);
  }

  rr(x, y, w, h, radius, color) {
    this.forPixels(x, y, w, h, (px, py) => {
      const rx = Math.min(radius, w / 2);
      const ry = Math.min(radius, h / 2);
      const dx = Math.max(x + rx - px, 0, px - (x + w - rx));
      const dy = Math.max(y + ry - py, 0, py - (y + h - ry));
      if (dx * dx + dy * dy <= rx * ry && dx > 0 && dy > 0) {
        const dist = Math.hypot(dx, dy);
        if (dist > rx) return null;
      }
      return color;
    });
  }

  circle(cx, cy, radius, color) {
    this.forPixels(cx - radius, cy - radius, radius * 2, radius * 2, (x, y) => {
      return Math.hypot(x - cx, y - cy) <= radius ? color : null;
    });
  }

  ring(cx, cy, radius, thickness, color) {
    this.forPixels(cx - radius - thickness, cy - radius - thickness, (radius + thickness) * 2, (radius + thickness) * 2, (x, y) => {
      const d = Math.hypot(x - cx, y - cy);
      return d <= radius + thickness / 2 && d >= radius - thickness / 2 ? color : null;
    });
  }

  /** Scanline polygon fill (even-odd). */
  poly(points, color) {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    this.forPixels(minX, minY, maxX - minX, maxY - minY, (x, y) => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if (yi > y !== yj > y) {
          const crossX = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
          if (x < crossX) inside = !inside;
        }
      }
      return inside ? color : null;
    });
  }

  /** A tapered, drooping leaf — used for the palm silhouettes. */
  frond(x, y, angle, length, width, droop, color) {
    const left = [];
    const right = [];
    const steps = 22;
    const nx = Math.cos(angle + Math.PI / 2);
    const ny = Math.sin(angle + Math.PI / 2);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const px = x + Math.cos(angle) * length * t;
      const py = y + Math.sin(angle) * length * t + droop * t * t;
      const w = Math.max(0.8, width * (1 - t) ** 0.75);
      left.push([px + nx * w, py + ny * w]);
      right.push([px - nx * w, py - ny * w]);
    }
    this.poly([...left, ...right.reverse()], color);
  }

  /** Downsample to a square PNG buffer. */
  toPNG(size) {
    const out = Buffer.alloc(size * size * 4);
    const factor = RENDER / size;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let count = 0;
        const sx0 = Math.floor(x * factor);
        const sy0 = Math.floor(y * factor);
        const sx1 = Math.min(RENDER, Math.ceil((x + 1) * factor));
        const sy1 = Math.min(RENDER, Math.ceil((y + 1) * factor));
        for (let sy = sy0; sy < sy1; sy += 1) {
          for (let sx = sx0; sx < sx1; sx += 1) {
            const i = (sy * RENDER + sx) * 4;
            const alpha = this.data[i + 3];
            r += this.data[i] * alpha;
            g += this.data[i + 1] * alpha;
            b += this.data[i + 2] * alpha;
            a += alpha;
            count += 1;
          }
        }
        const index = (y * size + x) * 4;
        if (a > 0) {
          out[index] = Math.round(Math.min(1, r / a) * 255);
          out[index + 1] = Math.round(Math.min(1, g / a) * 255);
          out[index + 2] = Math.round(Math.min(1, b / a) * 255);
        }
        out[index + 3] = Math.round(Math.min(1, a / count) * 255);
      }
    }
    return encodePNG(size, size, out);
  }
}

/* ── Shared palettes ─────────────────────────────────────── */

const INK = hex("#23211d");
const IVORY = hex("#f7f4ec");
const OLIVE = hex("#66754c");
const OLIVE_DEEP = hex("#3f4a2e");

/* ── Artwork: original unsocial mark ─────────────────────── */

function unsocial({ padding = 0 } = {}) {
  const c = new Canvas();
  const k = 1 - padding * 2;

  c.linear(0, 0, 0, DESIGN, [
    { at: 0, color: hex("#fbf8ef") },
    { at: 0.55, color: hex("#f5f1e5") },
    { at: 1, color: hex("#eee8d8") },
  ]);

  const cx = DESIGN / 2;
  const cy = DESIGN / 2;
  const ring = 150 * k;
  const stroke = Math.max(4, 5 * k);

  // A soft inner light behind the mark so it still reads at 48px.
  c.radial(cx - 40, cy - 60, 210 * k, [
    { at: 0, color: rgba(IVORY, 0.6) },
    { at: 1, color: rgba(IVORY, 0) },
  ]);

  c.ring(cx, cy, ring, stroke, rgba(INK, 0.9));
  c.circle(cx - ring * 0.32, cy - ring * 0.18, 36 * k, INK);
  c.circle(cx + ring * 0.62, cy - ring * 0.62, 16 * k, OLIVE);
  c.rect(cx + ring * 0.14, cy + ring * 0.52, 84 * k, stroke * 0.8, rgba(INK, 0.55));

  return c;
}

/* ── Artwork: neon sunset ────────────────────────────────── */

function neonSunset() {
  const c = new Canvas();
  const sky = [
    { at: 0, color: hex("#1b0a35") },
    { at: 0.34, color: hex("#5b1a67") },
    { at: 0.6, color: hex("#c22d72") },
    { at: 0.72, color: hex("#f4634f") },
    { at: 0.8, color: hex("#ffab5c") },
    { at: 1, color: hex("#ffd9a0") },
  ];
  c.forPixels(0, 0, DESIGN, 330, (x, y) => sampleStops(sky, y / 330));

  // Stars
  const rand = mulberry32(7);
  for (let i = 0; i < 60; i += 1) {
    const x = rand() * DESIGN;
    const y = rand() * 160;
    c.circle(x, y, 0.9 + rand() * 1.1, rgba(hex("#ffe9c9"), 0.25 + rand() * 0.5));
  }

  // Sun
  const sunR = 132;
  const sunStops = [
    { at: 0, color: hex("#ffe9a8") },
    { at: 0.5, color: hex("#ffb968") },
    { at: 1, color: hex("#ff6a5e") },
  ];
  c.forPixels(256 - sunR, 300 - sunR, sunR * 2, sunR * 2, (x, y) => {
    const d = Math.hypot(x - 256, y - 300);
    if (d > sunR) return null;
    return sampleStops(sunStops, d / sunR);
  });

  // Cut-outs through the lower half of the sun
  for (let i = 0; i < 6; i += 1) {
    const y = 306 + i * 15;
    const h = 4 + i * 1.6;
    const skyColor = sampleStops(sky, Math.min(1, y / 330));
    c.forPixels(0, y, DESIGN, h, (x) => {
      const d = Math.hypot(x - 256, y + h / 2 - 300);
      return d <= sunR ? skyColor : null;
    });
  }

  // Horizon + water
  c.linear(0, 330, 0, DESIGN, [
    { at: 0, color: hex("#3d1150") },
    { at: 0.4, color: hex("#250b34") },
    { at: 1, color: hex("#14061e") },
  ]);
  c.rect(0, 328, DESIGN, 3, rgba(hex("#ff9d7a"), 0.75));

  for (let i = 0; i < 16; i += 1) {
    const y = 344 + i * 9.5;
    const w = 190 - i * 9 + (i % 3) * 14;
    c.rect(256 - w / 2, y, w, 2.4, rgba(i % 2 ? hex("#ffc98a") : hex("#f4638c"), 0.42 - i * 0.02));
  }

  // Palm silhouettes
  const palm = rgba(hex("#120418"), 0.96);
  c.poly([[404, 512], [414, 470], [427, 470], [438, 512]], palm);
  c.circle(420, 466, 9, palm);
  for (const [angle, length] of [
    [-2.6, 92],
    [-1.9, 86],
    [-1.25, 82],
    [-0.55, 88],
    [0.1, 84],
  ]) {
    c.frond(420, 466, angle, length, 15, 46, palm);
  }

  c.poly([[52, 512], [60, 482], [72, 482], [82, 512]], palm);
  for (const [angle, length] of [
    [-2.5, 54],
    [-1.7, 52],
    [-0.8, 50],
    [0.05, 48],
  ]) {
    c.frond(66, 480, angle, length, 9, 24, palm);
  }

  return c;
}

/* ── Artwork: vice city (teal & magenta, original) ────────── */

function viceCity() {
  const c = new Canvas();
  c.forPixels(0, 0, DESIGN, 340, (x, y) => {
    const t = y / 340;
    if (t < 0.55) return mix(hex("#0d2f45"), hex("#c2338f"), t / 0.55);
    return mix(hex("#c2338f"), hex("#ff8a6b"), (t - 0.55) / 0.45);
  });

  const rand = mulberry32(21);
  for (let i = 0; i < 45; i += 1) {
    c.circle(rand() * DESIGN, rand() * 150, 1 + rand(), rgba(hex("#d8f4ff"), 0.2 + rand() * 0.4));
  }

  // Sun with a strong teal halo
  c.forPixels(96, 96, 320, 320, (x, y) => {
    const d = Math.hypot(x - 256, y - 250);
    if (d > 128) return null;
    return mix(hex("#fff2b0"), hex("#ff5f9e"), d / 128);
  });
  c.ring(256, 250, 140, 6, rgba(hex("#6ef0e0"), 0.85));

  // Grid floor
  c.linear(0, 340, 0, DESIGN, [
    { at: 0, color: hex("#0c2436") },
    { at: 1, color: hex("#061019") },
  ]);
  c.rect(0, 338, DESIGN, 2, rgba(hex("#6ef0e0"), 0.8));
  for (let i = 0; i < 9; i += 1) {
    const y = 352 + i * i * 1.9;
    c.rect(0, y, DESIGN, 1.6, rgba(hex("#ff5f9e"), 0.55 - i * 0.03));
  }
  for (let i = -8; i <= 8; i += 1) {
    const xTop = 256 + i * 16;
    const xBottom = 256 + i * 62;
    c.poly(
      [
        [xTop - 0.9, 338],
        [xTop + 0.9, 338],
        [xBottom + 1.6, DESIGN],
        [xBottom - 1.6, DESIGN],
      ],
      rgba(hex("#6ef0e0"), 0.32)
    );
  }

  // Palm on the left
  const palm = rgba(hex("#05121c"), 0.95);
  c.poly([[104, 512], [116, 430], [130, 430], [143, 512]], palm);
  for (const [angle, length] of [
    [-2.7, 78],
    [-2.0, 76],
    [-1.3, 72],
    [-0.6, 74],
    [0.1, 68],
  ]) {
    c.frond(123, 428, angle, length, 13, 38, palm);
  }

  return c;
}

/* ── Artwork: racing ────────────────────────────────────── */

function racing() {
  const c = new Canvas();
  c.linear(0, 0, DESIGN, DESIGN, [
    { at: 0, color: hex("#14161c") },
    { at: 1, color: hex("#23262f") },
  ]);

  // Speed streaks
  const streaks = [
    { x: -60, y: 120, w: 340, h: 16, color: hex("#e23b3b"), a: 0.9 },
    { x: 120, y: 176, w: 420, h: 10, color: hex("#ffc247"), a: 0.75 },
    { x: -30, y: 232, w: 300, h: 7, color: hex("#f2f2ef"), a: 0.24 },
    { x: 60, y: 372, w: 400, h: 12, color: hex("#ffc247"), a: 0.5 },
    { x: -40, y: 424, w: 280, h: 6, color: hex("#e23b3b"), a: 0.42 },
  ];
  for (const s of streaks) {
    const angle = -0.32;
    const pts = [
      [s.x, s.y],
      [s.x + s.w, s.y + Math.tan(angle) * s.w],
      [s.x + s.w, s.y + Math.tan(angle) * s.w + s.h],
      [s.x, s.y + s.h],
    ];
    c.poly(pts, rgba(s.color, s.a));
  }

  // One bold chevron pointing right, with a lighter echo behind it.
  const chevron = (offset, alpha) => {
    c.poly(
      [
        [164 + offset, 132],
        [330 + offset, 256],
        [164 + offset, 380],
        [164 + offset, 308],
        [242 + offset, 256],
        [164 + offset, 204],
      ],
      rgba(hex("#f7f7f4"), alpha)
    );
  };
  chevron(34, 0.22);
  chevron(0, 0.98);

  // Checker band
  const tile = 32;
  for (let i = 0; i < 16; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      if ((i + j) % 2 === 0) {
        c.rect(i * tile, DESIGN - 64 + j * tile, tile, tile, rgba(hex("#f7f7f4"), 0.92));
      }
    }
  }

  return c;
}

/* ── Artwork: calculator ────────────────────────────────── */

function calculator() {
  const c = new Canvas();
  c.linear(0, 0, DESIGN, DESIGN, [
    { at: 0, color: hex("#2a333f") },
    { at: 1, color: hex("#1b222b") },
  ]);
  c.rr(58, 42, 396, 428, 46, hex("#323c49"));
  c.rr(58, 42, 396, 428, 46, rgba(hex("#9fb0c2"), 0.08));

  // Display
  c.rr(92, 84, 328, 96, 16, hex("#cfd8c3"));
  c.rr(92, 84, 328, 96, 16, rgba(hex("#ffffff"), 0.35));
  c.rect(112, 118, 200, 5, rgba(hex("#3f4a2e"), 0.36));
  c.rect(112, 136, 120, 5, rgba(hex("#3f4a2e"), 0.22));

  // Keys
  const columns = 4;
  const rows = 4;
  const startX = 100;
  const startY = 214;
  const stepX = 84;
  const stepY = 62;
  const radius = 22;
  for (let r = 0; r < rows; r += 1) {
    for (let col = 0; col < columns; col += 1) {
      const isOperator = col === 3;
      const isBottom = r === rows - 1;
      const base = isOperator ? hex("#e0b062") : isBottom ? hex("#8d9c6d") : hex("#e7e3d6");
      c.circle(startX + col * stepX, startY + r * stepY, radius, rgba(base, 0.94));
      c.circle(startX + col * stepX, startY + r * stepY - 6, radius * 0.62, rgba(hex("#ffffff"), 0.08));
    }
  }

  return c;
}

/* ── Artwork: notes ─────────────────────────────────────── */

function notes() {
  const c = new Canvas();
  c.fill(hex("#efe9d9"));
  c.rr(46, 34, 420, 444, 24, hex("#fdfaf2"));
  c.rect(46, 34, 420, 12, rgba(hex("#ffffff"), 0.65));
  c.rect(46, 34, 26, 444, hex("#66754c"));
  c.rect(72, 34, 2, 444, rgba(hex("#3f4a2e"), 0.12));

  // Ruled lines
  for (let i = 0; i < 7; i += 1) {
    const y = 140 + i * 44;
    c.rect(116, y, 300 - (i % 3) * 26, 4, rgba(hex("#8b8475"), i === 0 ? 0.5 : 0.22));
  }
  c.rr(116, 96, 130, 22, 11, rgba(hex("#66754c"), 0.9));
  c.rect(126, 128, 214, 3, rgba(hex("#8b8475"), 0.18));

  return c;
}

/* ── Artwork: gallery ───────────────────────────────────── */

function gallery() {
  const c = new Canvas();
  c.fill(hex("#e7e2d6"));
  c.forPixels(28, 28, 456, 456, (x, y) => {
    const t = (y - 28) / 456;
    if (t < 0.62) return mix(hex("#bcd9e2"), hex("#f7dcb4"), t / 0.62);
    return mix(hex("#f7dcb4"), hex("#f0c49a"), (t - 0.62) / 0.38);
  });
  c.circle(352, 156, 44, rgba(hex("#f6a96a"), 0.95));
  c.circle(352, 156, 66, rgba(hex("#f6a96a"), 0.18));

  // Mountains
  c.poly([[28, 372], [152, 226], [256, 342], [332, 260], [484, 412], [484, 484], [28, 484]], hex("#5b7b70"));
  c.poly([[28, 420], [128, 330], [232, 420], [332, 356], [484, 452], [484, 484], [28, 484]], hex("#2f4a45"));
  c.rect(28, 448, 456, 36, rgba(hex("#1d302c"), 0.75));

  // Frame
  c.rect(28, 28, 456, 14, rgba(hex("#fdfbf4"), 0.92));
  c.rect(28, 470, 456, 14, rgba(hex("#fdfbf4"), 0.92));
  c.rect(28, 28, 14, 456, rgba(hex("#fdfbf4"), 0.92));
  c.rect(470, 28, 14, 456, rgba(hex("#fdfbf4"), 0.92));

  return c;
}

/* ── Artwork: vault ─────────────────────────────────────── */

function vault() {
  const c = new Canvas();
  c.radial(256, 256, 380, [
    { at: 0, color: hex("#2b303a") },
    { at: 1, color: hex("#12151a") },
  ]);

  c.ring(256, 256, 186, 34, hex("#464c57"));
  c.ring(256, 256, 186, 8, rgba(hex("#aab6c4"), 0.35));
  c.ring(256, 256, 148, 16, hex("#333944"));
  c.circle(256, 256, 112, hex("#3d4550"));
  c.ring(256, 256, 112, 4, rgba(hex("#c8d4e1"), 0.28));

  // Dial spokes
  for (let i = 0; i < 6; i += 1) {
    const angle = (i * Math.PI) / 3;
    const inner = 34;
    const outer = 100;
    const width = 7;
    const nx = Math.cos(angle + Math.PI / 2);
    const ny = Math.sin(angle + Math.PI / 2);
    const ax = 256 + Math.cos(angle) * inner;
    const ay = 256 + Math.sin(angle) * inner;
    const bx = 256 + Math.cos(angle) * outer;
    const by = 256 + Math.sin(angle) * outer;
    c.poly(
      [
        [ax + nx * width, ay + ny * width],
        [bx + nx * width, by + ny * width],
        [bx - nx * width, by - ny * width],
        [ax - nx * width, ay - ny * width],
      ],
      hex("#20262e")
    );
  }

  c.circle(256, 256, 30, hex("#c3cdd9"));
  c.circle(256, 256, 13, hex("#6b7480"));
  c.circle(256, 74, 9, rgba(hex("#a3b383"), 0.95));
  c.ring(256, 256, 130, 2, rgba(hex("#e2e9f1"), 0.14));

  return c;
}

/* ── Artwork: mono ──────────────────────────────────────── */

function mono() {
  const c = new Canvas();
  c.fill(hex("#15161a"));
  c.ring(256, 256, 150, 7, rgba(hex("#f1efe7"), 0.95));
  c.circle(256, 256, 44, rgba(hex("#f1efe7"), 0.95));
  c.rect(256, 250, 118, 6, rgba(hex("#f1efe7"), 0.95));
  c.circle(374, 253, 10, rgba(hex("#f1efe7"), 0.6));
  return c;
}

/* ── Output ─────────────────────────────────────────────── */

function write(relativePath, canvas, size) {
  const path = join(ROOT, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, canvas.toPNG(size));
  console.log(`  ${relativePath}  (${size}×${size})`);
}

console.log("Generating icons…");

const original = unsocial();
write("assets/icons/icon-512.png", original, 512);
write("assets/icons/icon-192.png", original, 192);
write("assets/icons/apple-touch-icon-180.png", original, 180);
write("assets/icons/icon-maskable-512.png", unsocial({ padding: 0.1 }), 512);

const presets = {
  "gta-neon": neonSunset,
  "vice-city": viceCity,
  racing,
  calculator,
  notes,
  gallery,
  vault,
  mono,
};

for (const [name, draw] of Object.entries(presets)) {
  const canvas = draw();
  write(`assets/presets/${name}-512.png`, canvas, 512);
  write(`assets/presets/${name}-192.png`, canvas, 192);
}

console.log("Done.");
