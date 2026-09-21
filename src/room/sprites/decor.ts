import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';

/**
 * Room Editor catalog (docs/ROOM_EDITOR.md 1c) — new procedural placeholder sprites, kept simple
 * and blocky to match the existing style (see DECISIONS.md for which of the brief's full list
 * this pass implements vs defers). Each draw function is self-contained, `unit = 4` like every
 * other sprite in this project, registered by catalog key in scene/objectSprites.ts.
 */

const unit = 4;

export function drawSofa() {
  const g = createPixelCanvas(30, 16, unit);
  g.px(1, 6, 28, 9, '#8a6fa0');
  g.px(1, 4, 28, 3, '#9a80ae');
  g.px(0, 6, 3, 10, '#7a5f90');
  g.px(27, 6, 3, 10, '#7a5f90');
  g.px(3, 8, 8, 5, '#a794b8');
  g.px(19, 8, 8, 5, '#a794b8');
  g.pborder(0, 4, 30, 12, p.outline);
  return g.canvas;
}

export function drawArmchair() {
  const g = createPixelCanvas(16, 17, unit);
  g.px(1, 6, 14, 10, p.balloonOrange);
  g.px(1, 3, 14, 4, '#f2a563');
  g.px(0, 6, 3, 11, '#d17f36');
  g.px(13, 6, 3, 11, '#d17f36');
  g.px(3, 9, 10, 5, '#f6bd85');
  g.pborder(0, 3, 16, 14, p.outline);
  return g.canvas;
}

export function drawBookshelf() {
  const g = createPixelCanvas(20, 28, unit);
  g.px(0, 0, 20, 28, p.frameWood);
  for (let row = 0; row < 3; row++) {
    const y = 2 + row * 8;
    g.px(1, y, 18, 6, '#3a2a1a');
    const colors = [p.hotPink, p.bannerC, p.bannerD, p.balloonYellow, p.balloonOrange];
    let x = 2;
    let i = 0;
    while (x < 17) {
      const w = 1.5 + (i % 3) * 0.5;
      g.px(x, y + 1, w, 5, colors[i % colors.length]);
      x += w + 0.5;
      i++;
    }
  }
  g.pborder(0, 0, 20, 28, p.wallWoodDark);
  return g.canvas;
}

export function drawSideTable() {
  const g = createPixelCanvas(14, 14, unit);
  g.px(1, 0, 12, 3, p.chairWood);
  g.px(2, 3, 1.5, 11, p.wallWoodDark);
  g.px(10.5, 3, 1.5, 11, p.wallWoodDark);
  g.pborder(1, 0, 12, 3, p.outline);
  return g.canvas;
}

export function drawBeanBag() {
  const g = createPixelCanvas(16, 12, unit);
  g.pcircle(8, 8, 7, p.balloonGreen);
  g.pcircle(6, 6, 2, '#8ad189');
  g.pborder(1, 1, 14, 10, p.outline);
  return g.canvas;
}

export function drawPottedPlant() {
  const g = createPixelCanvas(12, 18, unit);
  g.px(3, 13, 6, 5, '#b8672a');
  g.px(2, 12, 8, 1.5, '#8a4a1e');
  g.pcircle(6, 8, 3, p.leafGreen);
  g.pcircle(4, 6, 2.4, '#6bb85a');
  g.pcircle(8, 6, 2.4, '#6bb85a');
  g.pcircle(6, 4, 2, '#7ec96a');
  g.pborder(3, 13, 6, 5, p.outline);
  return g.canvas;
}

export function drawTallTree() {
  const g = createPixelCanvas(20, 40, unit);
  g.px(9, 32, 2, 8, '#6b4a2a');
  g.pcircle(10, 24, 8, p.leafGreen);
  g.pcircle(10, 15, 7, '#6bb85a');
  g.pcircle(10, 7, 5.5, '#7ec96a');
  return g.canvas;
}

export function drawPineTree() {
  const g = createPixelCanvas(16, 30, unit);
  g.px(7, 25, 2, 4, '#6b4a2a');
  g.px(4, 18, 8, 7, '#3f7a3a');
  g.px(5, 11, 6, 8, '#4a8a44');
  g.px(6, 4, 4, 8, '#5a9e4a');
  g.pcircle(8, 3, 1.5, '#5a9e4a');
  return g.canvas;
}

export function drawStringLights(widthGrid = 40) {
  const g = createPixelCanvas(widthGrid, 8, unit);
  const sag = (x: number) => 1 + 4 * Math.sin((Math.PI * x) / widthGrid);
  for (let x = 0; x < widthGrid; x++) g.px(x, sag(x), 1, 1, '#5e3620');
  const bulbColors = [p.hotPink, p.bannerB, p.bannerC, p.bannerD, '#ff8c42'];
  let i = 0;
  for (let x = 2; x < widthGrid - 2; x += 4) {
    g.pcircle(x, sag(x) + 1.5, 1.1, bulbColors[i % bulbColors.length]);
    i++;
  }
  return g.canvas;
}

