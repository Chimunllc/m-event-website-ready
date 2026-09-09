// mevent.mn цэвэр логикийн тест — браузер, сүлжээ, гуравдагч сан ШААРДАХГҮЙ.
// index.html-ээс функцийг сугалж `vm`-д ажиллуулж шалгана.
// Ажиллуулах: node test/logic.mjs
//
// Яагаад smoke.mjs-ээс тусдаа вэ: smoke нь Playwright + амьд API шаарддаг тул
// удаан бөгөөд API унасан үед улаан болдог. Энд байгаа тестүүд датагүй тул PR
// бүрт хэдэн миллисекундэд ажиллана.

import { readFileSync } from 'fs';
import { createContext, runInContext } from 'vm';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'index.html'), 'utf8');
const SRC404 = readFileSync(join(ROOT, '404.html'), 'utf8');

let pass = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  fails.push(name + (detail ? ' — ' + detail : ''));
}
function eq(name, got, want) {
  ok(name, got === want, `хүлээсэн ${JSON.stringify(want)}, ирсэн ${JSON.stringify(got)}`);
}

/* ── index.html-ээс нэрлэсэн функцийг сугалах (хаалт тоолж) ───────────────── */
function extractFn(name, src = SRC) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('функц олдсонгүй: ' + name);
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
  }
  throw new Error('хаагдаагүй функц: ' + name);
}

/* ── index.html-ээс `const NAME = {...}` блокийг сугалах ──────────────────── */
function extractConst(name, src = SRC) {
  let at = src.indexOf('const ' + name + ' = {');
  if (at < 0) at = src.indexOf('var ' + name + ' = {');
  if (at < 0) throw new Error('тогтмол олдсонгүй: ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1) + ';';
  }
  throw new Error('хаагдаагүй тогтмол: ' + name);
}

const ctx = createContext({});
runInContext(extractConst('MN_LAT'), ctx);
for (const fn of ['ymd', 'parseYmd', 'datesExpired', 'searchKey']) runInContext(extractFn(fn), ctx);
const { ymd, datesExpired, searchKey } = ctx;

/* ── 1. Хуучирсан огноо — 2026-09 дэх бодит эвдрэл ────────────────────────── */
// Зочин 8-р сард 27–29-ийг сонгоод localStorage-д үлдээв. 9-р сарын 7-нд буцаж
// ирэхэд календарь 8-р сар дээр нээгдэж, өнгөрсөн өдрөөр үнэ бодогдож байв.
eq('хуучирсан: 08-27→08-29 бол 09-07-нд хаягдана',
  datesExpired('2026-08-27', '2026-08-29', '2026-09-07'), true);
eq('хуучирсан: эхлэл өнгөрсөн, төгсгөл ирээдүйд — мөн хаягдана',
  datesExpired('2026-09-05', '2026-09-10', '2026-09-07'), true);
eq('хүчинтэй: өнөөдөр эхэлж маргааш дуусна',
  datesExpired('2026-09-07', '2026-09-08', '2026-09-07'), false);
eq('хүчинтэй: өнөөдөр → өнөөдөр (нэг хоног)',
  datesExpired('2026-09-07', '2026-09-07', '2026-09-07'), false);
eq('хүчинтэй: ирээдүйн бүтэн муж',
  datesExpired('2026-12-24', '2026-12-26', '2026-09-07'), false);
eq('хоосон утга хуучирсан гэж тооцогдохгүй',
  datesExpired('', '', '2026-09-07'), false);
eq('зөвхөн эхлэл сонгосон, ирээдүйд',
  datesExpired('2026-10-01', '', '2026-09-07'), false);
eq('зөвхөн эхлэл сонгосон, өнгөрсөнд',
  datesExpired('2026-08-01', '', '2026-09-07'), true);
eq('он дамжсан харьцуулалт (мөрөөр биш тоогоор андуурахгүй)',
  datesExpired('2025-12-31', '2026-01-02', '2026-01-01'), true);
