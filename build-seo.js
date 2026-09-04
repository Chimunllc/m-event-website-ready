#!/usr/bin/env node
/*
 * build-seo.js — SEO статик каталог + бараа бүрийн хуудас үүсгэгч (mevent.mn)
 *
 * Юу хийдэг вэ:
 *  1. products.json уншиж, түрээслэгддэг бараануудыг шүүнэ.
 *  2. index.html доторх <!-- SEO-FALLBACK --> хооронд JSON-LD + <noscript> каталог (линктэй) оруулна.
 *  3. products/<slug>/index.html — бараа бүрд ТУСДАА индекслэгддэг хуудас (title/meta/JSON-LD/зураг/CTA).
 *     → Google бараа бүрийг олж индекслэнэ (SPA дангаар индекслэгддэггүй асуудлыг шийднэ).
 *  4. sitemap.xml (нүүр + бараа бүр) + robots.txt.
 *
 * Ажиллуулах:  node build-seo.js
 * ⚠ Бараа өөрчлөгдвөл дахин ажиллуулна. (Ирээдүйд GitHub Action-оор автоматжуулж болно.)
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const SITE = 'https://mevent.mn';
const BRAND = 'M-Event';

// ⚠ 2026-09-04: АМЬД каталогоос уншина. Өмнө нь зөвхөн products.json уншдаг байсан
// бөгөөд тэр файл сайтын кодоос аль хэдийн салсан (сайт DB_PRODUCTS_URL-ээс татдаг) тул
// ХУУЧИРСАН: 16 барааны үнэ зөрүүтэй (ихэвчлэн ~30% өндөр — Google дээр бодит үнээс
// үнэтэй харагдана), мөн нөөц/үнэ хуучин утгаараа шүүгдэж ~100 бараа хуудасгүй үлдсэн.
// DB татагдахгүй бол products.json руу унана (офлайн build ажиллах ёстой).
const DB_URL = 'https://n8n.nomaadcamp.com/db/rest/v1/products'
  + '?select=sku,id,code,name,category,all_categories,type,price,deposit,stock,photo,description,archived,bundle_items,qty_mevent,qty_nomaad'
  + '&archived=eq.false&order=name.asc';

function loadProducts() {
  try {
    const out = require('child_process').execFileSync('curl',
      ['-sS', '--max-time', '30', '-H', 'Cache-Control: no-cache', DB_URL],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const d = JSON.parse(out);
    if (!Array.isArray(d) || !d.length) throw new Error('хоосон хариу');
    console.log(`  каталог: АМЬД DB-ээс ${d.length} бараа`);
    return d;
  } catch (e) {
    console.warn(`  ⚠ DB татагдсангүй (${e.message}) → products.json руу унав`);
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8'));
    const rows = Array.isArray(j) ? j : (j.products || []);
    console.log(`  каталог: products.json-оос ${rows.length} бараа (ХУУЧИРСАН байж болно)`);
    return rows;
  }
}

const raw = loadProducts();
const all = raw
  .filter(p => {
    if (p.archived) return false;
    if (p.type === 'service' || p.type === 'package') return true;
    if (String(p.type || 'rental') === 'asset') return false;
    const mev = (p.qty_mevent != null) ? Number(p.qty_mevent) || 0 : Number(p.stock) || 0;
    return mev > 0 && Number(p.price) > 0;
  })
  .sort((a, b) => String(a.name).localeCompare(String(b.name), 'mn'));

const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (Number(n) || 0).toLocaleString('mn-MN') + '₮';
// SKU/id-ээс цэвэр slug (латин/тоо). Давхцвал index залгана.
function slugOf(p) {
  let s = String(p.sku || p.id || p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || null;
}
const seen = {};
all.forEach(p => {
  let s = slugOf(p);
  if (!s) { p._slug = null; return; }
  if (seen[s]) s = s + '-' + (++seen[s]); else seen[s] = 1;
  p._slug = s;
});
const listed = all.filter(p => p._slug);

/* ---------- 1) index.html доторх SEO-FALLBACK ---------- */
const itemList = {
  '@context': 'https://schema.org', '@type': 'ItemList',
  name: BRAND + ' түрээсийн бараа', numberOfItems: listed.length,
  itemListElement: listed.map((p, i) => ({
    '@type': 'ListItem', position: i + 1,
    item: {
      '@type': 'Product', name: p.name, category: p.category || undefined,
      image: /^https?:\/\//.test(p.photo || '') ? p.photo : undefined,
      url: SITE + '/products/' + p._slug + '/',
      offers: { '@type': 'Offer', price: Number(p.price) || 0, priceCurrency: 'MNT', availability: 'https://schema.org/InStock', url: SITE + '/products/' + p._slug + '/' }
    }
  }))
};
const byCat = {};
listed.forEach(p => { (byCat[p.category || 'Бусад'] = byCat[p.category || 'Бусад'] || []).push(p); });
let noscriptHtml = '<noscript><div style="max-width:900px;margin:0 auto;padding:0 20px 40px;">'
  + '<h2>Түрээсийн бараа (' + listed.length + ')</h2>'
  + '<p>Онлайн захиалга JavaScript-тэй ажиллана. Утсаар: +976 7755-1010</p>';