export function drawFloorLamp() {
  const g = createPixelCanvas(10, 32, unit);
  g.px(4, 10, 2, 20, '#7a7a82');
  g.px(1, 30, 8, 1.5, '#5a5a62');
  g.px(2, 2, 6, 8, '#ffe9a8');
  g.pborder(2, 2, 6, 8, '#d9c07a');
  return g.canvas;
}

export function drawTableLamp() {
  const g = createPixelCanvas(10, 14, unit);
  g.px(3, 12, 4, 1.5, '#5a5a62');
  g.px(4.5, 8, 1, 4, '#7a7a82');
  g.px(1, 1, 8, 7, '#ffd9a0');
  g.px(1.5, 1, 7, 1, '#ffe9c0');
  g.pborder(1, 1, 8, 7, '#d9a866');
  return g.canvas;
}

export function drawDiscoBall() {
  const g = createPixelCanvas(14, 18, unit);
  g.px(6.5, 0, 1, 3, '#7a7a82');
  g.pcircle(7, 10, 6, '#c9ccd6');
  const mirrorRows = [6, 8, 10, 12, 14];
  for (const y of mirrorRows) {
    for (let x = 1.5; x < 13; x += 2) {
      g.px(x, y, 1.3, 1.3, (x + y) % 4 < 2 ? '#eef0f6' : '#9a9fb0');
    }
  }
  g.pcircle(4.5, 7, 1.4, '#ffffff');
  g.pborder(1, 4, 12, 12, p.outline);
  return g.canvas;
}

export function drawNeonSign() {
  const g = createPixelCanvas(40, 12, unit);
  g.pborder(0, 0, 40, 12, '#3a1a4a');
  g.px(2, 2, 36, 8, '#1a0a2a');
  g.text(20, 5, 'PARTY', '#ff4fd8', `${Math.floor(unit * 0.9)}px "Press Start 2P", monospace`, 'center');
  return g.canvas;
}

/** Same shape, but with custom text baked in — used when a neon-sign RoomObject's configJson
 * has a `text` field (see scene/objectSprites.ts). Kept as a separate function (rather than a
 * parameter on drawNeonSign) since the catalog's default preview still wants the plain version. */
export function drawNeonSignText(text: string) {
  const g = createPixelCanvas(40, 12, unit);
  g.pborder(0, 0, 40, 12, '#3a1a4a');
  g.px(2, 2, 36, 8, '#1a0a2a');
  g.text(20, 5, text.slice(0, 16).toUpperCase() || 'PARTY', '#ff4fd8', `${Math.floor(unit * 0.8)}px "Press Start 2P", monospace`, 'center');
  return g.canvas;
}

export function drawStreamers(widthGrid = 30) {
  const g = createPixelCanvas(widthGrid, 10, unit);
  const colors = [p.hotPink, p.bannerB, p.bannerC];
  for (let x = 0; x < widthGrid; x += 3) {
    const color = colors[(x / 3) % colors.length];
    const sway = Math.sin(x * 0.4) * 1.5;
    for (let row = 0; row < 6; row++) {
      g.px(x + sway * (row / 6), row, 1.4, 1, color);
    }
  }
  return g.canvas;
}

export function drawBalloonCluster() {
  const g = createPixelCanvas(20, 18, unit);
  const positions: Array<[number, number, string]> = [
    [5, 6, p.balloonPurple],
    [11, 4, p.balloonPink],
    [15, 7, p.balloonYellow],
    [8, 9, p.balloonGreen],
  ];
  for (const [cx, cy, color] of positions) {
    g.pcircle(cx, cy, 3.2, color);
    g.px(cx - 0.5, cy + 3, 1, 1, '#2b1a1a');
  }
  return g.canvas;
}

export function drawPinata() {
  const g = createPixelCanvas(16, 18, unit);
  const colors = [p.hotPink, p.bannerB, p.bannerC, p.bannerD];
  for (let row = 0; row < 4; row++) {
    g.px(1, 2 + row * 3, 14, 2.4, colors[row % colors.length]);
  }
  g.px(6, 0, 1, 2, '#5e3620');
  g.pborder(1, 2, 14, 12, p.outline);
  return g.canvas;
}

export function drawPartyHat() {
  const g = createPixelCanvas(10, 12, unit);
  g.ctx.fillStyle = p.hotPink;
  g.ctx.beginPath();
  g.ctx.moveTo(5 * unit, 0);
  g.ctx.lineTo(1 * unit, 11 * unit);
  g.ctx.lineTo(9 * unit, 11 * unit);
  g.ctx.closePath();
  g.ctx.fill();
  g.pcircle(5, 0.5, 1, p.cream);
  g.px(1, 10, 8, 1.5, p.cream);
  return g.canvas;
}