eq('цаг залгасан ISO мөрийг ч зөв таслана',
  datesExpired('2026-08-27T09:00:00', '2026-08-29T17:00:00', '2026-09-07'), true);

/* ── 2. ymd() нь ОРОН НУТГИЙН огноо буцаана (UTC+8 занга) ─────────────────── */
// toISOString() ашиглавал УБ-д огноо нэг өдрөөр хоцордог. [[date_timezone_gotcha]]
eq('ymd орон нутгийн огноо', ymd(new Date(2026, 8, 7, 1, 30)), '2026-09-07');
eq('ymd оны эцэс', ymd(new Date(2026, 11, 31, 23, 59)), '2026-12-31');

/* ── 3. SCAN: ачаалахад хуучирсныг заавал шалгана ─────────────────────────── */
// Энэ дуудлагыг устгавал эвдрэл чимээгүй эргэж ирнэ — тиймээс эх кодоос барина.
const bootAt = SRC.indexOf('if (!state.dates.start) state.dates.start = ymd(_today);');
const guardAt = SRC.indexOf('if (datesExpired(state.dates.start, state.dates.end,');
ok('SCAN: анхдагч огноо тавихаас ӨМНӨ хуучирсныг шалгана',
  guardAt > -1 && bootAt > -1 && guardAt < bootAt,
  `guard@${guardAt} boot@${bootAt}`);
