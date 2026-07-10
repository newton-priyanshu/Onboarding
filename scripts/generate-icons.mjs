// =============================================================================
// Generate PNG Icons + PWA Assets from SVG Logo
// =============================================================================
// Usage: node scripts/generate-icons.mjs
// Requires: sharp (installed as devDependency)
// Output: public/icon-192.png, public/icon-512.png, public/favicon.ico-ready.png
// =============================================================================

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const svgPath = path.join(publicDir, 'favicon.svg');

const SIZES = [
  { size: 192, name: 'icon-192.png', purpose: 'any' },
  { size: 512, name: 'icon-512.png', purpose: 'any' },
  { size: 48,  name: 'favicon-48.png', purpose: 'any' },
];

async function main() {
  if (!fs.existsSync(svgPath)) {
    console.error(`❌ SVG not found at ${svgPath}`);
    process.exit(1);
  }

  const svgBuffer = fs.readFileSync(svgPath);
  const results = [];

  for (const { size, name } of SIZES) {
    const outPath = path.join(publicDir, name);
    try {
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outPath);
      
      const stats = fs.statSync(outPath);
      results.push({ name, size: `${size}x${size}`, bytes: stats.size, ok: true });
    } catch (err) {
      results.push({ name, size: `${size}x${size}`, ok: false, error: err.message });
    }
  }

  // Generate a larger master PNG for any future use
  const masterPath = path.join(publicDir, 'logo.png');
  try {
    await sharp(svgBuffer)
      .resize(1024, 1024)
      .png()
      .toFile(masterPath);
    const stats = fs.statSync(masterPath);
    results.push({ name: 'logo.png', size: '1024x1024', bytes: stats.size, ok: true });
  } catch (err) {
    results.push({ name: 'logo.png', size: '1024x1024', ok: false, error: err.message });
  }

  // Summary
  console.log('\n📦 Generated Icons:\n');
  for (const r of results) {
    if (r.ok) {
      console.log(`   ✅ ${r.name.padEnd(18)} ${r.size.padEnd(12)} ${(r.bytes / 1024).toFixed(1)} KB`);
    } else {
      console.log(`   ❌ ${r.name.padEnd(18)} ${r.error}`);
    }
  }

  const allOk = results.every(r => r.ok);
  console.log(`\n${allOk ? '✅ All icons generated successfully!' : '❌ Some icons failed'}`);
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
