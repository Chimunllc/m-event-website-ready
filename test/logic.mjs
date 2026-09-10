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

/* ── 14. Бичвэрийн шатлал — утсанд уншигдах доод хязгаар ──────────────────── */
// Өмнө нь 20 өөр хэмжээ, доод тал нь 10.5px байв (утсанд 30 элемент 12px-ээс жижиг).
const CSS = SRC.slice(SRC.indexOf('<style>'), SRC.indexOf('</style>'));
const smallPx = [...CSS.matchAll(/font-size: *([0-9.]+)px/g)].map(m => parseFloat(m[1])).filter(v => v < 18);
eq('CSS-д 18px-ээс жижиг ТҮҮХИЙ px үлдээгүй (бүгд токен)', smallPx.join(','), '');
const xs = (CSS.match(/--fs-xs: *([0-9.]+)px/) || [])[1];
ok('--fs-xs доод хязгаар 12px-ээс багагүй', Number(xs) >= 12, 'одоо ' + xs);
for (const t of ['--fs-xs', '--fs-sm', '--fs-md', '--fs-base', '--fs-input', '--fs-lg'])
  ok('токен тодорхойлогдсон: ' + t, new RegExp(t + ': *[0-9.]+px').test(CSS));
// `small` ба товч/талбар өөрийн хэмжээгүй бол браузер 83% / 13.333px болгодог.
ok('SCAN: small тодорхой хэмжээтэй', /\n  small \{ font-size: var\(--fs-/.test(CSS));
ok('SCAN: button/input тодорхой хэмжээтэй',
  /button, input, select, textarea \{ font-size: var\(--fs-/.test(CSS));

/* ── 15. SCAN: 360px блок мобайл блокийн ДАРАА байна ──────────────────────── */
// ⚠ Энэ яг болсон алдаа: 360px блокийг 720px блокийн ДУНД оруулсанд үлдсэн
// мобайл дүрмүүд (hero, хайлт, ангиллын чип) зөвхөн 360px-д үйлчилж,
// 390px дээр hero + хайлтын талбар БҮРЭН АЛГА болсон.
const at720 = CSS.indexOf('@media (max-width: 720px)');
const at360 = CSS.indexOf('@media (max-width: 360px)');
const atHero = CSS.indexOf('.m-hero { display: block; }');
ok('SCAN: 360px блок 720px блокийн дараа', at720 > -1 && at360 > at720, `720@${at720} 360@${at360}`);
ok('SCAN: мобайл hero нь 720px блок дотор (360px-д БИШ)',
  atHero > at720 && atHero < at360, `hero@${atHero}`);

/* ── 16. Сул үлдэгдэл — SKU-гаар тулгах (давхар захиалгын хамгаалалт) ────── */
// ⚠ ЯГ БОЛСОН АЛДАА (2026-09-09 аудитаар амьд датанаас олдсон):
//   Каталогт M-223 «Ширээ 8 хүний (хар)» 7ш. Идэвхтэй захиалгын мөр нь хуучин
//   нэрээрээ «Ширээ 8 хүний» гэж үлдсэн. Сайт НЭРЭЭР тулгадаг байсан тул таарахгүй
//   болж, аль хэдийн захиалагдсан 7 ширээг «бүгд сул» гэж зарж байв.
const av = createContext({ state: null });
for (const fn of ['_prodOfItem', 'bookedForProduct', 'availStock', 'stockBadgeHtml']) runInContext(extractFn(fn), av);
runInContext("const _normName = (s) => String(s || '').toLowerCase().replace(/\\s+/g, ' ').trim();", av);

const DATES = { start: '2026-09-11', end: '2026-09-14' };
function setup(products, orders, dates = DATES, availOk = true) {
  av.state = { products, orders, dates, availOk };
  return av;
}
const P_TABLE = { sku: 'M-223', id: 'uuid-223', name: 'Ширээ 8 хүний (хар)', type: 'rental', stock: 7 };

setup([P_TABLE], [{ starts_at: '2026-09-11', stops_at: '2026-09-14',
  items: [{ sku: 'M-223', name: 'Ширээ 8 хүний', qty: '2' }] }]);
eq('нэр солигдсон ч sku-гаар таарч нөөц эзэлнэ', av.availStock(P_TABLE), 5);

setup([P_TABLE], [{ starts_at: '2026-09-11', stops_at: '2026-09-14',
  items: [{ sku: 'uuid-223', name: 'огт өөр нэр', qty: '3' }] }]);
eq('хуучин UUID-гаар ч таарна', av.availStock(P_TABLE), 4);

setup([P_TABLE], [{ starts_at: '2026-09-11', stops_at: '2026-09-14',
  items: [{ name: 'Ширээ 8 хүний (хар)', qty: '1' }] }]);
eq('sku байхгүй бол нэрээр нөөц зам ажиллана', av.availStock(P_TABLE), 6);

setup([P_TABLE], [{ starts_at: '2026-09-01', stops_at: '2026-09-03',
  items: [{ sku: 'M-223', qty: '5' }] }]);
eq('огноо давхцахгүй бол хасахгүй', av.availStock(P_TABLE), 7);

setup([P_TABLE], [{ starts_at: '2026-09-11', stops_at: '2026-09-14',
  items: [{ sku: 'M-223', qty: '5' }] }], { start: '', end: '' });
eq('огноо сонгоогүй бол хасахгүй', av.availStock(P_TABLE), 7);

const P_OTHER = { sku: 'M-221', id: 'uuid-221', name: 'Ширээ 6 хүний', type: 'rental', stock: 2 };
setup([P_TABLE, P_OTHER], [{ starts_at: '2026-09-11', stops_at: '2026-09-14',
  items: [{ sku: 'M-223', name: 'Ширээ 8 хүний', qty: '2' }] }]);
eq('өөр барааны захиалга нөлөөлөхгүй', av.availStock(P_OTHER), 2);

/* Багц — бүрэлдэхүүнээрээ хязгаарлагдана, хоёр талдаа нөөц эзэлнэ */
const SPK = { sku: 'M-010', name: 'Чанга яригч', type: 'rental', stock: 4 };
const MIX = { sku: 'M-011', name: 'Пүльт', type: 'rental', stock: 1 };
const PKG = { sku: 'M-317', name: 'Хөгжим GOLD', type: 'package', stock: 9,
  bundle_items: [{ sku: 'M-010', qty: 2 }, { sku: 'M-011', qty: 1 }] };

setup([SPK, MIX, PKG], []);
eq('багцын тоо бүрэлдэхүүнээр хязгаарлагдана (өөрийн stock=9 биш)', av.availStock(PKG), 1);

setup([SPK, MIX, PKG], [{ starts_at: '2026-09-11', stops_at: '2026-09-14',
  items: [{ sku: 'M-011', qty: '1' }] }]);
eq('бүрэлдэхүүн тусад нь зарагдвал багц дуусна', av.availStock(PKG), 0);

setup([SPK, MIX, PKG], [{ starts_at: '2026-09-11', stops_at: '2026-09-14',
  items: [{ sku: 'M-317', name: 'Хөгжим GOLD', qty: '1' }] }]);
eq('багц захиалагдвал бүрэлдэхүүн нь эзлэгдэнэ', av.availStock(SPK), 2);
eq('багц захиалагдвал багц өөрөө дуусна', av.availStock(PKG), 0);

setup([SPK, MIX, { ...PKG, bundle_items: [{ sku: 'M-999', qty: 1 }] }], []);
eq('бүрэлдэхүүн каталогт байхгүй бол багц 0', av.availStock(av.state.products[2]), 0);

/* Идэвхтэй түрээс татагдаагүй бол «сул» гэж БҮҮ хэл */
setup([P_TABLE], [], DATES, false);
ok('нөөц татагдаагүй бол картан дээр ил хэлнэ',
  /шалгагдаагүй/.test(av.stockBadgeHtml(P_TABLE)), av.stockBadgeHtml(P_TABLE));
setup([P_TABLE], [], DATES, true);
ok('татагдсан үед хэвийн тоо харагдана',
  /7ш боломжтой/.test(av.stockBadgeHtml(P_TABLE)), av.stockBadgeHtml(P_TABLE));

/* SCAN: нэрээр тулгах хуучин функц эргэж ирэхгүй */
ok('SCAN: bookedFor(name) буцаж ирээгүй', !/function bookedFor\s*\(\s*name\s*\)/.test(SRC));

/* ── 17. SEO хуудас ↔ каталог зөрөх ёсгүй (сүнс хуудас, дутуу хуудас) ────── */
// ⚠ 2026-09-09 аудитаар олдсон бодит байдал: 28 хуудас каталогоос хасагдсан
//   бараанд 200 OK, «нөөцтэй», үнэтэйгээ үлдсэн (хамгийн үнэтэй нь 27,720,000₮-ийн
//   байхгүй асар); 15 бодит бараа хуудасгүй; 15 хуудасны үнэ буруу. Шалтгаан нь
//   `build-seo.js`-ийг ХҮН гараар ажиллуулдаг байсан явдал.
//   Одоо өдөр бүр автоматаар ажиллана — эдгээр тест зөрүүг барина.
import { readdirSync, existsSync } from 'fs';

const PRODUCTS_DIR = join(ROOT, 'products');
const SITEMAP = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
const smSlugs = new Set([...SITEMAP.matchAll(/\/products\/([^/]+)\//g)].map(m => m[1]));
const skuDirs = readdirSync(PRODUCTS_DIR).filter(d => /^m-\d+/i.test(d)
  && existsSync(join(PRODUCTS_DIR, d, 'index.html')));

// Хуудас бүр ЭСВЭЛ sitemap-д байна (амьд бараа), ЭСВЭЛ хаагдсан (noindex tombstone).
const ghosts = skuDirs.filter(d => {
  if (smSlugs.has(d)) return false;
  return !readFileSync(join(PRODUCTS_DIR, d, 'index.html'), 'utf8').includes('data-tombstone="1"');
});
ok('SEO: каталогт байхгүй барааны хуудас нээлттэй үлдээгүй',
  ghosts.length === 0, ghosts.slice(0, 8).join(', '));

// sitemap-д байгаа бүх хуудас диск дээр бодитоор байна (404 гарахгүй).
const missing = [...smSlugs].filter(s => !existsSync(join(PRODUCTS_DIR, s, 'index.html')));
ok('SEO: sitemap-ийн бүх хаяг бодитоор байна',
  missing.length === 0, missing.slice(0, 8).join(', '));

// Хаагдсан хуудас индексэд ОРОХГҮЙ бөгөөд sitemap-д БАЙХГҮЙ байх ёстой.
const tombs = skuDirs.filter(d =>
  readFileSync(join(PRODUCTS_DIR, d, 'index.html'), 'utf8').includes('data-tombstone="1"'));
const tombInSitemap = tombs.filter(d => smSlugs.has(d));
ok('SEO: хаагдсан хуудас sitemap-д ороогүй', tombInSitemap.length === 0, tombInSitemap.join(', '));
ok('SEO: хаагдсан хуудас бүр noindex',
  tombs.every(d => readFileSync(join(PRODUCTS_DIR, d, 'index.html'), 'utf8').includes('noindex')));

/* ── 18. SCAN: автомат build-ийн хамгаалалтууд ────────────────────────────── */
const BSEO = readFileSync(join(ROOT, 'build-seo.js'), 'utf8');
ok('SCAN: build-seo нь REQUIRE_LIVE үед хуучин snapshot руу унахгүй',
  /REQUIRE_LIVE/.test(BSEO) && /process\.exit\(1\)/.test(BSEO));
ok('SCAN: build-seo хасагдсан хуудсыг хаадаг блоктой', /data-tombstone/.test(BSEO));
const SYNC = join(ROOT, '.github/workflows/catalog-sync.yml');
ok('SCAN: өдөр тутмын каталог sync ажил байгаа', existsSync(SYNC));
ok('SCAN: sync ажил REQUIRE_LIVE-тэй ажилладаг',
  existsSync(SYNC) && /REQUIRE_LIVE/.test(readFileSync(SYNC, 'utf8')));

/* ── 19. Сайтын алдаа аппын системд урсдаг эсэх ───────────────────────────── */
// Аппын `errFingerprint`-тэй ЯГ ижил томьёо байх ёстой — эс бөгөөс нэг алдаа
// хоёр өөр хээтэй болж, GitHub дээр 2 тусдаа Issue үүснэ.
const efp = createContext({});
runInContext(extractFn('errFingerprint'), efp);
eq('алдааны хээ: тогтвортой', efp.errFingerprint('boom', 'https://mevent.mn/x.js'),
   efp.errFingerprint('boom', 'https://mevent.mn/x.js?v=9'));   // ?v= хээнд ОРОХГҮЙ
ok('алдааны хээ: 12 тэмдэгт', efp.errFingerprint('a', 'b').length === 12);
ok('алдааны хээ: өөр алдаа өөр хээтэй',
   efp.errFingerprint('a', 'b') !== efp.errFingerprint('c', 'b'));
ok('SCAN: window.error сонсогч бүртгэгдсэн', /addEventListener\('error'/.test(SRC));
ok('SCAN: unhandledrejection сонсогч бүртгэгдсэн', /addEventListener\('unhandledrejection'/.test(SRC));
ok('SCAN: алдаа мэдээлэгч өөрөө унахгүй (catch байна)',
   /function reportErr[\s\S]{0,1400}catch \(e\) \{ \/\* зориуд чимээгүй \*\/ \}/.test(SRC));

/* ── 20. ГЭРЭЭ: сайт зөвхөн НИЙТИЙН харагдацаас уншина ───────────────────── */
// ⚠ Сайт өмнө нь `products` хүснэгтээс шууд уншиж, «юу харагдах» дүрмээ ӨӨРӨӨ
//   бичдэг байсан. Тэр дүрэм аппд ба build-seo.js-д мөн тусад нь бичигдсэн тул
//   гурав зөрж, аппад бараа хадгалахад сайтаас чимээгүй алга болдог байв.
//   Одоо дүрэм DB-д (`public_catalog`) НЭГ УДАА бичигдсэн. Энэ тест сайтыг
//   хүснэгт рүү буцаж хандахаас хаана.
// Тайлбар доторх үг скан-тестийг худал унагахгүй байх ёстой.
const noComments = (t) => String(t).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const ALLOWED_ENDPOINTS = new Set([
  'public_catalog',        // каталог + сул нөөц (дүрэм DB-д)
  'public_availability',   // идэвхтэй түрээс
  'app_config_public',     // тариф / ангилал / түрээсийн давтамж
  'app_errors',            // алдааны лог (зөвхөн бичих)
]);
const touched = [...SRC.matchAll(/rest\/v1\/([a-z_]+)|DB_BASE \+ '\/([a-z_]+)/g)]
  .map(m => m[1] || m[2]);
const forbidden = [...new Set(touched)].filter(t => !ALLOWED_ENDPOINTS.has(t));
ok('ГЭРЭЭ: сайт зөвхөн нийтийн харагдацаас уншина',
  forbidden.length === 0, 'зөвшөөрөгдөөгүй: ' + forbidden.join(', '));
ok('ГЭРЭЭ: каталог public_catalog-аас татагдана', touched.includes('public_catalog'));

// Сайт өөрөө шүүхээ больсон эсэх — дүрэм давхардаж эхэлбэл барина.
const apl = extractFn('applyProductList');
ok('ГЭРЭЭ: applyProductList дахин шүүдэггүй',
  !/qty_mevent|'asset'/.test(noComments(apl)), 'шүүлт буцаж ирсэн байна');

// Build скриптүүд ч мөн харагдацаас
const BSEO2 = readFileSync(join(ROOT, 'build-seo.js'), 'utf8');
const BPJ = readFileSync(join(ROOT, 'build-products-json.js'), 'utf8');
ok('ГЭРЭЭ: build-seo public_catalog-аас уншина', /rest\/v1\/public_catalog/.test(BSEO2));
ok('ГЭРЭЭ: build-seo дахин шүүдэггүй', !/qty_mevent/.test(noComments(BSEO2)));
ok('ГЭРЭЭ: build-products-json public_catalog-аас уншина', /rest\/v1\/public_catalog/.test(BPJ));

/* ── 21. ГЭРЭЭ: алдааны хээ аппынхтай ижил (алтан утга) ──────────────────── */
// Хоёр репо нэг ижил томьёотой байх ёстой — эс бөгөөс нэг алдаа хоёр Issue болно.
// Ижил тогтмолыг аппын test/run.js-д ч бичсэн. Аль нэг тал өөрчлөгдвөл тэр тал унана.
eq('ГЭРЭЭ: errFingerprint алтан утга',
  efp.errFingerprint('boom', 'https://mevent.mn/app.js'), '0788b3feaf14');

/* ── 22. АМЬД ГЭРЭЭ: DB-тэй тулгах (сүлжээгүй бол АЛГАСНА) ───────────────── */
// ⚠ Сүлжээний саатал дээр улаан болдог тест хэдхэн хоногийн дараа үл тоомсорлогдоно.
//   Тиймээс эдгээр зөвхөн ХАРИУ ИРСЭН үед шалгана; ирээгүй бол алгасаад PR-ыг
//   зогсоохгүй. Өдөр бүрийн catalog-sync ажил амьд датаг ямар ч байсан хөнддөг.
const DB = 'https://n8n.nomaadcamp.com/db/rest/v1';
async function probe(path) {
  const r = await fetch(DB + path, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
try {
  // (а) Сайтын татдаг БҮХ багана харагдацад байгаа эсэх — багана нэр солиход шууд барина.
  const sel = (SRC.match(/public_catalog\?select=([^&']+)/) || [])[1];
  ok('АМЬД: сайтын select мөр олдов', !!sel);
  if (sel) {
    const rows = await probe('/public_catalog?select=' + sel + '&limit=1');
    ok('АМЬД: сайтын татдаг багана бүр харагдацад байна', Array.isArray(rows));
  }
  // (б) Тарифын нөөц утга амьд тохиргоотой таарах эсэх. Хоёр репо ижил нөөц утгатай
  //     байх ёстой; амьд тохиргоо бол хоёуланд нь нийтлэг ҮНЭН тул түүнтэй тулгана.
  const cfg = (await probe('/app_config_public?key=eq.tariffs&select=value'))[0];
  const v = cfg && cfg.value;
  if (v) {
    const tCtx = createContext({});
    // ⚠ vm-д `let` нь контекстийн шинж чанар БОЛДОГГҮЙ — `var` болгож оруулна.
    const asVar = (re) => runInContext(SRC.match(re)[0].replace(/^let /, 'var '), tCtx);
    asVar(/let RENTAL_TIERS = \[[\s\S]*?\];/);
    asVar(/let WORK_START = [^\n]+/);
    asVar(/let DELIVERY_CITY_FEE = [^\n]+/);
    asVar(/let DELIVERY_PER_KM = [^\n]+/);
    eq('АМЬД: хүргэлтийн нөөц үнэ тохиргоотой таарна', tCtx.DELIVERY_CITY_FEE, Number(v.delivery_city_fee));
    eq('АМЬД: км тарифын нөөц утга таарна', tCtx.DELIVERY_PER_KM, Number(v.delivery_per_km));
    eq('АМЬД: ажлын цагийн нөөц утга таарна', tCtx.WORK_START, Number(v.work_start));
    eq('АМЬД: хямдралын шатны тоо таарна', tCtx.RENTAL_TIERS.length, v.tiers.length);
    const same = tCtx.RENTAL_TIERS.every((t, i) =>
      Number(t.min) === Number(v.tiers[i].min) && Number(t.pct) === Number(v.tiers[i].pct));
    ok('АМЬД: хямдралын шатлал тохиргоотой таарна', same,
       JSON.stringify(tCtx.RENTAL_TIERS) + ' ↔ ' + JSON.stringify(v.tiers));
  }
  // (в) Харагдац хаалттай зүйлийг задлаагүй эсэх
  for (const col of ['cost', 'supplier', 'market_value']) {
    let leaked = false;
    try { await probe('/public_catalog?select=sku,' + col + '&limit=1'); leaked = true; } catch (e) { /* хүлээгдсэн */ }
    ok(`АМЬД: public_catalog «${col}»-ыг задлаагүй`, !leaked);
  }
} catch (e) {
  console.log('   ⏭ АМЬД гэрээний шалгалт алгасав (сүлжээ/DB хүрэхгүй): ' + e.message);
}

/* ── Дүн ──────────────────────────────────────────────────────────────────── */
if (fails.length) {
  console.log(`❌ LOGIC FAIL — ${pass} тэнцсэн, ${fails.length} унасан`);
  fails.forEach((f) => console.log('   · ' + f));
  process.exit(1);
}
console.log(`✅ LOGIC OK — ${pass} тест`);