ok('SCAN: хуучирсан үед d-chosen устгагдана (огноог дахин асууна)',
  /datesExpired\([\s\S]{0,220}?removeItem\('d-chosen'\)/.test(SRC));

/* ── 4. SCAN: календарь өнгөрсөн өдрийг сонгуулахгүй ──────────────────────── */
ok('SCAN: өнгөрсөн өдөр disabled', /cur < today \? 'disabled' : ''/.test(SRC));
ok('SCAN: «өмнөх сар» товч энэ сард хаагдана', /var atMin = \(y < today\.getFullYear\(\)\)/.test(SRC));

/* ── 5. SCAN: ангиллын тоо гридтэй ижил нэгжээр ───────────────────────────── */
// Хажуу цэс түүхий барааг (206), гарчиг картыг (159) тоолж зөрж байв.
ok('SCAN: renderCategories нь withVariants-аар тоолно',
  /function renderCategories\(\)[\s\S]{0,400}?withVariants\(state\.products\)/.test(SRC));
ok('SCAN: «Бүх бараа»-гийн тоо түүхий state.products.length БИШ',
  !/Бүх бараа<\/span><span class="count">\$\{state\.products\.length\}/.test(SRC));

/* ── 6. SCAN: сагсны тууз контентыг бүрмөсөн далдлахгүй ───────────────────── */
ok('SCAN: тууз гарахад body.fab-on тавигдана', /classList\.toggle\('fab-on'/.test(SRC));
ok('SCAN: fab-on үед хөлд доод зай нөөцөлнө', /body\.fab-on footer\s*\{[^}]*padding-bottom/.test(SRC));
// ⚠ Хөл inline style-тай байхад тэр зай дүрэм дарагдаж, хөл туузны дор үлддэг байв.
ok('SCAN: хөл inline style-гүй (класс ашиглана)', /<footer class="site-foot">/.test(SRC) && !/<footer style=/.test(SRC));

/* ── 7. SCAN: toast доод талын мөнгөн дүнг дардаггүй ──────────────────────── */
const toastCss = (SRC.match(/\.toast \{[^}]*\}/) || [''])[0];
ok('SCAN: toast дээд талд байрлана', /top:/.test(toastCss) && !/bottom:/.test(toastCss), toastCss.slice(0, 90));

/* ── 8. SCAN: толгойд утасны дугаар ИЛ ────────────────────────────────────── */
ok('SCAN: толгойн tel холбоос дугаараа бичвэрээр харуулна',
  /<a href="tel:\+97677551010"[\s\S]{0,900}?<span class="ib-num">7755-1010<\/span>/.test(SRC));
ok('SCAN: мобайлд сагсны товчны «Сагс» үг нуугдана', /\.cart-btn \.cb-lbl \{ display: none/.test(SRC));

/* ── 9. Хайлтын хэлний гүүр — латинаар бичсэн хүн 0 илэрц авдаг байв ──────── */
// Кирилл ба латин бичлэг НЭГ түлхүүрт буух ёстой.
const same = (a, b) => eq(`«${a}» ≡ «${b}»`, searchKey(a), searchKey(b));
same('сандал', 'sandal');
same('ширээ', 'shiree');
same('ширээ', 'shire');            // давхар үсэг эвлүүлнэ
same('майхан', 'maihan');
same('майхан', 'maykhan');         // kh→h, y→i
same('асар', 'asar');
same('тайз', 'tayz');
same('гэрэлтүүлэг', 'gereltuuleg');
same('генератор', 'generator');
same('хулдаас', 'huldaas');
ok('өөр үг өөр түлхүүртэй', searchKey('сандал') !== searchKey('ширээ'));
eq('хоосон утга', searchKey(''), '');
eq('цэг таслал хасагдана', searchKey('Асар 12×20 (иж бүрэн)'), searchKey('asar 1220 ij buren'));

/* ── 10. SCAN: хайлт болон огнооны урсгал ─────────────────────────────────── */
ok('SCAN: хайлт галиглалын түлхүүр ашиглана', /productSearchKey\(p\)\.includes\(qk\)/.test(SRC));
ok('SCAN: түлхүүрт тайлбар ч ордог (кирилл/латин ижил үр дүн)',
  /_skey = searchKey\([\s\S]{0,160}?p\.description/.test(SRC));
// Огноог АЧААЛАХАД асуудаг хаалт хасагдсан — зочин эхлээд бараагаа харна.
ok('SCAN: ачаалахад огнооны цонх нээгддэггүй', !/maybeAskDates/.test(SRC));
ok('SCAN: сагсанд нэмэхэд огнооны цонх руу шиддэггүй',
  !/renderGrid\(\);\s*\n\s*\/\/[^\n]*\n\s*if \(!state\.datesChosen\) \{ showDrawer\('dates'/.test(SRC));
// ⚠ Хаалт хассан ч ШААРДЛАГА хэвээр: сагс → огноо → мэдээлэл.
ok('SCAN: сагснаас огноо руу заавал ордог', /if \(!state\.cart\.length\) \{ alert\('Сагс хоосон байна'\); return; \}\s*\n\s*goStep\('dates'\);/.test(SRC));
ok('SCAN: огноо сонгоогүй бол цааш явуулахгүй',
  /if \(!state\.dates\.start \|\| !state\.dates\.end\) \{ alert\('Гарах ба буцах огноог сонгоно уу\.'\); return; \}/.test(SRC));

/* ── 11. 404 — хуучин Booqable хаягийн зөөлөн буулт ───────────────────────── */
// Google-д /products/1500w · /products/13 · /products/<uuid> хэвээр байна.
// Өмнө нь slug-ийг шууд ?q= болгож шиддэг тул 9 хаягийн 6 нь ХООСОН хайлт өгдөг байв.
const ctx404 = createContext({});
runInContext(extractConst('MN_LAT', SRC404), ctx404);
runInContext('var UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, JUNK = /^[0-9a-f]{8,}$/, UNITS = { w:"вт", kw:"квт", v:"в", m:"м", l:"л" };', ctx404);
for (const fn of ['searchKey', 'slugWords', 'candidates']) runInContext(extractFn(fn, SRC404), ctx404);

// ⚠ Хоёр файлын `searchKey` салбарлавал 404-ийн тулгалт чимээгүй зөрнө.
eq('404-ийн searchKey нь index.html-тэйгээ ЯГ ижил',
  extractFn('searchKey', SRC404).replace(/\s+/g, ' '), extractFn('searchKey').replace(/\s+/g, ' '));

eq('slug: uuid хэсгүүд хаягдана',
  ctx404.slugWords('88e720df-d68a-410a-8774-3f75dbc42866').join(','), '');
eq('slug: «300-<uuid>» → зөвхөн 300',
  ctx404.slugWords('300-64cd566d-1718-4f12-8237-107fda13e14a').join(','), '300');
eq('slug: утгатай үг үлдэнэ', ctx404.slugWords('sandal-turees').join(','), 'sandal,turees');
eq('slug: .html арилна', ctx404.slugWords('asar-12x20.html').join(','), 'asar,12x20');

// Нэгжийг кирилл болгосон хувилбар ЭХЭНД байх ёстой: «1500w» → «1500вт» → M-182
eq('нэр дэвшигч: 1500w → 1500вт эхэнд', ctx404.candidates(['1500w'])[0], '1500вт');
ok('нэр дэвшигч: урт→богино тайрна',
  ctx404.candidates(['sandal', 'turees']).indexOf('sandal turees') <
  ctx404.candidates(['sandal', 'turees']).indexOf('sandal'));
eq('«1500вт» нь M-182-ын нэртэй таарна',
  ctx404.searchKey('Хиймэл цасны машин 1500Вт').includes(ctx404.searchKey('1500вт')), true);

/* ── 12. SCAN: 404 хоосон хайлт руу болзолгүй шиддэггүй ───────────────────── */
ok('SCAN: 404 нь slug-ийг шууд ?q= болгож шиддэггүй',
  !/var dest = slug \? \('\/\?q=' \+ encodeURIComponent\(slug\)\) : '\/';/.test(SRC404));
ok('SCAN: 404 нь каталогтой тулгана', /fetch\('\/products\.json'/.test(SRC404));
ok('SCAN: ганц таарвал барааны хуудас руу', /hit\.length === 1[\s\S]{0,160}?location\.replace\('\/products\/'/.test(SRC404));
ok('SCAN: /collections/ зам ч баригдана', /products\?\|collections\?/.test(SRC404));
ok('SCAN: илэрцгүй үед 404 хуудсан дээр үлдэнэ (redirect биш)',
  /\.catch\(function \(\) \{[\s\S]{0,200}?lede\.textContent/.test(SRC404));

/* ── 13. SCAN: хуудаслалт ─────────────────────────────────────────────────── */
// 159 карт нэг дор рендерлэгдэж хуудас 28,230px (утасны ~33 дэлгэц) болдог байв.
ok('SCAN: нэг хуудсанд рендерлэх тоо тогтоосон', /const GRID_PAGE = \d+;/.test(SRC));
ok('SCAN: грид зөвхөн тухайн хуудсыг рендерлэнэ', /const page = list\.slice\(0, state\.shown\);/.test(SRC));
ok('SCAN: «Цааш үзэх» товч байна', /id="more-btn"/.test(SRC));
// ⚠ Картын onclick нь СЛАЙСЛАСАН массиваас авах ёстой — эс бөгөөс өөр бараа нээгдэнэ.
ok('SCAN: картын холбоос page[i]-ээс (list[i] БИШ)',
  /const it = page\[i\];/.test(SRC) && !/const it = list\[i\];/.test(SRC));
// Шүүлт солигдоход эхний хуудас руу буцахгүй бол «24/30» атал 96 карт харагдана.
ok('SCAN: шүүлт солигдоход хуудас 1 рүү буцна',
  /state\._gridSig[\s\S]{0,120}?state\.shown = GRID_PAGE;/.test(SRC));

/* ── Дүн ──────────────────────────────────────────────────────────────────── */
if (fails.length) {
  console.log(`❌ LOGIC FAIL — ${pass} тэнцсэн, ${fails.length} унасан`);
  fails.forEach((f) => console.log('   · ' + f));
  process.exit(1);
}
console.log(`✅ LOGIC OK — ${pass} тест`);