Object.keys(byCat).sort((a, b) => a.localeCompare(b, 'mn')).forEach(cat => {
  noscriptHtml += '<h3>' + esc(cat) + '</h3><ul>';
  byCat[cat].forEach(p => {
    noscriptHtml += '<li><a href="/products/' + p._slug + '/">' + esc(p.name) + '</a> — ' + fmt(p.price) + '/хоног</li>';
  });
  noscriptHtml += '</ul>';
});
noscriptHtml += '</div></noscript>';

const block = '<!-- SEO-FALLBACK:START -->\n'
  + '<script type="application/ld+json">\n' + JSON.stringify(itemList) + '\n</script>\n'
  + noscriptHtml + '\n<!-- SEO-FALLBACK:END -->';
const idxPath = path.join(ROOT, 'index.html');
let html = fs.readFileSync(idxPath, 'utf8');
const re = /<!-- SEO-FALLBACK:START -->[\s\S]*?<!-- SEO-FALLBACK:END -->/;
if (!re.test(html)) { console.error('❌ SEO-FALLBACK marker олдсонгүй'); process.exit(1); }
fs.writeFileSync(idxPath, html.replace(re, block));

/* ---------- 2) products/<slug>/index.html ---------- */
const prodDir = path.join(ROOT, 'products');
// ⚠ 2026-09-04: ХУУЧИН ХУУДСЫГ УСТГАХГҮЙ.
// Өмнө нь энд `fs.rmSync(prodDir, {recursive:true})` байсан. Гэвч SKU нь хуучин
// «ASAR-12X35» хэлбэрээс «M-NNN» болж СОЛИГДСОН тул slug өөрчлөгдөж, устгавал
// Google-д индекслэгдсэн 159 URL бүгд 404 болно (159-өөс зөвхөн 53 нь нэрээр
// шинэ бараатай таарна — барааны нэрс ч өөрчлөгдсөн тул автомат чиглүүлэлт
// найдваргүй, буруу бараа руу заах эрсдэлтэй).
// Тиймээс: шинэ хуудсыг НЭМНЭ, хуучныг хэвээр үлдээнэ (200 буцаасаар байна).
// sitemap-д зөвхөн ШИНЭ багц орно → Google аажмаар хуучныг унагана, 404 гарахгүй.
// Зөв slug миграц (хуучин→шинэ 301) нь нэр тулгах ажил шаардана — тусдаа ажил.
fs.mkdirSync(prodDir, { recursive: true });
fs.mkdirSync(prodDir, { recursive: true });

