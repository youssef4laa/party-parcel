import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';

/**
 * The rest of the built-in catalog (furniture, plants, lights, party decor): every
 * item beyond the first batch of catalog items. Same conventions as decor.ts — procedural, blocky,
 * `unit = 4` world px per art pixel, one self-contained draw function per item, registered by
 * catalog key in manifest.ts. Original art only.
 */

const unit = 4;

// ------------------------------------------------------------------ furniture

export function drawDresser() {
  const g = createPixelCanvas(24, 22, unit);
  g.px(1, 20, 3, 2, '#5e3620'); // feet
  g.px(20, 20, 3, 2, '#5e3620');
  g.px(0, 2, 24, 18, '#a86b3c'); // body
  g.px(0, 0, 24, 3, '#c98a4b'); // top
  for (let row = 0; row < 3; row++) {
    const y = 4 + row * 5.3;
    g.px(2, y, 20, 4.4, '#b97a45');
    g.pborder(2, y, 20, 4.4, '#7a4a30');
    g.px(10.5, y + 1.6, 3, 1.2, '#ffd166'); // knob
  }
  g.pborder(0, 0, 24, 20, p.outline);
  return g.canvas;
}

export function drawBench() {
  const g = createPixelCanvas(28, 13, unit);
  g.px(2, 4, 3, 9, '#5e3620'); // legs
  g.px(23, 4, 3, 9, '#5e3620');
  g.px(0, 0, 28, 4.5, '#c98a4b'); // seat
  for (let x = 4; x < 28; x += 6) g.px(x, 0, 0.8, 4.5, '#a86b3c'); // plank gaps
  g.px(4, 8, 20, 1.5, '#7a4a30'); // stretcher
  g.pborder(0, 0, 28, 4.5, p.outline);
  return g.canvas;
}

export function drawCushions() {
  const g = createPixelCanvas(18, 9, unit);
  g.pcircle(5, 5, 4.2, p.hotPink);
  g.pcircle(5, 5, 2.4, p.gingham);
  g.pcircle(13, 5, 4.2, p.bannerB);
  g.px(9, 3, 4, 1.5, '#ffe28a');
  g.px(11, 6, 3, 1.5, '#ffe28a');
  g.px(2, 8, 14, 1, p.outline);
  return g.canvas;
}

export function drawRugRound() {
  const gridW = 44;
  const gridH = 12;
  const g = createPixelCanvas(gridW, gridH, unit);
  const ring = (rx: number, ry: number, color: string) => {
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const dx = (x + 0.5 - gridW / 2) / rx;
        const dy = (y + 0.5 - gridH / 2) / ry;
        if (dx * dx + dy * dy <= 1) g.px(x, y, 1, 1, color);
      }
    }
  };
  ring(22, 6, p.rugCream);
  ring(20, 5.2, '#e07fa4');
  ring(15, 4, p.rugCream);
  ring(11, 2.8, p.hotPink);
  ring(5, 1.4, p.rugCream);
  return g.canvas;
}

export function drawRugStripes() {
  const gridW = 60;
  const gridH = 18;
  const g = createPixelCanvas(gridW, gridH, unit);
  const colors = [p.rugBlue, p.rugCream, '#e07fa4', p.rugCream];
  for (let x = 0; x < gridW; x += 4) g.px(x, 1, 4, gridH - 2, colors[(x / 4) % colors.length]);
  for (let x = 0; x < gridW; x += 2) {
    g.px(x, 0, 1, 1, p.rugCream); // fringe
    g.px(x, gridH - 1, 1, 1, p.rugCream);
  }
  g.pborder(0, 1, gridW, gridH - 2, '#2b2b52');
  return g.canvas;
}

export function drawRugChecker() {
  const gridW = 72;
  const gridH = 22;
  const g = createPixelCanvas(gridW, gridH, unit);
  const cell = 5.5;
  for (let cy = 0; cy * cell < gridH; cy++) {
    for (let cx = 0; cx * cell < gridW; cx++) {
      g.px(cx * cell, cy * cell, cell, cell, (cx + cy) % 2 === 0 ? '#9be08d' : '#f4f7d9');
    }
  }
  g.pborder(0, 0, gridW, gridH, '#5a9e4a');
  g.pborder(1, 1, gridW - 2, gridH - 2, '#5a9e4a');
  return g.canvas;
}

