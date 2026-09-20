import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';

export function drawTable() {
  const unit = 4;
  const gridW = 90;
  const gridH = 30;
  const g = createPixelCanvas(gridW, gridH, unit);

  // tablecloth top
  g.px(0, 0, gridW, 6, p.gingham);
  for (let x = 0; x < gridW; x += 6) {
    g.px(x, 0, 3, 6, p.ginghamLine);
  }
  g.px(0, 5, gridW, 1, '#ffffff');

  // draped sides
  g.px(2, 6, gridW - 4, gridH - 6, p.gingham);
  for (let x = 2; x < gridW - 2; x += 6) {
    g.px(x, 6, 3, gridH - 6, p.ginghamLine);
  }
  // scalloped hem
  for (let x = 2; x < gridW - 2; x += 5) {
    g.pcircle(x + 2, gridH - 1, 2, p.gingham);
  }

  return g.canvas;
}

export function drawChair() {
  const unit = 4;
  const gridW = 22;
  const gridH = 40;
  const g = createPixelCanvas(gridW, gridH, unit);

  // heart-cutout chair back
  g.px(3, 2, gridW - 6, 18, p.chairWood);
  // cut the heart out by painting wall-plaster color (approximation of "seeing through")
  g.pcircle(gridW / 2 - 2, 9, 2.3, p.wallPlaster);
  g.pcircle(gridW / 2 + 2, 9, 2.3, p.wallPlaster);
  g.px(gridW / 2 - 4, 9, 8, 3, p.wallPlaster);
  g.px(gridW / 2 - 2.5, 11.5, 5, 2, p.wallPlaster);
  g.px(gridW / 2 - 1, 13, 2, 1.4, p.wallPlaster);
  // pink bow on the back
  g.pcircle(gridW / 2 - 2, 20, 2, p.hotPink);
  g.pcircle(gridW / 2 + 2, 20, 2, p.hotPink);
  g.px(gridW / 2 - 1, 19, 2, 2.5, p.hotPinkDark);
  // seat
  g.px(1, 20, gridW - 2, 4, p.chairWood);
  // legs
  g.px(2, 24, 2.4, 16, p.chairWood);
  g.px(gridW - 4.4, 24, 2.4, 16, p.chairWood);

  return g.canvas;
}

export function drawCupcakeStand() {
  const unit = 4;
  const gridW = 22;
  const gridH = 20;
  const g = createPixelCanvas(gridW, gridH, unit);

  g.px(2, 16, gridW - 4, 2, p.metal);
  g.px(gridW / 2 - 0.6, 10, 1.2, 6, p.metal);
  g.px(4, 8, gridW - 8, 2, p.metal);
  const cupcake = (cx: number, y: number) => {
    g.px(cx - 2.5, y, 5, 2.4, '#f2e3c2');
    g.pcircle(cx, y - 1, 2.6, p.cakePink);
    g.pcircle(cx, y - 1, 0.8, p.hotPink);
  };
  cupcake(6, 8);
  cupcake(11, 6);
  cupcake(16, 8);

  return g.canvas;
}

export function drawVase() {
  const unit = 4;
  const gridW = 20;
  const gridH = 30;
  const g = createPixelCanvas(gridW, gridH, unit);

  g.px(gridW / 2 - 3, 16, 6, 10, p.vaseBlue);
  g.px(gridW / 2 - 3.6, 15, 7.2, 2, p.vaseBlue);

  const daisy = (cx: number, cy: number) => {
    for (const [dx, dy] of [[0, -2.2], [0, 2.2], [-2.2, 0], [2.2, 0], [-1.6, -1.6], [1.6, 1.6], [-1.6, 1.6], [1.6, -1.6]]) {
      g.pcircle(cx + dx, cy + dy, 1.4, p.daisyWhite);
    }
    g.pcircle(cx, cy, 1.4, p.daisyCenter);
  };
  daisy(gridW / 2 - 3, 6);
  daisy(gridW / 2 + 2, 4);
  daisy(gridW / 2, 9);
  g.px(gridW / 2 - 3, 6, 0.8, 10, p.leafGreen);
  g.px(gridW / 2 + 2, 5, 0.8, 11, p.leafGreen);
  g.px(gridW / 2, 9, 0.8, 7, p.leafGreen);

  return g.canvas;
}

export function drawSnackBowl() {
  const unit = 4;
  const gridW = 16;
  const gridH = 10;
  const g = createPixelCanvas(gridW, gridH, unit);
  g.pcircle(gridW / 2, 6, 6, '#f4d35e');
  g.px(1, 3, gridW - 2, 4, p.wallPlaster);
  // bowl rim
  g.ctx.strokeStyle = '#d9b04a';
  g.ctx.lineWidth = unit;
  g.ctx.beginPath();
  g.ctx.arc(gridW / 2 * unit, 6 * unit, 6 * unit, Math.PI, 0);
  g.ctx.stroke();
  // snacks poking up
  for (const dx of [-3, -1, 1, 3]) {
    g.pcircle(gridW / 2 + dx, 3, 1.3, '#e07a3f');
  }
  return g.canvas;
}

export function drawCups() {
  const unit = 4;
  const gridW = 16;
  const gridH = 10;
  const g = createPixelCanvas(gridW, gridH, unit);
  const cup = (x: number, color: string) => {
    g.px(x, 3, 4, 6, color);
    g.px(x - 0.5, 2, 5, 1.4, color);
  };
  cup(1, p.hotPink);
  cup(7, p.bannerC);
  cup(11.5, p.bannerB);
  return g.canvas;
}
