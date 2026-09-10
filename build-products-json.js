#!/usr/bin/env node
/**
 * products.json — сайтын ЭХНИЙ ДЭЛГЭЦИЙН хуулбарыг амьд каталогоос шинэчилнэ.
 *
 * Яагаад хэрэгтэй вэ:
 *   Сайт хуудас нээгдмэгц эхлээд `products.json`-ыг үзүүлээд, ард нь амьд каталог
 *   татаад дахин рендерлэдэг (хурдан эхний зураг). Гэвч энэ файлыг ХҮН гараар
 *   шинэчилдэг байсан тул 2026-09-09 гэхэд: 36 бараа каталогт байхгүй болсон
 *   хэрнээ файлд үлдсэн, 24 барааны үнэ зөрүүтэй, хамгийн том зөрүү 3,650,000₮.
 *   Зочин эхний хормыг буруу үнээр хараад сагслах боломжтой байв.
 *
 *   Одоо энэ скрипт өдөр бүр автоматаар ажиллана (.github/workflows/catalog-sync.yml).
 *
 * Талбарын жагсаалт нь index.html-ийн `DB_PRODUCTS_URL`-тэй ЯГ ижил байх ёстой —
 * эс бөгөөс эхний дэлгэц ба амьд дэлгэц өөр шүүлтэд орж, бараа анивчина.
 * (`photos` — олон зураг — ЭНД ОРОХГҮЙ: хэдэн МБ болж эхний ачаалалт удаашрана.)
 *
 * Ажиллуулах:  node build-products-json.js
 */
const fs = require('fs');
const path = require('path');

// ⚠ 2026-09-10: `public_catalog` ХАРАГДАЦ-аас. «Сайтад юу харагдах» дүрэм
// өгөгдлийн санд НЭГ УДАА бичигдсэн тул энд шүүлт ч, талбарын жагсаалт ч
// давхардахгүй. `stock` нь бэлдэгдсэн (qty_mevent − эвдэрсэн − засварт).
const SELECT = 'sku,id,code,name,category,all_categories,type,price,deposit,stock,'
  + 'photo,description,bundle_items,variant_group,variant_label,media_url,setup_fee';
const URL = 'https://n8n.nomaadcamp.com/db/rest/v1/public_catalog'
  + `?select=${SELECT}&order=name.asc`;

const out = require('child_process').execFileSync('curl',
  ['-sS', '--max-time', '30', '-H', 'Cache-Control: no-cache', URL],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

let rows;
try { rows = JSON.parse(out); } catch (e) {
  console.error('❌ Хариу JSON биш:', String(out).slice(0, 200));
  process.exit(1);
}
if (!Array.isArray(rows) || !rows.length) {
  console.error('❌ Каталог хоосон ирлээ — хуучин products.json-ыг дарж бичихгүй.');
  process.exit(1);
}

// Хамгаалалт: каталог гэнэт эрс багасвал (жишээ шүүлт эвдэрсэн, эрх хаагдсан)
// хуучин файлыг дарж бичихгүй. Хүн шалгах ёстой.
const dst = path.join(__dirname, 'products.json');
if (fs.existsSync(dst)) {
  try {
    const prev = JSON.parse(fs.readFileSync(dst, 'utf8'));
    const prevN = Array.isArray(prev) ? prev.length : (prev.products || []).length;
    if (prevN > 20 && rows.length < prevN * 0.5) {
      console.error(`❌ Каталог ${prevN} → ${rows.length} болж хагасаас доош унасан.`
        + ` Санамсаргүй устгал байж болзошгүй тул бичихгүй.`);
      process.exit(1);
    }
  } catch (e) { /* хуучин файл уншигдахгүй бол шалгалтгүй үргэлжилнэ */ }
}

fs.writeFileSync(dst, JSON.stringify(rows));
console.log(`✅ products.json шинэчлэгдлээ — ${rows.length} бараа`);
