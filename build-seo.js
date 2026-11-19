#!/usr/bin/env node
/*
 * build-seo.js — SEO статик каталог + бараа бүрийн хуудас үүсгэгч (mevent.mn)
 *
 * Юу хийдэг вэ:
 *  1. products.json уншиж, түрээслэгддэг бараануудыг шүүнэ.
 *  2. index.html доторх <!-- SEO-FALLBACK --> хооронд JSON-LD + <noscript> каталог (линктэй) оруулна.
 *  3. products/<slug>/index.html — бараа бүрд ТУСДАА индекслэгддэг хуудас (title/meta/JSON-LD/зураг/CTA).
 *     → Google бараа бүрийг олж индекслэнэ (SPA дангаар индекслэгддэггүй асуудлыг шийднэ).
 *  4. turees/<slug>/index.html — АНГИЛЛЫН хуудас («сандал ширээ түрээс» гэх мэт).
 *     → Хайлтын хэмжээ барааны нэр дээр БИШ, ангиллын нэр дээр байдаг.
 *  5. sitemap.xml (нүүр + ангилал + бараа бүр) + robots.txt.
 *
 * Ажиллуулах:  node build-seo.js
 * ⚠ Гараар ажиллуулах шаардлагагүй — `.github/workflows/catalog-sync.yml` өдөр бүр
 *   05:00 цагт амьд каталогоос дахин үүсгэж, өөрчлөлт байвал өөрөө commit хийнэ.
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
// ⚠ 2026-09-10: `public_catalog` ХАРАГДАЦ-аас уншина, `products`-оос БИШ.
// «Сайтад юу харагдах» дүрэм өмнө нь ГУРВАН газарт ГУРВАН өөрөөр бичигдсэн байсан
// (сайт 196, энэ скрипт 190, апп 196) тул нэгийг нь засахад нөгөө хоёр нь хоцордог
// байв. Одоо дүрэм өгөгдлийн санд НЭГ УДАА бичигдсэн — энд дахин шүүхгүй.
// Харагдац нь `stock`-ыг (qty_mevent − эвдэрсэн − засварт) бэлдэж өгнө.
const DB_URL = 'https://n8n.nomaadcamp.com/db/rest/v1/public_catalog'
  + '?select=sku,id,code,name,category,all_categories,type,price,deposit,stock,photo,description,bundle_items,media_url,setup_fee,bundle_days'
  + '&order=name.asc';

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
    // ⚠ АВТОМАТ (CI) ажиллагаанд ХУУЧИН snapshot руу унаж БОЛОХГҮЙ. Унавал скрипт
    //    280 хуудсыг хуучин үнээр дарж бичээд «✅ бэлэн» гэж хэлнэ — хэн ч мэдэхгүй.
    //    Тиймээс REQUIRE_LIVE=1 үед чангаар унана; хүн гараар ажиллуулахад л уналт зөвшөөрөгдөнө.
    if (process.env.REQUIRE_LIVE === '1') {
      console.error(`❌ Амьд каталог татагдсангүй (${e.message}). REQUIRE_LIVE=1 тул ХУУЧИН`
        + ` products.json-оор дарж бичихгүй — build зогсов.`);
      process.exit(1);
    }
    console.warn(`  ⚠ DB татагдсангүй (${e.message}) → products.json руу унав`);
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8'));
    const rows = Array.isArray(j) ? j : (j.products || []);
    console.log(`  каталог: products.json-оос ${rows.length} бараа (ХУУЧИРСАН байж болно)`);
    return rows;
  }
}

const raw = loadProducts();
// Шүүлт ЭНД БАЙХГҮЙ — харагдац аль хэдийн шүүсэн. Хэрэв офлайн уналтаар
// (products.json) ирсэн бол тэр файл ч мөн харагдацаас үүсдэг тул ижилхэн.
const all = raw.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'mn'));

const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (Number(n) || 0).toLocaleString('mn-MN') + '₮';
// Багцын «N хоногийн үнэ» (2026-10-24): N≥2 бол үнэ нь N хоногийг багтаасан тогтмол дүн, «/хоног» БИШ.
// ⚠ Сайтын index.html `productBundleDays`-тай ИЖИЛ дүрэм (N<2 = өдрийн үнэ, дээд 30).
const bundleDays = p => {
  if (!p || p.type !== 'package') return 0;
  const n = Math.floor(Number(p.bundle_days) || 0);
  return n >= 2 ? Math.min(n, 30) : 0;
};
const unitTxt = p => bundleDays(p) ? ' (' + bundleDays(p) + ' хоногийн үнэ)' : '/хоног';
// Бичвэрийг ҮГЭЭР таслана. ⚠ 2026-09-17: өмнө нь `.slice(0,120)` шууд таслаад ард
// нь «Улаанбаатар…» гэж залгадаг байсан тул 225 барааны 116-д нь Google-ийн илэрц
// дээр «…зориулсан өндөУлаанбаатар доторх хүргэлт» гэсэн эвдэрсэн өгүүлбэр гарч
// байв. Тайлбар нь хүн дарах эсэхийг шийддэг тул эвдэрсэн байж БОЛОХГҮЙ.
function clampWords(s, max) {
  const t = String(s || '')
    .replace(/\s+/g, ' ')
    // Каталогийн тайлбарт мөр таслалт таслал болж хувирсан байдаг («юм. , Үзүүлэлтүүд: ,»).
    .replace(/([.!?:])\s*,\s*/g, '$1 ').replace(/\s*,\s*(?=,)/g, '').replace(/\s+([.,])/g, '$1')
    .trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  // Зай хэт эрт байвал (нэг урт үг) тэмдэгтээр таслахаас өөр арга алга.
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s.,;:·—-]+$/, '') + '…';
}
// Google-д ҮНЭН зарлана. Өмнө нь бүх хуудас «InStock» гэж ХАТУУ бичигдсэн байсан
// тул угсрагдахгүй багцууд ч нөөцтэй гэж зарлагдаж байв — Хөгжим DIAMOND
// (6,200,000₮) 4 микрофон шаарддаг ч агуулахад 2 л байна, ULTRA (7,600,000₮)
// мөн адил. Харагдац одоо багцын үлдэгдлийг бүрэлдэхүүнээс бодож өгдөг тул
// тэр тоог шууд хэрэглэнэ.
const availOf = p => (p.type === 'service' || Number(p.stock) > 0)
  ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
