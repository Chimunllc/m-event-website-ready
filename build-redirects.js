#!/usr/bin/env node
/**
 * Хуучин SEO хаягуудыг шинэ /products/m-NNN/ руу шилжүүлнэ.
 *
 * Яагаад:  2026 оны эхээр барааны хуудас `products/<нэрний-slug>/` байсныг
 *          `products/m-NNN/` (sku) болгож сольсон. Хуучин 159 хаяг Google-д
 *          индекслэгдсэн хэвээр байсан бөгөөд ХУУЧИН ҮНЭТЭЙ HTML-ээ өгсөөр байв
 *          — өөрөөр хэлбэл давхардсан агуулга + буруу үнэ хайлтад харагдаж байсан.
 *
 * GitHub Pages сервер талын 301 дэмждэггүй тул: canonical + meta refresh +
 * JS replace. Google үүнийг «зөөлөн 301» гэж үзэж зэрэглэлийг нэгтгэдэг.
 *
 * Зураглал (`redirect-map.json`) нь ХӨЛДӨӨСӨН — барааны нэр цаашид өөрчлөгдөхөд
 * дахин тааруулах шаардлагагүй. Зураглалыг үүсгэсэн арга: барааны id/sku таарах,
 * эс бөгөөс нэрээр (тоо ЗААВАЛ таарах шалгуартай — «18×10»-ыг «18×15» руу
 * явуулахаас сэргийлнэ). Итгэлгүй тохиолдолд каталогийн хайлт руу илгээнэ.
 *
 * Ажиллуулах:  node build-redirects.js
 */
const fs = require('fs');
const path = require('path');

const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'redirect-map.json'), 'utf8'));
const ORIGIN = 'https://mevent.mn';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function page({ target, canonical, title, noindex }) {
  const t = esc(target);
  return `<!doctype html>
<html lang="mn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — M-Event</title>
<link rel="canonical" href="${esc(canonical)}">
${noindex ? '<meta name="robots" content="noindex,follow">\n' : ''}<meta http-equiv="refresh" content="0; url=${t}">
<script>location.replace(${JSON.stringify(target)});</script>
<style>body{font:16px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;padding:24px;text-align:center}a{color:#0b6}</style>
</head>
<body>
<p>Энэ хуудас шинэ хаяг руу шилжсэн.<br><a href="${t}">${esc(title)}</a></p>
</body>
</html>
`;
}

let toProduct = 0, toSearch = 0;
for (const [slug, m] of Object.entries(MAP)) {
  const dir = path.join(__dirname, 'products', slug);
  fs.mkdirSync(dir, { recursive: true });
  let html;
  // Очих хуудас үнэхээр байгаа эсэхийг шалгана. `build-seo.js` нь ЗӨВХӨН
  // `qty_mevent>0 && price>0` барааг үүсгэдэг тул зураглалд байгаа бараа
  // хуудасгүй байж болно (ж. үнэ хараахан тавиагүй). Тэр үед 404 руу
  // явуулахын оронд хайлт руу буулгана — үнэ тавиад дахин build хийхэд
  // энэ скрипт өөрөө барааны хуудас руу буцаана.
  const hasPage = m.to && fs.existsSync(path.join(__dirname, 'products', m.to, 'index.html'));
  if (hasPage) {
    const target = `/products/${m.to}/`;
    html = page({ target, canonical: ORIGIN + target, title: m.name, noindex: false });
    toProduct++;
  } else {
    // Итгэлтэй таарал олдоогүй — каталогийн хайлт руу. Хэрэглэгч ажиллах
    // хуудсанд бууна; Google-д энэ хаягийг тэтгэхгүй (noindex) учир нь
    // `?q=` бол canonical очих цэг биш.
    const target = `/?q=${encodeURIComponent(m.q || m.name)}`;
    html = page({ target, canonical: ORIGIN + '/', title: m.name, noindex: true });
    toSearch++;
  }
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}
console.log(`✅ ${toProduct + toSearch} шилжүүлэг — бараа руу ${toProduct}, хайлт руу ${toSearch}`);
