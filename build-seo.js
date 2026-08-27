#!/usr/bin/env node
/*
 * build-seo.js — SEO статик каталог үүсгэгч (mevent.mn)
 *
 * Юу хийдэг вэ:
 *  1. products.json уншиж, түрээслэгддэг бараануудыг шүүнэ.
 *  2. index.html доторх <!-- SEO-FALLBACK:START/END --> хооронд:
 *       - Product/ItemList JSON-LD (Google structured data)
 *       - <noscript> статик жагсаалт (робот+JS-гүй хэрэглэгч бараа/үнэ хардаг)
 *     оруулна.
 *  3. sitemap.xml + robots.txt үүсгэнэ.
 *
 * Ажиллуулах:  node build-seo.js
 * ⚠ Бараа өөрчлөгдвөл (products.json шинэчлэгдвэл) дахин ажиллуулна.
 *   Ирээдүйд GitHub Action-оор автоматжуулж болно.
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const SITE = 'https://mevent.mn';

const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8'));
const list = (Array.isArray(products) ? products : (products.products || []))
  .filter(p => {
    if (p.archived) return false;
    if (p.type === 'service' || p.type === 'package') return true;
    if (String(p.type || 'rental') === 'asset') return false;
    const mev = (p.qty_mevent != null) ? Number(p.qty_mevent) || 0 : Number(p.stock) || 0;
    return mev > 0 && Number(p.price) > 0;
  })
  .sort((a, b) => String(a.name).localeCompare(String(b.name), 'mn'));

const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// --- JSON-LD: ItemList дотор Product-ууд ---
const itemList = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'M-Event түрээсийн бараа',
  numberOfItems: list.length,
  itemListElement: list.map((p, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Product',
      name: p.name,
      category: p.category || undefined,
      image: /^https?:\/\//.test(p.photo || '') ? p.photo : undefined,
      offers: {
        '@type': 'Offer',
        price: Number(p.price) || 0,
        priceCurrency: 'MNT',
        availability: 'https://schema.org/InStock',
        url: SITE + '/'
      }
    }
  }))
};

// --- noscript статик жагсаалт (робот бараа/үнэ уншина) ---
const byCat = {};
list.forEach(p => { (byCat[p.category || 'Бусад'] = byCat[p.category || 'Бусад'] || []).push(p); });
let noscriptHtml = '<noscript><div style="max-width:900px;margin:0 auto;padding:0 20px 40px;">'
  + '<h2>Бүх бараа (' + list.length + ')</h2>'
  + '<p>Онлайн захиалга JavaScript-тэй ажиллана. Утсаар: +976 7755-1010</p>';
Object.keys(byCat).sort((a, b) => a.localeCompare(b, 'mn')).forEach(cat => {
  noscriptHtml += '<h3>' + esc(cat) + '</h3><ul>';
  byCat[cat].forEach(p => {
    noscriptHtml += '<li>' + esc(p.name) + ' — ' + (Number(p.price) || 0).toLocaleString('mn-MN') + '₮/хоног</li>';
  });
  noscriptHtml += '</ul>';
});
noscriptHtml += '</div></noscript>';

const block = '<!-- SEO-FALLBACK:START -->\n'
  + '<script type="application/ld+json">\n' + JSON.stringify(itemList) + '\n</script>\n'
  + noscriptHtml + '\n'
  + '<!-- SEO-FALLBACK:END -->';

// --- index.html-д оруулах ---
const idxPath = path.join(ROOT, 'index.html');
let html = fs.readFileSync(idxPath, 'utf8');
const re = /<!-- SEO-FALLBACK:START -->[\s\S]*?<!-- SEO-FALLBACK:END -->/;
if (!re.test(html)) { console.error('❌ SEO-FALLBACK marker олдсонгүй'); process.exit(1); }
html = html.replace(re, block);
fs.writeFileSync(idxPath, html);

// --- sitemap.xml ---
const today = new Date().toISOString().slice(0, 10);
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + '  <url><loc>' + SITE + '/</loc><lastmod>' + today + '</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n'
  + '  <url><loc>' + SITE + '/stage-3d.html</loc><lastmod>' + today + '</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>\n'
  + '</urlset>\n';
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);

// --- robots.txt ---
fs.writeFileSync(path.join(ROOT, 'robots.txt'),
  'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + '/sitemap.xml\n');

console.log('✅ SEO бэлэн: ' + list.length + ' бараа → JSON-LD + noscript, sitemap.xml, robots.txt');