// Үнэ хүчинтэй хугацаа — өнөөдрөөс 1 жил. Хатуу огноо өнгөрвөл Google үнийг үл хэрэгсэнэ.
const PRICE_VALID = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
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

/* ---------- 0) Ангиллын хуудас — хайлтын хэмжээ ЭНД байна ---------- */
// ⚠ 2026-09-17: Сайт 196 барааны хуудастай атлаа АНГИЛЛЫН хуудас 0 байв.
//   Хүн Google дээр «сандал ширээ түрээс», «асар түрээс» гэж хайдаг —
//   «3 талт матриц гэрэл» гэж хайдаггүй. Ангилал нь `/?cat=…` query string
//   байсан бөгөөд canonical нь `/` рүү заадаг тул тусад нь эрэмбэлэгдэх
//   боломжгүй байсан. Одоо `/turees/<slug>/` гэсэн БОДИТ хуудас үүснэ.
//
// ⛔ SLUG-ийг ГАРААР бичсэн — ГАЛИГЛАЛААР БОДОХГҮЙ.
//   Эдгээр нь амьд URL. Галиглалын функцийг хэзээ нэгэн цагт зассан өдөр
//   бүх ангиллын хаяг чимээгүй өөрчлөгдөж, индекслэгдсэн хуудсууд 404 болно.
//   Нэг удаа сонгоод ХЭЗЭЭ Ч солихгүй. Шинэ ангилал нэмэгдвэл галиглалаар
//   түр slug гарна — тэр үед энэ жагсаалтад гараар нэмж тогтворжуулна.
const CAT_SLUG = {
  'Ширээ, сандал, бүтээлэг': 'shiree-sandal',
  'Аяны хэрэгсэл':           'ayany-heregsel',
  'Тайзны гэрэлтүүлэг':      'taizny-gereltuuleg',
  'Хөгжөөнт тоглоом':        'hogjoont-togloom',
  'Хөгжим':                  'hogjim',
  'Эрчим хүч, цахилгаан':    'erchim-huch',
  'Сүүдрэвч':                'suudrevch',
  'Хөгжмийн багц':           'hogjmiin-bagts',
  'Засал, тохижилт':         'zasal-tohijilt',
  'Халаалт, агааржуулалт':   'halaalt-agaarjuulalt',
  'Эффект':                  'effekt',
  'Майхан':                  'maihan',
  'Асар':                    'asar',
  'Тайз':                    'taiz',
  'Ресторан хэрэгсэл':       'restoran-heregsel',
  'Чимэглэлийн гэрэл':       'chimeglelin-gerel',
};
// Галиглал — ЗӨВХӨН жагсаалтад байхгүй шинэ ангилалд. index.html-ийн MN_LAT-тай
// ижил үсгийн зураглал (тэнд хайлтын түлхүүрт, энд хаягт хэрэглэнэ).
const MN_LAT = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'j','з':'z',
  'и':'i','й':'i','к':'k','л':'l','м':'m','н':'n','о':'o','ө':'o','п':'p','р':'r','с':'s',
  'т':'t','у':'u','ү':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sh','ъ':'','ы':'y',
  'ь':'','э':'e','ю':'yu','я':'ya' };
function catSlug(cat) {
  if (CAT_SLUG[cat]) return CAT_SLUG[cat];
  let t = '';
  for (const ch of String(cat || '').toLowerCase()) t += (MN_LAT[ch] !== undefined ? MN_LAT[ch] : ch);
  return t.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || null;
}

// Хэт цөөн барааны ангилалд хуудас үүсгэхгүй: Google 1-2 мөртэй хуудсыг
// «thin content» гэж үзнэ. 19 ангиллаас 16 нь үлдэнэ («Бусад» нь хайлтын
// үг биш тул зориуд хасагдана).
const CAT_MIN_ITEMS = 3;
const CAT_SKIP = new Set(['Бусад', '']);

const catBuckets = {};
listed.forEach(p => {
  const c = p.category || '';
  if (CAT_SKIP.has(c)) return;
  (catBuckets[c] = catBuckets[c] || []).push(p);
});
const cats = Object.keys(catBuckets)
  .filter(c => catBuckets[c].length >= CAT_MIN_ITEMS && catSlug(c))
  .sort((a, b) => a.localeCompare(b, 'mn'))
  .map(c => ({ name: c, slug: catSlug(c), items: catBuckets[c] }));