function productPage(p) {
  const url = SITE + '/products/' + p._slug + '/';
  const title = p.name + ' түрээс | Арга хэмжээний тоног төхөөрөмж түрээс | ' + BRAND;
  const desc = (p.name + ' түрээслэнэ — ' + fmt(p.price) + '/хоног. '
    + (p.description ? String(p.description).replace(/\s+/g, ' ').slice(0, 120) : (p.category || '') + ' ангилал. ')
    + 'Улаанбаатар доторх хүргэлт. Захиалга: 7755-1010.').slice(0, 300);
  const img = /^https?:\/\//.test(p.photo || '') ? p.photo : (SITE + '/og-image.png');
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: p.name, image: img, description: p.description || (p.name + ' түрээс'),
    category: p.category || undefined, sku: p.sku || undefined, brand: { '@type': 'Brand', name: BRAND },
    offers: { '@type': 'Offer', url, price: Number(p.price) || 0, priceCurrency: 'MNT', availability: 'https://schema.org/InStock', priceValidUntil: '2026-12-31',
      seller: { '@type': 'Organization', name: BRAND } }
  };
  const crumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Нүүр', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: p.category || 'Бараа', item: SITE + '/?cat=' + encodeURIComponent(p.category || '') },
      { '@type': 'ListItem', position: 3, name: p.name, item: url }
    ]
  };
  return `<!DOCTYPE html>
<html lang="mn">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="product" />
<meta property="og:title" content="${esc(p.name + ' түрээс | ' + BRAND)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${esc(img)}" />
<meta property="og:url" content="${url}" />
<meta property="product:price:amount" content="${Number(p.price) || 0}" />
<meta property="product:price:currency" content="MNT" />
<meta name="theme-color" content="#0B1F3A" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Inter:wght@400;500;600&display=swap&subset=cyrillic,latin" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:"Inter",-apple-system,sans-serif; background:#FBFAF7; color:#17171B; line-height:1.6; }
  .wrap { max-width:900px; margin:0 auto; padding:20px 20px 60px; }
  header { display:flex; align-items:center; justify-content:space-between; padding:6px 0 22px; }
  .brand { font-family:"Manrope"; font-weight:800; font-size:18px; letter-spacing:.04em; text-transform:uppercase; color:#0B1F3A; text-decoration:none; }
  .brand span { color:#E95400; }
  .call { background:#0B1F3A; color:#fff; padding:9px 16px; border-radius:100px; font-weight:700; font-size:13px; text-decoration:none; }
  nav.crumb { font-size:12.5px; color:#5C5C63; margin-bottom:16px; }
  nav.crumb a { color:#5C5C63; text-decoration:none; }
  .card { display:grid; grid-template-columns:1fr 1fr; gap:28px; background:#fff; border:1px solid #ECE9E2; border-radius:18px; padding:24px; }
  .ph { aspect-ratio:1/1; background:#FAF9F5; border-radius:14px; display:flex; align-items:center; justify-content:center; overflow:hidden; padding:16px; }
  .ph img { max-width:100%; max-height:100%; object-fit:contain; }
  h1 { font-family:"Manrope"; font-size:26px; font-weight:800; letter-spacing:-.02em; color:#0B1F3A; margin-bottom:8px; line-height:1.2; }
  .cat { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:#5C5C63; font-weight:600; margin-bottom:16px; }
  .price { font-family:"Manrope"; font-size:30px; font-weight:800; color:#0B1F3A; margin-bottom:4px; }
  .price small { font-size:14px; font-weight:500; color:#5C5C63; }
  .desc { font-size:14.5px; color:#2A3644; margin:16px 0 22px; white-space:pre-line; }
  .cta { display:inline-block; background:#E95400; color:#fff; padding:14px 30px; border-radius:12px; font-family:"Manrope"; font-weight:700; font-size:14px; text-decoration:none; }
  .note { font-size:12.5px; color:#5C5C63; margin-top:14px; }
  footer { text-align:center; margin-top:40px; font-size:12.5px; color:#5C5C63; }
  footer a { color:#5C5C63; }
  @media (max-width:640px) { .card { grid-template-columns:1fr; } h1 { font-size:22px; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <a href="/" class="brand">M<span>·</span>Event</a>
    <a href="tel:+97677551010" class="call">☎ 7755-1010</a>
  </header>
  <nav class="crumb"><a href="/">Нүүр</a> › <a href="/?cat=${encodeURIComponent(p.category || '')}">${esc(p.category || 'Бараа')}</a> › ${esc(p.name)}</nav>
  <div class="card">
    <div class="ph">${/^https?:\/\//.test(p.photo || '') ? `<img src="${esc(p.photo)}" alt="${esc(p.name)} түрээс" loading="eager" fetchpriority="high">` : ''}</div>
    <div>
      <h1>${esc(p.name)}</h1>
      <div class="cat">${esc(p.category || 'Арга хэмжээний тоног төхөөрөмж')}</div>
      <div class="price">${fmt(p.price)}<small> /хоног</small></div>
      <div class="desc">${esc(p.description || (p.name + ' түрээслэнэ. Дэлгэрэнгүй мэдээлэл, захиалгыг утсаар эсвэл онлайнаар авна уу.'))}</div>
      <a class="cta" href="/?q=${encodeURIComponent(p.name)}">Онлайн захиалах →</a>
      <div class="note">2+ хоног түрээслэвэл −20%. Улаанбаатар доторх хүргэлт 150,000₮-с. Барьцаа барааны төрлөөс хамаарна.</div>
    </div>
  </div>
  <footer>
    © 2026 Чимун ХХК · <a href="tel:+97677551010">7755-1010</a> · <a href="mailto:info@mevent.mn">info@mevent.mn</a> · <a href="/">Бүх бараа →</a>
  </footer>
</div>
</body>
</html>`;
}

listed.forEach(p => {
  const dir = path.join(prodDir, p._slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), productPage(p));
});

/* ---------- 3) sitemap.xml + robots.txt ---------- */
const today = new Date().toISOString().slice(0, 10);
let sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + '  <url><loc>' + SITE + '/</loc><lastmod>' + today + '</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n'
  + '  <url><loc>' + SITE + '/stage-3d.html</loc><lastmod>' + today + '</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>\n';
listed.forEach(p => {
  sm += '  <url><loc>' + SITE + '/products/' + p._slug + '/</loc><lastmod>' + today + '</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n';
});
sm += '</urlset>\n';
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sm);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + '/sitemap.xml\n');

console.log('✅ SEO бэлэн: ' + listed.length + ' бараа → index JSON-LD+noscript, ' + listed.length + ' бүтээгдэхүүний хуудас, sitemap.xml (' + (listed.length + 2) + ' URL), robots.txt');
