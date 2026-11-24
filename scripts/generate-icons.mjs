/**
 * Renders the FrameLytix icon set from build/icons/icon.svg.
 *
 * Outputs:
 *   build/icons/icon.png            1024x1024 master (electron-builder generates the macOS
 *                                   .icns automatically from this 1024x1024 PNG)
 *   build/icons/png/{16..512}.png   Linux / misc sizes
 *   build/icons/icon.ico            Windows icon (16,24,32,48,64,128,256)
 *   src/assets/app-icon-256.png     in-app copy
 *   docs/branding/framelytix-banner.png  README banner (1280x320)
 *
 * Deterministic: re-running yields identical files. Run: node scripts/generate-icons.mjs
 */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s) => join(root, ...s);

const svg = await readFile(p('build/icons/icon.svg'));
await mkdir(p('build/icons/png'), { recursive: true });

const render = (size) => sharp(svg, { density: Math.max(72, Math.round((72 * size) / 512) * 2) }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

await writeFile(p('build/icons/icon.png'), await render(1024));
const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
const bufs = {};
for (const s of sizes) {
  bufs[s] = await render(s);
  await writeFile(p(`build/icons/png/${s}.png`), bufs[s]);
}
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
await writeFile(p('build/icons/icon.ico'), await pngToIco(icoSizes.map((s) => bufs[s])));
await copyFile(p('build/icons/png/256.png'), p('src/assets/app-icon-256.png'));

const banner = await readFile(p('docs/branding/framelytix-banner.svg'));
await writeFile(p('docs/branding/framelytix-banner.png'), await sharp(banner, { density: 144 }).resize(1280, 320).png({ compressionLevel: 9 }).toBuffer());
console.log('Icons generated.');