// Бараа → өөрийнх нь ангиллын хуудас. Талх үйрмэг, дотоод холбоос энд тулна.
const catOfProduct = {};
cats.forEach(c => c.items.forEach(p => { catOfProduct[p._slug] = c; }));
const catUrl = c => SITE + '/turees/' + c.slug + '/';
// Барааны хуудас руу заах холбоос: ангиллын хуудас байвал түүн рүү, эс бөгөөс нүүр рүү.
const catHref = p => {
  const c = catOfProduct[p._slug];
  return c ? '/turees/' + c.slug + '/' : '/?cat=' + encodeURIComponent(p.category || '');
};

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
      offers: { '@type': 'Offer', price: Number(p.price) || 0, priceCurrency: 'MNT', availability: availOf(p), url: SITE + '/products/' + p._slug + '/' }
    }
  }))
};
const byCat = {};
listed.forEach(p => { (byCat[p.category || 'Бусад'] = byCat[p.category || 'Бусад'] || []).push(p); });
const catBySlugName = {};
cats.forEach(c => { catBySlugName[c.name] = c; });
let noscriptHtml = '<noscript><div style="max-width:900px;margin:0 auto;padding:0 20px 40px;">'
  + '<h2>Түрээсийн бараа (' + listed.length + ')</h2>'
  + '<p>Онлайн захиалга JavaScript-тэй ажиллана. Утсаар: +976 7755-1010</p>'
  // Ангиллын хуудсууд руу нүүрнээс холбоос. Ганц газраас 16 хуудас руу линк
  // очиход Google тэдгээрийг «чухал» гэж үзнэ — sitemap дангаараа үүнийг өгдөггүй.
  + (cats.length ? '<h3>Ангиллаар түрээслэх</h3><ul>'
      + cats.map(c => '<li><a href="/turees/' + c.slug + '/">' + esc(c.name)
          + ' түрээс</a> (' + c.items.length + ')</li>').join('') + '</ul>' : '');
