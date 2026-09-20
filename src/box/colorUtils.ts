/** Small HSL-based shade generator so any curated (or custom) color gets a matching light/base/dark/outline set. */

export type Hsl = { h: number; s: number; l: number };

export function hexToHsl(hex: string): Hsl {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case rn: h = ((gn - bn) / d) % 6; break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sn = s / 100, ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export type Shades = { light: string; base: string; dark: string; outline: string };

/** Auto-generate light/base/dark/outline shades from any base hex color. */
export function shadesFor(hex: string): Shades {
  const hsl = hexToHsl(hex);
  return {
    light: hslToHex({ h: hsl.h, s: clamp(hsl.s - 5, 0, 100), l: clamp(hsl.l + 16, 0, 96) }),
    base: hex,
    dark: hslToHex({ h: hsl.h, s: clamp(hsl.s + 5, 0, 100), l: clamp(hsl.l - 18, 4, 100) }),
    outline: hslToHex({ h: hsl.h, s: clamp(hsl.s - 20, 0, 100), l: clamp(hsl.l - 42, 6, 100) }),
  };
}

/** Snap a freely-picked custom color to the nearest curated swatch (perceptual-ish RGB distance). */
export function nearestSwatch(hex: string, palette: readonly string[]): string {
  const { r, g, b } = hexToRgb(hex);
  let best = palette[0];
  let bestDist = Infinity;
  for (const swatch of palette) {
    const c = hexToRgb(swatch);
    const dist = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = swatch;
    }
  }
  return best;
}
