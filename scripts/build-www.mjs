// Salin fail web ke www/ untuk dibungkus dalam APK. Service worker tidak disalin
// kerana APK sudah menyimpan semua fail dalam pakej.
import { cpSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest']) copyFileSync(f, `www/${f}`);
for (const d of ['vendor', 'icons']) cpSync(d, `www/${d}`, { recursive: true });
console.log('www/ sedia');