Object.keys(byCat).sort((a, b) => a.localeCompare(b, 'mn')).forEach(cat => {
  const cp = catBySlugName[cat];
  noscriptHtml += '<h3>' + (cp ? '<a href="/turees/' + cp.slug + '/">' + esc(cat) + '</a>' : esc(cat)) + '</h3><ul>';
  byCat[cat].forEach(p => {
    noscriptHtml += '<li><a href="/products/' + p._slug + '/">' + esc(p.name) + '</a> — ' + fmt(p.price) + unitTxt(p) + '</li>';
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


/* ══ НИЙТЛЭГ БҮРХҮҮЛ — барааны ба ангиллын хуудас ҮНДСЭН САЙТТАЙ нэг төрх ══════════
   Өмнө нь эдгээр хуудас (Google-ээс орж ирдэг анхны дэлгэц) бичвэр лого, өөр толгой,
   өөр карттай байв. Өнгө/булан/фонт нь index.html-ийн :root токентой ИЖИЛ утга.
   ⚠ Лого = /logo.png (index.html доторх base64-ийн хуулбар) — лого солигдвол хоёуланг. */
const PH_ICON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='black' stroke-width='1.4'%3E%3Crect x='3' y='4.5' width='18' height='15' rx='2.5'/%3E%3Ccircle cx='8.5' cy='9.5' r='1.6'/%3E%3Cpath d='m4 17 5-4.5 4 3.2L17 11l3 3.5'/%3E%3C/svg%3E\")";
const SHELL_CSS = `
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:"Inter",-apple-system,BlinkMacSystemFont,sans-serif; background:#FBFAF7; color:#17171B; line-height:1.6; -webkit-font-smoothing:antialiased; }
  a { color:inherit; }
  .top { background:#FBFAF7; border-bottom:1px solid #ECE9E2; }
  .top-in { max-width:1040px; margin:0 auto; padding:12px 20px; display:flex; align-items:center; gap:10px; }
  .brand { margin-right:auto; display:block; }
  .brand img { height:28px; width:auto; display:block; }
  .tbtn { display:inline-flex; align-items:center; gap:8px; height:44px; padding:0 14px; border-radius:12px; font-family:"Manrope"; font-weight:700; font-size:14px; text-decoration:none; color:#17171B; white-space:nowrap; }
  .tbtn svg { width:19px; height:19px; flex:0 0 auto; }
  .tbtn.cart { background:#0B1F3A; color:#fff; }
  .tbtn .n { background:#fff; color:#0B1F3A; border-radius:100px; min-width:22px; padding:1px 7px; font-size:12px; font-weight:800; text-align:center; }
  .wrap { max-width:1040px; margin:0 auto; padding:18px 20px 56px; }
  nav.crumb { font-size:13px; color:#5C5C63; margin-bottom:16px; }
  nav.crumb a { color:#5C5C63; text-decoration:none; }
  nav.crumb a:hover { color:#0B1F3A; text-decoration:underline; }
  h1 { font-family:"Manrope"; font-weight:800; letter-spacing:-.02em; color:#0B1F3A; line-height:1.2; }
  h2 { font-family:"Manrope"; font-size:19px; font-weight:800; color:#0B1F3A; margin:40px 0 14px; letter-spacing:-.01em; }
  .ph { position:relative; background:#FAF9F5; display:flex; align-items:center; justify-content:center; overflow:hidden; }
  .ph img { max-width:100%; max-height:100%; object-fit:contain; }
  .ph.noimg::after { content:""; position:absolute; inset:0; background:#5C5C63; opacity:.18; -webkit-mask:${PH_ICON} center/34px no-repeat; mask:${PH_ICON} center/34px no-repeat; }
  .chips { display:flex; flex-wrap:wrap; gap:7px; }
  .chips span { background:#EAEEF3; color:#0B1F3A; border-radius:100px; padding:5px 12px; font-size:12px; font-weight:600; }
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:52px; padding:0 26px; border-radius:14px; font-family:"Manrope"; font-weight:700; font-size:14px; text-decoration:none; border:1.5px solid #DDD9CF; color:#17171B; background:#fff; }
  .btn.primary { background:#E95400; border-color:#E95400; color:#fff; }
  .btn.primary:hover { background:#CF4A00; border-color:#CF4A00; }
  .btn svg { width:18px; height:18px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:22px 16px; }
  .it { position:relative; display:flex; flex-direction:column; }
  .it > a.lk { text-decoration:none; color:inherit; display:flex; flex-direction:column; flex:1; }
  .it .ph { aspect-ratio:1/1; border:1px solid #ECE9E2; border-radius:16px; margin-bottom:10px; padding:10px; background:#fff; }
  .it .nm { font-weight:600; font-size:14px; color:#17171B; line-height:1.35; margin-bottom:6px; padding-right:2px; }
  .it .pr { font-family:"Manrope"; font-weight:800; font-size:17px; color:#0B1F3A; margin-top:auto; padding-right:50px; min-height:42px; }
  .it .pr small { display:block; font-family:"Inter"; font-size:12px; font-weight:500; color:#5C5C63; }
  .it .out { color:#A83B00; font-weight:600; }
  .it .add { position:absolute; right:0; bottom:0; width:42px; height:42px; border-radius:12px; background:#E95400; color:#fff; display:flex; align-items:center; justify-content:center; text-decoration:none; box-shadow:0 6px 14px -6px rgba(233,84,0,.6); }
  .it .add svg { width:20px; height:20px; }
  .foot { background:#0B1F3A; color:#A9B7C7; text-align:center; padding:40px 20px; font-size:14px; }
  .foot .fn { font-family:"Manrope"; font-size:19px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:#fff; margin-bottom:6px; }
  .foot .ft { font-size:13px; margin-bottom:18px; }
  .foot .fc { display:flex; justify-content:center; gap:8px 24px; flex-wrap:wrap; }
  .foot a { color:inherit; text-decoration:none; }
  .foot .fr { height:1px; background:rgba(255,255,255,.10); max-width:360px; margin:22px auto 16px; }
  .foot .fy { font-size:12px; }
  @media (max-width:640px) {
    .top-in { padding:10px 16px; }
    .brand img { height:26px; }
    .tbtn { padding:0 11px; }
    .tbtn.cart .lbl { display:none; }
    .wrap { padding:14px 16px 44px; }
    .grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px 14px; }
  }
  @media (max-width:360px) { .top-in { gap:4px; padding:10px 12px; } .brand img { height:22px; } .tbtn { padding:0 8px; font-size:13px; gap:6px; } }
`;
const IC_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 11.5a16 16 0 0 0 6 6l1-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z"/></svg>';
const IC_CART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2.2l2.3 12.4a1.6 1.6 0 0 0 1.6 1.3h8.8a1.6 1.6 0 0 0 1.6-1.3L21 7H5.3"/></svg>';
const IC_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
// Сагсны тоо — үндсэн сайтын localStorage('cart')-аас. Сагсыг ЭНД өөрчлөхгүй (ганц эзэн = index.html).
const SHELL_HEAD = `<header class="top"><div class="top-in">
    <a href="/" class="brand" aria-label="M-Event — нүүр хуудас"><img src="/logo.png" alt="M-Event" width="113" height="28"></a>
    <a href="tel:+97677551010" class="tbtn">${IC_PHONE}<span>7755-1010</span></a>
    <a href="/?cart=1" class="tbtn cart" aria-label="Сагс">${IC_CART}<span class="lbl">Сагс</span><span class="n" id="cart-n">0</span></a>
  </div></header>`;
const SHELL_FOOT = `<footer class="foot">
    <div class="fn">M·Event</div>
    <div class="ft">Арга хэмжээний тоног төхөөрөмжийн түрээс</div>
    <div class="fc"><a href="tel:+97677551010">+976 7755-1010</a><a href="mailto:info@mevent.mn">info@mevent.mn</a><a href="/">Бүх бараа →</a></div>
    <div class="fr"></div>
    <div class="fy">© 2026 Эм Эвент Солюшн ХХК · <a href="/privacy/">Нууцлалын бодлого</a></div>
  </footer>
<script>try{var c=JSON.parse(localStorage.getItem('cart')||'[]'),n=0;c.forEach(function(x){n+=Number(x.qty)||0});document.getElementById('cart-n').textContent=n}catch(e){}</script>`;
// Зураг: байхгүй эсвэл ачаалагдаагүй бол эвдэрсэн тэмдэг биш, цэвэр дүрс
const phHtml = (p, eager) => /^https?:\/\//.test(p.photo || '')
  ? `<div class="ph"><img src="${esc(p.photo)}" alt="${esc(p.name)} түрээс" ${eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} onerror="this.parentNode.classList.add('noimg');this.remove()"></div>`
  : '<div class="ph noimg"></div>';
// «Сагсанд нэмэх» → үндсэн сайт ?add=<sku>-г уншиж сагсанд хийнэ (index.html `applyAddParam`)
const addHref = p => '/?add=' + encodeURIComponent(p.sku || p.id || '');
const priceUnit = p => bundleDays(p) ? bundleDays(p) + ' хоногийн үнэ' : '/хоног';
const itemCard = p => `    <div class="it">
      <a class="lk" href="/products/${p._slug}/">
        ${phHtml(p, false)}
        <div class="nm">${esc(p.name)}</div>
        <div class="pr">${fmt(p.price)}<small>${priceUnit(p)}${(p.type === 'service' || Number(p.stock) > 0) ? '' : ' <span class="out">· захиалгаар</span>'}</small></div>
      </a>
      <a class="add" href="${addHref(p)}" aria-label="${esc(p.name)} — сагсанд нэмэх" rel="nofollow">${IC_PLUS}</a>
    </div>`;

function productPage(p) {
  const url = SITE + '/products/' + p._slug + '/';
  const title = p.name + ' түрээс | Арга хэмжээний тоног төхөөрөмж түрээс | ' + BRAND;
  const desc = clampWords(p.name + ' түрээслэнэ — ' + fmt(p.price) + unitTxt(p) + '. '
    + (p.description ? clampWords(p.description, 110) + ' ' : (p.category || '') + ' ангилал. ')
    + 'Улаанбаатар доторх хүргэлт. Захиалга: 7755-1010.', 300);
  const img = /^https?:\/\//.test(p.photo || '') ? p.photo : (SITE + '/og-image.png');
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: p.name, image: img, description: p.description || (p.name + ' түрээс'),
    category: p.category || undefined, sku: p.sku || undefined, brand: { '@type': 'Brand', name: BRAND },
    offers: { '@type': 'Offer', url, price: Number(p.price) || 0, priceCurrency: 'MNT', availability: availOf(p), priceValidUntil: PRICE_VALID,
      seller: { '@type': 'Organization', name: BRAND } }
  };
  const crumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Нүүр', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: p.category || 'Бараа', item: SITE + catHref(p) },
      { '@type': 'ListItem', position: 3, name: p.name, item: url }
    ]
  };
  return `<!DOCTYPE html>
<html lang="mn">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<!-- Google Analytics (GA4) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-2S1WC92568"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-2S1WC92568');
</script>
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
<style>${SHELL_CSS}
  .pd { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:32px; align-items:start; }
  .pd > .ph { aspect-ratio:1/1; border:1px solid #ECE9E2; border-radius:20px; background:#fff; padding:20px; }
  .cat { font-size:12px; text-transform:uppercase; letter-spacing:.1em; color:#5C5C63; font-weight:600; margin-bottom:8px; }
  .cat a { text-decoration:none; }
  h1 { font-size:28px; margin-bottom:6px; }
  .sku { font-size:13px; font-weight:700; color:#0B1F3A; letter-spacing:.03em; margin-bottom:16px; }
  .pbox { background:#fff; border:1px solid #ECE9E2; border-radius:16px; padding:16px 18px; margin-bottom:14px; }
  .price { font-family:"Manrope"; font-size:30px; font-weight:800; color:#0B1F3A; line-height:1.2; }
  .price small { font-family:"Inter"; font-size:14px; font-weight:500; color:#5C5C63; }
  .note { font-size:13px; color:#5C5C63; margin-top:6px; }
  .desc { font-size:15px; color:#2A3644; margin:18px 0 22px; white-space:pre-line; }
  .acts { display:flex; gap:10px; flex-wrap:wrap; margin-top:18px; }
  .acts .btn.primary { flex:1 1 220px; }
  .bar { display:none; }
  @media (max-width:760px) {
    .pd { grid-template-columns:1fr; gap:18px; }
    .pd > .ph { aspect-ratio:4/3; border-radius:16px; }
    h1 { font-size:23px; }
    .price { font-size:26px; }
    .acts .btn.primary { display:none; }
    .acts .btn { flex:1; }
    /* Утсанд «Сагсанд нэмэх» үргэлж харагдана */
    .bar { display:flex; align-items:center; gap:12px; position:fixed; left:0; right:0; bottom:0; z-index:20; background:rgba(255,255,255,.96); -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px); border-top:1px solid #ECE9E2; padding:10px 16px calc(10px + env(safe-area-inset-bottom)); }
    .bar .bp { font-family:"Manrope"; font-weight:800; font-size:17px; color:#0B1F3A; line-height:1.2; white-space:nowrap; }
    .bar .bp small { display:block; font-family:"Inter"; font-size:12px; font-weight:500; color:#5C5C63; }
    .bar .btn { flex:1; min-height:48px; padding:0 14px; }
    .foot { padding-bottom:calc(96px + env(safe-area-inset-bottom)); }
  }
</style>
</head>
<body>
  ${SHELL_HEAD}
<div class="wrap">
  <nav class="crumb"><a href="/">Нүүр</a> › <a href="${catHref(p)}">${esc(p.category || 'Бараа')}</a> › ${esc(p.name)}</nav>
  <div class="pd">
    ${phHtml(p, true)}
    <div>
      <div class="cat"><a href="${catHref(p)}">${esc(p.category || 'Арга хэмжээний тоног төхөөрөмж')}</a></div>
      <h1>${esc(p.name)}</h1>
      ${p.sku ? `<div class="sku">${esc(p.sku)}</div>` : ''}
      <div class="pbox">
        <div class="price">${fmt(p.price)}<small> ${priceUnit(p)}</small></div>
        <div class="note">${bundleDays(p) ? 'Багцын үнэ ' + bundleDays(p) + ' хоногийг багтаасан; илүү хоног тус бүр ' + fmt(Math.round(Number(p.price) / bundleDays(p))) + '.' : '2+ хоног түрээслэвэл −20%.'} Барьцаа барааны төрлөөс хамаарна.</div>
      </div>
      <div class="chips"><span>Хот дотор хүргэлт</span><span>Ажлын 1 цагт баталгаажуулна</span><span>Өөрөө ирж авбал үнэгүй</span></div>
      <div class="acts">
        <a class="btn primary" href="${addHref(p)}" rel="nofollow">${IC_CART}Сагсанд нэмэх</a>
        <a class="btn" href="tel:+97677551010">${IC_PHONE}Утсаар захиалах</a>
      </div>
      <div class="desc">${esc(p.description || (p.name + ' түрээслэнэ. Дэлгэрэнгүй мэдээлэл, захиалгыг утсаар эсвэл онлайнаар авна уу.'))}</div>
    </div>
  </div>
${(() => {
    const c = catOfProduct[p._slug];
    const rel = c ? c.items.filter(x => x._slug !== p._slug).slice(0, 4) : [];
    return rel.length ? `  <h2>${esc(c.name)} — бусад сонголт</h2>\n  <div class="grid">\n${rel.map(itemCard).join('\n')}\n  </div>` : '';
  })()}
</div>
<div class="bar">
  <div class="bp">${fmt(p.price)}<small>${priceUnit(p)}</small></div>
  <a class="btn primary" href="${addHref(p)}" rel="nofollow">${IC_CART}Сагсанд нэмэх</a>
</div>
  ${SHELL_FOOT}
</body>
</html>`;
}

listed.forEach(p => {
  const dir = path.join(prodDir, p._slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), productPage(p));
});

