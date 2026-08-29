// mevent.mn smoke test — сайт ачаалагдаж, бараа гарч, JS алдаагүй эсэхийг шалгана.
// Локал файлыг serve хийж (бараа live API-аас ирнэ), headless Chromium-аар нээж шалгана.
// Playwright шаардана: npm i playwright && npx playwright install chromium
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const PORT = 8080;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' || p === '') p = '/index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(PORT, r));

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

let ok = true;
const msg = [];
try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Бараа live API-аас ачаалагдахыг хүлээнэ (fetch → #grid .card)
  await page.waitForSelector('#grid .card', { timeout: 25000 });
  const cards = await page.locator('#grid .card').count();
  msg.push(`бараа ${cards}`);
  if (cards < 5) { ok = false; msg.push('⚠ бараа хэт цөөн (<5) — API/дата эвдэрсэн байж магадгүй'); }
  const cart = await page.locator('.cart-btn').count();
  msg.push(`сагс ${cart}`);
  if (cart < 1) { ok = false; msg.push('⚠ сагс/захиалгын товч алга'); }
} catch (e) {
  ok = false; msg.push('❌ ' + String(e.message).split('\n')[0]);
}

// Ноцтой JS алдаа (favicon/analytics зэрэг benign-ыг үл тооно)
const fatal = errors.filter((e) => !/favicon|gtag|analytics|preload|net::ERR_.*(png|jpg|jpeg|webp|ico)/i.test(e));
if (fatal.length) { ok = false; msg.push(`JS алдаа ${fatal.length}: ${fatal.slice(0, 3).join(' | ')}`); }

await browser.close();
await new Promise((r) => server.close(r));

console.log((ok ? '✅ SMOKE OK' : '❌ SMOKE FAIL') + ' — ' + msg.join(' · '));
process.exit(ok ? 0 : 1);