export function drawRugRunner() {
  const gridW = 100;
  const gridH = 9;
  const g = createPixelCanvas(gridW, gridH, unit);
  g.px(0, 0, gridW, gridH, '#7a4a30');
  g.px(1, 1, gridW - 2, gridH - 2, '#c9772f');
  for (let x = 4; x < gridW - 4; x += 8) {
    g.px(x, 3, 4, 3, p.rugCream); // diamond motif
    g.px(x + 1, 2, 2, 5, p.rugCream);
    g.px(x + 1.5, 4, 1, 1, '#7a4a30');
  }
  return g.canvas;
}

// ------------------------------------------------------------------ plants

export function drawPalm() {
  const g = createPixelCanvas(26, 46, unit);
  // trunk with ring segments, leaning a touch
  for (let i = 0; i < 12; i++) {
    const lean = i * 0.12;
    g.px(11 + lean, 44 - i * 2.6, 3.4, 2.6, i % 2 === 0 ? '#8a6a3a' : '#a07d47');
  }
  g.px(9, 44, 8, 2, '#6b4a2a'); // base
  // fronds: a fan of blocky leaves
  const cx = 13;
  const cy = 12;
  const fronds: Array<[number, number, string]> = [
    [-11, 3, p.leafGreen], [11, 3, p.leafGreen], [-8, -3, '#6bb85a'], [8, -3, '#6bb85a'],
    [-4, -7, '#7ec96a'], [4, -7, '#7ec96a'], [0, -9, '#7ec96a'],
  ];
  for (const [dx, dy, color] of fronds) {
    const steps = 8;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = cx + dx * t;
      const y = cy + dy * t + (dx !== 0 ? Math.abs(dx) * 0.07 * s * t * 4 : 0);
      g.px(x - 1, y - 0.6, 2.4, 1.6 - t * 0.6, color);
    }
  }
  g.pcircle(cx + 1, cy + 1, 1.6, '#5e3620'); // coconuts
  g.pcircle(cx - 1, cy + 2, 1.3, '#5e3620');
  return g.canvas;
}

export function drawFlowerPots() {
  const g = createPixelCanvas(22, 14, unit);
  const pot = (x: number, w: number, h: number, flower: string) => {
    g.px(x, 14 - h, w, h, '#b8672a');
    g.px(x - 0.5, 14 - h, w + 1, 1.5, '#8a4a1e');
    g.px(x + w / 2 - 0.4, 14 - h - 3, 0.8, 3, p.leafGreen); // stem
    g.pcircle(x + w / 2, 14 - h - 3.5, 1.6, flower);
    g.px(x + w / 2 - 0.4, 14 - h - 4, 0.8, 0.8, p.daisyCenter);
  };
  pot(1, 6, 5, p.hotPink);
  pot(8, 6, 7, p.bannerB);
  pot(15, 6, 4.5, p.bannerC);
  return g.canvas;
}

export function drawHangingPlant() {
  const g = createPixelCanvas(14, 30, unit);
  g.px(6.6, 0, 0.8, 10, p.frameWood); // rope
  g.px(3, 10, 8, 6, '#b8672a'); // pot
  g.px(2.5, 10, 9, 1.4, '#8a4a1e');
  g.pborder(3, 10, 8, 6, p.outline);
  // trailing leaves
  const vines = [3.5, 6, 8.5, 10.5];
  vines.forEach((x, i) => {
    const len = 8 + (i % 2) * 5;
    for (let y = 0; y < len; y++) {
      const sway = Math.sin(y * 0.7 + i) * 0.7;
      g.px(x + sway, 16 + y, 1, 1, y % 3 === 0 ? '#7ec96a' : p.leafGreen);
      if (y % 3 === 1) g.px(x + sway + (i % 2 ? 1 : -1), 16 + y, 1, 1, '#6bb85a');
    }
  });
  g.pcircle(5, 11, 2.2, '#6bb85a');
  g.pcircle(9, 11, 2.2, '#7ec96a');
  return g.canvas;
}

// ------------------------------------------------------------------ lights

export function drawCandles() {
  const g = createPixelCanvas(16, 16, unit);
  const candle = (x: number, h: number, color: string) => {
    g.px(x, 15 - h, 3, h, color);
    g.px(x, 15 - h, 3, 1, '#ffffff');
    g.px(x + 1.2, 15 - h - 2, 0.6, 1.5, '#5e3620'); // wick
    g.pcircle(x + 1.5, 15 - h - 3.4, 1.3, p.flame);
    g.pcircle(x + 1.5, 15 - h - 3.2, 0.6, p.flameCore);
  };
  candle(1.5, 7, p.hotPink);
  candle(6.5, 10, p.cream);
  candle(11.5, 5, p.bannerC);
  g.px(0, 15, 16, 1, '#7a7a82'); // dish
  return g.canvas;
}