/* ---------- 2b) Каталогоос хасагдсан барааны хуудсыг ХААХ ---------- */
// ⚠ 2026-09-10: 28 хуудас «сүнс» болж үлдсэн байсан. Барааг архивлах / нөөцийг 0
//   болгоход хуудас нь mevent.mn дээр 200 OK, «нөөцтэй», үнэтэйгээ үлдсээр байв —
//   хамгийн үнэтэй нь 27,720,000₮-ийн байхгүй асар. Google-ээс орж ирсэн хүн
//   залгаад «тийм бараа байхгүй» гэж сонсдог. Тоо нь ЗӨВХӨН өсдөг байсан.
//
//   Хуудсыг УСТГАХГҮЙ (Google-д индекслэгдсэн, 404 нь зэрэглэлийг унагана) —
//   оронд нь noindex + «түрээслэгдэхээ больсон» + хайлт руу заасан хуудсаар дарна.
//   Зөвхөн sku хэлбэрийн (m-NNN) хавтсыг хөнднө: хуучин нэрний slug-ууд бол
//   `build-redirects.js`-ийн шилжүүлэг тул тэдгээрийг орхино.
const TOMBSTONE_MARK = 'data-tombstone="1"';
const TOMB_STYLE = 'v2';   // загвар өөрчлөгдвөл нэмэгдүүл — хуучин хаалттай хуудсууд дахин бичигдэнэ
const isCurrentTomb = h => h.includes(TOMBSTONE_MARK) && h.includes('name="tomb-style" content="' + TOMB_STYLE + '"');
function tombstonePage(slug, msg) {
  const head = msg || 'Энэ бараа түрээслэгдэхээ больсон';
  // ⚠ noindex + canonical + data-tombstone ЗААВАЛ хэвээр (test/logic.mjs шалгана). Загвар нь сайтын бүрхүүл.
  return `<!doctype html>
<html lang="mn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(head)} — ${BRAND}</title>
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${SITE}/">
<meta ${TOMBSTONE_MARK}>
<meta name="tomb-style" content="${TOMB_STYLE}">
<meta name="theme-color" content="#0B1F3A">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Inter:wght@400;500;600&display=swap&subset=cyrillic,latin" rel="stylesheet">
<style>${SHELL_CSS}
  .gone { max-width:520px; margin:0 auto; text-align:center; padding:36px 0 8px; }
  .gone .ic { width:72px; height:72px; margin:0 auto 18px; border-radius:50%; background:#EAEEF3; color:#0B1F3A; display:flex; align-items:center; justify-content:center; }
  .gone .ic svg { width:30px; height:30px; }
  .gone h1 { font-size:22px; margin-bottom:8px; }
  .gone p { color:#5C5C63; font-size:15px; margin-bottom:22px; }
  .gone .acts { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
  .others { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
  .others a { background:#fff; border:1px solid #DDD9CF; border-radius:100px; padding:8px 15px; font-size:13px; font-weight:600; color:#0B1F3A; text-decoration:none; }
  h2 { text-align:center; }
</style>
</head>
<body>
  ${SHELL_HEAD}
<div class="wrap">
  <div class="gone">
    <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg></div>
    <h1>${esc(head)}</h1>
    <p>Төстэй бараа каталогт байж магадгүй. Доорх ангиллаас үзэх эсвэл бидэнтэй холбогдоорой.</p>
    <div class="acts">
      <a class="btn primary" href="/">Бүх бараа үзэх</a>
      <a class="btn" href="tel:+97677551010">${IC_PHONE}7755-1010</a>
    </div>
  </div>
  <h2>Ангилал</h2>
  <div class="others">
${cats.map(x => `    <a href="/turees/${x.slug}/">${esc(x.name)}</a>`).join('\n')}
  </div>
</div>
  ${SHELL_FOOT}
</body>
</html>
`;
}
const liveSlugs = new Set(listed.map(p => p._slug));
let closed = 0, alreadyClosed = 0;
for (const d of (fs.existsSync(prodDir) ? fs.readdirSync(prodDir) : [])) {
  if (!/^m-\d+/i.test(d)) continue;                 // хуучин нэрний slug — шилжүүлэг, бүү хөнд
  if (liveSlugs.has(d)) continue;                   // амьд бараа
  const f = path.join(prodDir, d, 'index.html');
  if (!fs.existsSync(f)) continue;
  if (isCurrentTomb(fs.readFileSync(f, 'utf8'))) { alreadyClosed++; continue; }
  fs.writeFileSync(f, tombstonePage(d));
  closed++;
}
if (closed) console.log(`  🔒 каталогоос хасагдсан ${closed} хуудсыг хаав (нийт хаалттай: ${closed + alreadyClosed})`);

