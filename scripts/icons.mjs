// Renders the app icon (apps/web/public/icons/icon.svg) to the PNG sizes the
// manifest and iOS need. Run with `pnpm icons` after changing the SVG.
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, '..', 'apps', 'web', 'public', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'));

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
for (const size of sizes) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(join(dir, `icon-${size}x${size}.png`), png);
}
// iOS uses its own size for the home screen.
writeFileSync(join(dir, 'apple-touch-icon.png'), new Resvg(svg, { fitTo: { mode: 'width', value: 180 } }).render().asPng());
console.log(`Rendered ${sizes.length + 1} icons into ${dir}`);
