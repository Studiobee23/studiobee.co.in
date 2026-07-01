import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { stat } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, 'studiobee-casestudy.pdf');
const URL    = 'http://localhost:3000/casestudy-uxui.html';

async function serverRunning() {
  try {
    const r = await fetch('http://localhost:3000/ping', { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

let spawned = false;
if (!(await serverRunning())) {
  console.log('Starting server...');
  spawn('node', ['serve.mjs'], {
    cwd: __dirname,
    stdio: 'ignore',
    detached: true,
  }).unref();
  await new Promise(r => setTimeout(r, 1500));
  spawned = true;
}

const browser = await puppeteer.launch({
  executablePath: 'C:/Users/arora/.cache/puppeteer/chrome/win64-145.0.7632.77/chrome-win64/chrome.exe',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });

await page.pdf({
  path: OUTPUT,
  format: 'A4',
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});

await browser.close();

const { size } = await stat(OUTPUT);
const kb = (size / 1024).toFixed(1);
console.log(`Saved: ${OUTPUT} (${kb} KB)`);

if (spawned) {
  console.log('Server was started for this run — it is still running in the background.');
}