export function drawSpotlight() {
  const g = createPixelCanvas(14, 32, unit);
  g.px(5.5, 0, 3, 5, '#5a5a62'); // ceiling clamp
  g.px(6.6, 4, 0.8, 3, '#7a7a82');
  g.px(3, 6, 8, 6, '#2b2b32'); // lamp head
  g.px(4, 6, 6, 1, '#7a7a82');
  g.px(3.5, 11.4, 7, 1.6, '#fff2b0'); // lens
  // the beam: a soft translucent cone
  g.ctx.fillStyle = 'rgba(255, 244, 176, 0.20)';
  g.ctx.beginPath();
  g.ctx.moveTo(4 * unit, 13 * unit);
  g.ctx.lineTo(10 * unit, 13 * unit);
  g.ctx.lineTo(14 * unit, 32 * unit);
  g.ctx.lineTo(0, 32 * unit);
  g.ctx.closePath();
  g.ctx.fill();
  g.pborder(3, 6, 8, 6, p.outline);
  return g.canvas;
}

// ------------------------------------------------------------------ party decor

export function drawConfetti() {
  const g = createPixelCanvas(34, 9, unit);
  const colors = [p.hotPink, p.bannerB, p.bannerC, p.bannerD, p.balloonPurple, '#ff8c42'];
  // a deterministic scatter (no randomness, so it looks the same in the room, the editor and the export)
  for (let i = 0; i < 46; i++) {
    const x = (i * 7.3) % 33;
    const y = (i * 3.7 + Math.sin(i) * 2) % 8.5;
    g.px(x, y, i % 3 === 0 ? 1 : 1.6, i % 3 === 1 ? 1 : 1.6, colors[i % colors.length]);
  }
  return g.canvas;
}

function posterFrame(g: ReturnType<typeof createPixelCanvas>, w: number, h: number, paper: string) {
  g.px(0, 0, w, h, paper);
  g.pborder(0, 0, w, h, '#7a4a30');
  g.px(w / 2 - 0.7, 0, 1.4, 1.6, '#c9c2c2'); // tape
}

export function drawPoster() {
  const g = createPixelCanvas(16, 22, unit);
  posterFrame(g, 16, 22, '#fff0f6');
  // a big star and a row of party letters as blocks
  g.pcircle(8, 8, 4, p.bannerB);
  g.pcircle(8, 8, 2.4, '#fff3b0');
  g.px(7, 2.5, 2, 11, p.bannerB);
  g.px(2.5, 7, 11, 2, p.bannerB);
  const colors = [p.hotPink, p.bannerC, p.bannerD, p.balloonPurple];
  for (let i = 0; i < 4; i++) g.px(2.5 + i * 3.1, 16, 2.4, 3.4, colors[i]);
  return g.canvas;
}

export function drawPosterCake() {
  const g = createPixelCanvas(16, 22, unit);
  posterFrame(g, 16, 22, '#e8f6ff');
  g.px(3, 12, 10, 6, '#ffb6d1'); // cake
  g.px(3, 12, 10, 1.6, '#ffffff');
  g.px(3, 16.5, 10, 1.5, '#c98a4b');
  for (const x of [5, 8, 11]) {
    g.px(x, 8.5, 1, 3.5, p.cream);
    g.pcircle(x + 0.5, 7.5, 1, p.flame);
  }
  g.px(3, 3, 10, 2, p.hotPink); // headline bar
  g.px(5, 3.6, 6, 0.8, '#ffffff');
  return g.canvas;
}

export function drawPhotoString() {
  const gridW = 44;
  const g = createPixelCanvas(gridW, 20, unit);
  const sag = (x: number) => 1.2 + 3.2 * Math.sin((Math.PI * x) / gridW);
  for (let x = 0; x < gridW; x++) g.px(x, sag(x), 1, 0.8, p.frameWood);
  const scenes = ['#9ad4ff', '#ffd9a0', '#c8f0b0', '#f4b6d2'];
  [6, 15, 24, 33].forEach((x, i) => {
    const y = sag(x + 3) + 0.6;
    g.px(x + 2.6, y - 0.4, 1, 2.2, '#c9a35e'); // clothespin
    g.px(x, y + 1.6, 7, 9, '#ffffff'); // polaroid card
    g.px(x + 0.8, y + 2.4, 5.4, 5.4, scenes[i]);
    g.pcircle(x + 3.5, y + 5, 1.2, i % 2 ? p.hotPink : p.bannerB);
    g.pborder(x, y + 1.6, 7, 9, '#b0a8a8');
  });
  return g.canvas;
}
