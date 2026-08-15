/**
 * Capture high-DPI hero product shots from the static Leads mock.
 * Usage: node scripts/capture-hero-shots.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import http from 'http';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public', 'marketing');
const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
].filter(Boolean);

const chromePath = chromeCandidates.find((p) => fs.existsSync(p));
if (!chromePath) {
  console.error('Chrome not found');
  process.exit(1);
}

async function loadPuppeteer() {
  const require = createRequire(import.meta.url);
  try {
    return require('puppeteer-core');
  } catch {
    // fall through
  }
  // Install puppeteer-core locally if missing
  await new Promise((resolve, reject) => {
    const child = spawn('npm', ['install', '--no-save', 'puppeteer-core@23'], {
      cwd: root,
      shell: true,
      stdio: 'inherit',
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`npm install failed: ${code}`))));
  });
  return require('puppeteer-core');
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function captureTheme(browser, theme) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });
  const url = `http://localhost:5173/marketing/hero-capture.html?theme=${theme}`;
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await wait(400);
  const pngPath = path.join(outDir, `hero-${theme}.png`);
  await page.screenshot({
    path: pngPath,
    type: 'png',
    clip: { x: 0, y: 0, width: 1600, height: 900 },
  });
  await page.close();

  // Also emit high-quality JPEG + WebP for size options (PNG is primary)
  const img = sharp(pngPath);
  const meta = await img.metadata();
  await sharp(pngPath)
    .jpeg({ quality: 95, mozjpeg: true })
    .toFile(path.join(outDir, `hero-${theme}.jpg`));
  await sharp(pngPath)
    .webp({ quality: 92 })
    .toFile(path.join(outDir, `hero-${theme}.webp`));

  console.log(`wrote hero-${theme}.png ${meta.width}x${meta.height}`);
}

async function main() {
  // Ensure vite is reachable
  await new Promise((resolve, reject) => {
    const req = http.get('http://localhost:5173/marketing/hero-capture.html', (res) => {
      res.resume();
      if (res.statusCode && res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
      else resolve();
    });
    req.on('error', reject);
  });

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--hide-scrollbars', '--force-device-scale-factor=2', '--disable-lcd-text'],
  });

  try {
    await captureTheme(browser, 'light');
    await captureTheme(browser, 'dark');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