/* ---------- 2c) turees/<slug>/index.html — ангиллын хуудас ---------- */
const CAT_CSS = SHELL_CSS + `
  h1 { font-size:30px; margin-bottom:10px; }
  .lede { font-size:15px; color:#2A3644; max-width:70ch; margin-bottom:14px; }
  .chips { margin-bottom:26px; }
  .prose { font-size:14.5px; color:#2A3644; max-width:70ch; }
  .prose li { margin-left:18px; margin-bottom:4px; }
  .others { display:flex; flex-wrap:wrap; gap:8px; }
  .others a { background:#fff; border:1px solid #DDD9CF; border-radius:100px; padding:8px 15px; font-size:13px; font-weight:600; color:#0B1F3A; text-decoration:none; }
  .cta { margin-top:20px; }
  @media (max-width:640px) { h1 { font-size:24px; } }
`;

function categoryPage(c) {
  const url = catUrl(c);
  const prices = c.items.map(p => Number(p.price) || 0).filter(n => n > 0).sort((a, b) => a - b);
  const lo = prices[0] || 0, hi = prices[prices.length - 1] || 0;
  const inStock = c.items.filter(p => p.type === 'service' || Number(p.stock) > 0).length;
  const title = c.name + ' түрээс | Улаанбаатар | ' + BRAND;
  // Тайлбар нь ДАТАНААС гарна — загварын дүүргэлт бичвэр биш. Тоо, үнэ, нөхцөл
  // нь хуудас бүрд өөр бөгөөд каталог өөрчлөгдөхөд өөрөө шинэчлэгдэнэ.
  const desc = clampWords(c.name + ' түрээслэнэ — ' + c.items.length + ' төрөл, '
    + fmt(lo) + '-өөс. Улаанбаатар доторх хүргэлт, 2+ хоногт 20% хөнгөлөлт. '
    + 'Захиалга: 7755-1010.', 300);
  const firstImg = (c.items.find(p => /^https?:\/\//.test(p.photo || '')) || {}).photo || (SITE + '/og-image.png');

  const ld = {
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: c.name + ' түрээс', description: desc, url,
    isPartOf: { '@type': 'WebSite', name: BRAND, url: SITE + '/' },
    mainEntity: {
      '@type': 'ItemList', name: c.name + ' түрээс', numberOfItems: c.items.length,
      itemListElement: c.items.map((p, i) => ({
        '@type': 'ListItem', position: i + 1,
        item: {
          '@type': 'Product', name: p.name, url: SITE + '/products/' + p._slug + '/',
          image: /^https?:\/\//.test(p.photo || '') ? p.photo : undefined,
          offers: { '@type': 'Offer', price: Number(p.price) || 0, priceCurrency: 'MNT', availability: availOf(p), url: SITE + '/products/' + p._slug + '/' }
        }
      }))
    }
  };
  const crumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Нүүр', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: c.name + ' түрээс', item: url }
    ]
  };
  const others = cats.filter(x => x.slug !== c.slug);

  return `<!DOCTYPE html>
<html lang="mn">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<!-- Google Analytics (GA4) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-2S1WC92568"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-2S1WC92568');
</script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(c.name + ' түрээс | ' + BRAND)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${esc(firstImg)}" />
<meta property="og:url" content="${url}" />
<meta name="theme-color" content="#0B1F3A" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Inter:wght@400;500;600&display=swap&subset=cyrillic,latin" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
<style>${CAT_CSS}</style>
</head>
<body>
  ${SHELL_HEAD}
<div class="wrap">
  <nav class="crumb"><a href="/">Нүүр</a> › ${esc(c.name)} түрээс</nav>

  <h1>${esc(c.name)} түрээс</h1>
  <p class="lede">Улаанбаатар хотод ${esc(c.name.toLowerCase())} түрээслэнэ. Одоогоор ${c.items.length} төрөл
  бэлэн байна${lo ? ', үнэ ' + fmt(lo) + '-өөс ' + fmt(hi) + ' хүртэл (хоногийн түрээс)' : ''}.
  Онлайнаар огноогоо сонгож захиалахад боломжит үлдэгдлийг шууд шалгана.</p>
  <div class="chips">
    <span>${c.items.length} төрөл</span>
    <span>${inStock} нь одоо бэлэн</span>
    <span>2+ хоногт −20%</span>
    <span>Хот дотор хүргэлт</span>
    <span>Ажлын 1 цагт баталгаажуулна</span>
  </div>

  <div class="grid">
${c.items.map(itemCard).join('\n')}
  </div>

  <h2>${esc(c.name)} түрээслэх нөхцөл</h2>
  <div class="prose">
    <ul>
      <li>Түрээсийн хугацаа хоногоор тооцогдоно. 2 дахь хоногоос <strong>20%</strong>, 7+ хоногт <strong>40%</strong> хүртэл хөнгөлнө.</li>
      <li>Улаанбаатар доторх хүргэлт 150,000₮-өөс. Барьцааны хэмжээ барааны төрлөөс хамаарна.</li>
      <li>Захиалга төлбөр хийгдсэнээр баталгаажна. Товлосон өдрөөс 48 цагийн өмнө цуцлах боломжтой.</li>
      <li>Огноогоо сонгоход тухайн өдрийн бодит үлдэгдэл харагдана — давхар захиалга гарахгүй.</li>
    </ul>
  </div>
  <a class="btn primary cta" href="/?cat=${encodeURIComponent(c.name)}">${esc(c.name)} үзэх, захиалах →</a>

  <h2>Бусад ангилал</h2>
  <div class="others">
${others.map(x => `    <a href="/turees/${x.slug}/">${esc(x.name)}</a>`).join('\n')}
  </div>

</div>
  ${SHELL_FOOT}
</body>
</html>`;
}

