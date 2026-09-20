import { Container, Graphics, Text } from 'pixi.js';

/** Small floating pixel-style label/speech bubble. Returns a cleanup fn; auto-removes after `autoHide` ms if truthy. */
export function showLabel(world: Container, x: number, y: number, text: string, autoHide: number | boolean = false) {
  const container = new Container();
  container.position.set(x, y);

  const label = new Text({
    text,
    style: {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: 10,
      fill: 0x2b1a1a,
    },
  });
  label.anchor.set(0.5, 0.5);

  const pad = 8;
  const bg = new Graphics()
    .roundRect(-label.width / 2 - pad, -label.height / 2 - pad / 2, label.width + pad * 2, label.height + pad, 4)
    .fill({ color: 0xfff6d5 })
    .stroke({ width: 2, color: 0xff3d8b });

  container.addChild(bg, label);
  world.addChild(container);

  let timeout: ReturnType<typeof setTimeout> | null = null;
  if (autoHide) {
    const ms = typeof autoHide === 'number' ? autoHide : 1200;
    timeout = setTimeout(() => cleanup(), ms);
  }

  function cleanup() {
    if (timeout) clearTimeout(timeout);
    if (!container.destroyed) container.destroy({ children: true });
  }

  return cleanup;
}