const catDir = path.join(ROOT, 'turees');
fs.mkdirSync(catDir, { recursive: true });
cats.forEach(c => {
  const d = path.join(catDir, c.slug);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), categoryPage(c));
});
// Ангилал хоосорвол (бараа нь хасагдсан, эсвэл CAT_MIN_ITEMS-ээс доош унасан)
// хуудсыг УСТГАХГҮЙ — барааны хуудастай ижил бодлого: noindex + нүүр рүү заана.
// Устгавал Google-д индекслэгдсэн URL 404 болж зэрэглэл унана.
const liveCatSlugs = new Set(cats.map(c => c.slug));
let catClosed = 0;
for (const d of fs.readdirSync(catDir)) {
  if (liveCatSlugs.has(d)) continue;
  const f = path.join(catDir, d, 'index.html');
  if (!fs.existsSync(f)) continue;
  if (isCurrentTomb(fs.readFileSync(f, 'utf8'))) continue;
  fs.writeFileSync(f, tombstonePage(d, 'Энэ ангилал одоогоор түрээслэгдэхгүй байна'));
  catClosed++;
}
if (catClosed) console.log(`  🔒 хоосорсон ${catClosed} ангиллын хуудсыг хаав`);

/* ---------- 3) sitemap.xml + robots.txt ---------- */
const today = new Date().toISOString().slice(0, 10);
let sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + '  <url><loc>' + SITE + '/</loc><lastmod>' + today + '</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n';
// ⚠ stage-3d.html ЗОРИУД sitemap-д БАЙХГҮЙ — сайтаас холбоос нь хасагдсан тул
// хайлтаас орж ирсэн хүн буцах замгүй хуудсанд гацна. Файл нь байрандаа хэвээр:
// дахин ашиглах бол толгойн товч + энэ мөрийг хоёуланг нь буцааж нэм.
// Ангиллын хуудас нь барааны хуудаснаас ДЭЭГҮҮР (0.9) — хайлтын хэмжээ тэнд байна.
cats.forEach(c => {
  sm += '  <url><loc>' + catUrl(c) + '</loc><lastmod>' + today + '</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>\n';
});
listed.forEach(p => {
  sm += '  <url><loc>' + SITE + '/products/' + p._slug + '/</loc><lastmod>' + today + '</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n';
});
sm += '</urlset>\n';
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sm);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + '/sitemap.xml\n');

console.log('✅ SEO бэлэн: ' + listed.length + ' бараа → index JSON-LD+noscript, '
  + listed.length + ' бүтээгдэхүүний хуудас, ' + cats.length + ' ангиллын хуудас ('
  + cats.map(c => c.slug).join(', ') + '), sitemap.xml (' + (listed.length + cats.length + 2)
  + ' URL), robots.txt');
