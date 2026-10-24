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

/* ── 16b. БАГЦЫН КАРТ — багц нь энгийн бараатай ЯЛГАГДАНА (2026-10-24, CEO) ───────────────
   Багц = хэд хэдэн бараа нэг үнээр. Картаас нэг харцаар: «📦 Багц» тэмдэг, «дотор нь» мөр, «багц» нэгж.
   Эс бөгөөс «4-6 хүний өвлийн майхан зуухтай багц 390,000₮» нь нэг үнэтэй майхан мэт харагдана. */
const cd = createContext({ state: null, fmt: (n) => String(n), asarInfo: () => null });
runInContext('const BUNDLE_DAYS_MAX = 30;', cd);
for (const fn of ['escapeHtml', '_prodOfItem', 'bookedForProduct', 'availStock', 'stockBadgeHtml', 'packageParts', 'productBundleDays', 'priceUnitFor', 'cardHtml']) runInContext(extractFn(fn), cd);
runInContext("const _normName = (s) => String(s || '').toLowerCase().replace(/\\s+/g, ' ').trim();", cd);
const C_TENT = { sku: 'M-089', id: 'u1', name: 'Өвлийн майхан 4-6 хүний', type: 'rental', stock: 21, price: 132000 };
const C_BED = { sku: 'M-064', id: 'u2', name: 'Аяны ор', type: 'rental', stock: 557, price: 27500 };
const C_STOVE = { sku: 'M-060', id: 'u3', name: 'Аяны зуух', type: 'rental', stock: 21, price: 44000 };
const C_PKG = { sku: 'M-328', id: 'u4', name: '4-6 хүний өвлийн майхан зуухтай багц', type: 'package', stock: 0, price: 390000,
  bundle_items: [{ sku: 'M-089', qty: 1 }, { sku: 'M-064', qty: 4 }, { sku: 'M-060', qty: 1 }] };
cd.state = { products: [C_TENT, C_BED, C_STOVE, C_PKG], orders: [], dates: {}, availOk: true, cart: [] };
eq('багц: бүрэлдэхүүн нэр, тоотой', JSON.stringify(cd.packageParts(C_PKG)), JSON.stringify([{ qty: 1, name: 'Өвлийн майхан 4-6 хүний' }, { qty: 4, name: 'Аяны ор' }, { qty: 1, name: 'Аяны зуух' }]));
eq('багц: бараанд бүрэлдэхүүн байхгүй', cd.packageParts(C_TENT).length, 0);
eq('багц: хоосон оролт унахгүй', cd.packageParts(null).length, 0);
eq('багц: каталогт олдохгүй бүрэлдэхүүнийг орхино', cd.packageParts({ type: 'package', bundle_items: [{ sku: 'M-064', qty: 2 }, { sku: 'ALGA', qty: 1 }] }).length, 1);
const cardPkg = cd.cardHtml(C_PKG, 0), cardGood = cd.cardHtml(C_TENT, 0);
ok('багц карт: «Багц» тэмдэг зургийн буланд', /class="card-pkg-badge"/.test(cardPkg) && /Багц<\/span>/.test(cardPkg));
ok('багц карт: «дотор нь» мөр (3 зүйл, тоотой нэр)', /class="card-bundle"[^>]*>3 зүйл: Өвлийн майхан 4-6 хүний · 4× Аяны ор · Аяны зуух/.test(cardPkg), cardPkg.match(/card-bundle[^<]*/)?.[0]);
ok('багц карт: нөөцийн нэгж «багц» (ш БИШ)', /21 багц боломжтой/.test(cardPkg) && !/ш боломжтой/.test(cardPkg), cardPkg.match(/stock-badge[^<]*</)?.[0]);
ok('багц карт: хандалтын шошго «(багц)»', /aria-label="4-6 хүний өвлийн майхан зуухтай багц \(багц\)/.test(cardPkg));
ok('энгийн бараа: тэмдэг, «дотор нь» мөр БАЙХГҮЙ', !/card-pkg-badge/.test(cardGood) && !/card-bundle/.test(cardGood));
ok('энгийн бараа: «ш боломжтой» хэвээр', /21ш боломжтой/.test(cardGood), cardGood.match(/stock-badge[^<]*</)?.[0]);
ok('багц карт: бичлэгтэй бол тэмдэг ДАВХЦАХГҮЙ (CSS-ээр доош)', /\.card-pkg-badge \+ \.card-video-badge \{ top: 40px; \}/.test(SRC) && cd.cardHtml({ ...C_PKG, media_url: 'https://x/y.mp4' }, 0).indexOf('card-pkg-badge') < cd.cardHtml({ ...C_PKG, media_url: 'https://x/y.mp4' }, 0).indexOf('card-video-badge'));
cd.state.products = [C_TENT, C_BED, { ...C_STOVE, stock: 0 }, C_PKG];
ok('багц карт: бүрэлдэхүүн дуусвал «Дууссан»', /stock-badge out/.test(cd.cardHtml(C_PKG, 0)));
ok('SCAN: дэлгэрэнгүй хуудас packageParts ашиглана (картын ИЖИЛ эх сурвалж)', /const parts = packageParts\(p\)\.map/.test(SRC));
ok('SCAN: «Багц» тэмдэг улбар БИШ (улбар = conversion)', /\.card-pkg-badge \{[^}]*background: var\(--brand\)/.test(SRC));

/* ── 16c. БАГЦЫН «N ХОНОГИЙН ҮНЭ» — АППЫН `itemRentLine`-тэй ЯГ ИЖИЛ (2026-10-24, CEO) ─────────────────
   Багцын үнэ N хоногийг багтаасан тогтмол дүн; илүү хоног = үнэ ÷ N; олон хоногийн авто хямдралд ороогүй.
   ⚠ Апп ба сайт ӨӨР дүн гаргавал харилцагч сайтад харсан үнээсээ өөр үнийн санал авна — тиймээс ИЖИЛ тоо тулгана. */
const bd = createContext({ state: null });
runInContext('const BUNDLE_DAYS_MAX = 30;', bd);
for (const fn of ['productBundleDays', 'itemBundleDays', 'itemRentLine', 'itemsBundleSubtotal', 'priceUnitFor']) runInContext(extractFn(fn), bd);
const TENT3 = { price: 390000, qty: 1, bdays: 3 };
eq('N хоног хүртэл үнэ тогтмол', JSON.stringify([1, 2, 3].map(d => bd.itemRentLine(TENT3, d))), JSON.stringify([390000, 390000, 390000]));
eq('илүү хоног = үнэ ÷ N', JSON.stringify([4, 5, 6, 9].map(d => bd.itemRentLine(TENT3, d))), JSON.stringify([520000, 650000, 780000, 1170000]));
eq('тоо ширхэгээр үржинэ', bd.itemRentLine({ ...TENT3, qty: 2 }, 6), 1560000);
eq('хуваагдахгүй үнэ 1₮-д бөөрөнхийлөгдөнө', bd.itemRentLine({ price: 790000, qty: 1, bdays: 3 }, 4), Math.round(790000 * 4 / 3));
for (const d of [1, 2, 5, 30]) eq('bdays-гүй мөр ӨМНӨХ ШИГ өдрийн үнэ (' + d + ' хоног)', bd.itemRentLine({ price: 27500, qty: 4 }, d), 27500 * 4 * d);
eq('N=1 нь өдрийн үнэ', bd.itemRentLine({ price: 100, qty: 2, bdays: 1 }, 3), 600);
eq('N 30-аас дээш бол 30-д хязгаарлагдана', bd.itemRentLine({ price: 100, qty: 1, bdays: 99 }, 3), 100);
eq('productBundleDays: багцын N', bd.productBundleDays({ type: 'package', bundle_days: 3 }), 3);
eq('productBundleDays: багц биш бараанд хамаарахгүй', bd.productBundleDays({ type: 'rental', bundle_days: 3 }), 0);
eq('productBundleDays: null = өдрийн үнэ', bd.productBundleDays({ type: 'package', bundle_days: null }), 0);
eq('нэгж: багц «3 хоногийн үнэ»', bd.priceUnitFor({ type: 'package', bundle_days: 3 }), '3 хоногийн үнэ');
eq('нэгж: N-гүй багц/бараа «/хоног»', bd.priceUnitFor({ type: 'package' }) + bd.priceUnitFor({ type: 'rental' }), '/хоног/хоног');
eq('багцын хэсэг тусдаа', bd.itemsBundleSubtotal([TENT3, { price: 3000, qty: 50 }], 4), 520000);
// cartTotals: авто хямдрал ЗӨВХӨН багцаас бусад мөрөнд (аппын recalc-тай ИЖИЛ: 4 хоног = 520,000 + 600,000, хямдрал 20% × 600,000)
const ct = createContext({ state: { cart: [{ ...TENT3 }, { price: 3000, qty: 50 }], dates: { start: '2026-11-01', end: '2026-11-05' }, delivery: { fee: 0 } }, parseYmd: (s) => new Date(s + 'T00:00:00Z') });
runInContext('const BUNDLE_DAYS_MAX = 30; const RENTAL_TIERS = [{ min: 30, pct: 0.55, label: "Сарын" }, { min: 7, pct: 0.40, label: "7+" }, { min: 2, pct: 0.20, label: "Олон хоногийн" }]; function offHoursCount() { return 0; } function offHoursFeeTotal() { return 0; }', ct);
for (const fn of ['productBundleDays', 'itemBundleDays', 'itemRentLine', 'itemsBundleSubtotal', 'rentalDiscount', 'diffDays', 'cartTotals']) runInContext(extractFn(fn), ct);
const t4 = ct.cartTotals();
eq('сагс: 4 хоног — дэд дүн 520,000 + 600,000', t4.subtotal, 1120000);
eq('сагс: багцын хэсэг', t4.bundleSubtotal, 520000);
eq('сагс: авто хямдрал зөвхөн багцаас бусад (600,000 × 20%)', t4.multiDayDiscount, 120000);
eq('сагс: нийт = дэд дүн − хямдрал', t4.grand, 1000000);
ct.state.dates.end = '2026-11-03';
const t2 = ct.cartTotals();
eq('сагс: 2 хоног — багц 390,000 тогтмол + сандал 300,000, хямдрал 20% × 300,000', JSON.stringify([t2.subtotal, t2.multiDayDiscount, t2.grand]), JSON.stringify([690000, 60000, 630000]));
ct.state.dates.end = '2026-11-02';
const t1 = ct.cartTotals();
eq('сагс: 1 хоног — хямдралгүй', JSON.stringify([t1.subtotal, t1.multiDayDiscount, t1.grand]), JSON.stringify([540000, 0, 540000]));
ct.state.cart = [{ price: 3000, qty: 50 }]; ct.state.dates.end = '2026-11-05';
const tn = ct.cartTotals();
eq('сагс: багцгүй сагс ӨМНӨХ ШИГ (4 хоног, 600,000 − 20%)', JSON.stringify([tn.subtotal, tn.bundleSubtotal, tn.multiDayDiscount]), JSON.stringify([600000, 0, 120000]));
// Карт: нэгж
cd.state.products = [C_TENT, C_BED, C_STOVE, { ...C_PKG, bundle_days: 3 }];
ok('карт: «3 хоногийн үнэ» (багц), «/хоног» БИШ', /3 хоногийн үнэ<\/small>/.test(cd.cardHtml(cd.state.products[3], 0)) && !/\/хоног/.test(cd.cardHtml(cd.state.products[3], 0)));
ok('карт: энгийн бараа «/хоног» хэвээр', /\/хоног<\/small>/.test(cd.cardHtml(C_TENT, 0)));
// SCAN
ok('SCAN: сайт багцын N-ийг каталогоос авна (API select-д bundle_days)', /setup_fee,bundle_days&order=name\.asc/.test(SRC));
ok('SCAN: захиалгад ⟦BD|sku|N⟧ токен бичнэ (n8n мөрийн bdays-ийг хаядаг)', /⟦BD\|\$\{p\.sku\}\|\$\{n\}⟧/.test(SRC));
ok('SCAN: сагс ба илгээх мөр itemRentLine/bdays ашиглана', /subtotal \+= itemRentLine\(x, days\)/.test(SRC) && /bdays: itemBundleDays\(x\)/.test(SRC));
ok('SCAN: `price × qty × days`-ийг гараар бичихгүй (itemRentLine дуудна)', !/x\.price \* x\.qty \* days/.test(SRC));
ok('SCAN: сагсны үнийг каталогоос дарж бичихдээ bdays-ийг ч шинэчилнэ', /if \(_bd\) x\.bdays = _bd; else delete x\.bdays;/.test(SRC));

/* ── 16d. БАГЦТАЙ ОГНОО: N хоног ӨГӨГДМӨЛӨӨР, албадахгүй (2026-10-24, CEO) ────────────────────────────
   Багцын үнэ 3 хоногт ижил тул огноо 1 хоног (өнөөдөр→маргааш) байвал хүн 3 хоногийн үнээр 1 хоног авна.
   Сагсанд багц байвал огноо N хоног болно; төгсгөлийг нэг товшилтоор солино; батлагдсан огноог ХӨНДӨХГҮЙ. */
function mkPick(cart, dates, chosen = false) {
  const store = {};
  const c = createContext({
    state: { cart, dates: { ...dates }, datesChosen: chosen, endAuto: false },
    localStorage: { setItem: (k, v) => { store[k] = v; }, getItem: (k) => store[k] ?? null, removeItem: (k) => { delete store[k]; } },
    renderDatePicker() {}, renderDateSummary() {}, renderDuration() {}, updateAvailWarn() {}, renderGrid() {}, renderCart() {}, updateDateLabels() {},
  });
  runInContext('const BUNDLE_DAYS_MAX = 30;', c);
  for (const fn of ['ymd', 'parseYmd', 'addDaysYmd', 'itemBundleDays', 'bundleStayDays', 'applyBundleStayDefault', 'refreshDateViews', 'pickDay']) runInContext(extractFn(fn), c);
  return c;
}
const PK3 = { id: 'M-328', price: 390000, qty: 1, bdays: 3 };
const dt = (c) => c.state.dates.start + '→' + c.state.dates.end;
{
  const c = mkPick([{ ...PK3 }], { start: '', end: '' });
  c.pickDay('2026-12-01');
  eq('багцтай: эхлэх өдрийг дарахад төгсгөл автоматаар +3 хоног', dt(c), '2026-12-01→2026-12-04');
  ok('багцтай: автомат сонголт «батлагдсан» тооцогдоно (хоёр огноо бий)', c.state.datesChosen === true && c.state.endAuto === 'tap');
  c.pickDay('2026-12-06');
  eq('багцтай: дараагийн нэг товшилт төгсгөлийг СОЛИНО (албадахгүй)', dt(c), '2026-12-01→2026-12-06');
  eq('багцтай: гараар сольсны дараа автомат тугийг арилгана', c.state.endAuto, false);
  c.pickDay('2026-12-10');
  eq('багцтай: гараар сонгосны дараах товшилт шинэ сонголт эхэлнэ (+3 хоног)', dt(c), '2026-12-10→2026-12-13');
  c.pickDay('2026-12-08');
  eq('багцтай: автомат төгсгөлтэй үед ӨМНӨХ өдрийг дарвал шинэ эхлэх (+3)', dt(c), '2026-12-08→2026-12-11');
  c.pickDay('2026-12-08');
  eq('багцтай: эхлэхтэй ИЖИЛ өдрийг дарвал шинэ эхлэх (төгсгөл болохгүй)', dt(c), '2026-12-08→2026-12-11');
}
{
  const c = mkPick([{ price: 3000, qty: 5 }], { start: '', end: '' });
  c.pickDay('2026-12-01');
  eq('багцгүй: хуучин зан — эхлэх өдөр, төгсгөл хоосон', dt(c), '2026-12-01→');
  eq('багцгүй: автомат туг байхгүй', c.state.endAuto, false);
  c.pickDay('2026-12-03');
  eq('багцгүй: хоёр дахь товшилт төгсгөл', dt(c), '2026-12-01→2026-12-03');
  c.pickDay('2026-12-09');
  eq('багцгүй: гурав дахь товшилт шинэ сонголт', dt(c), '2026-12-09→');
  c.pickDay('2026-12-05');
  eq('багцгүй: эрт өдөр → шинэ эхлэх (хуучин шигээ)', dt(c), '2026-12-05→');
}
eq('хоног: хэд хэдэн багцын хамгийн УРТ нь', mkPick([{ bdays: 2 }, { bdays: 5 }, { price: 1 }], {}).bundleStayDays(), 5);
eq('хоног: багцгүй сагс 0', mkPick([{ price: 1 }], {}).bundleStayDays(), 0);
{
  const c = mkPick([{ ...PK3 }], { start: '2026-12-01', end: '2026-12-02' }, false);
  ok('анхдагч: баталгаажаагүй огноо багц нэмэхэд N хоног болно', c.applyBundleStayDefault() === true && dt(c) === '2026-12-01→2026-12-04' && c.state.endAuto === 'default');
  // ⛔ Анхдагч төгсгөлтэй үед ХҮН эхлэх өдрөө сольж байна — эхний товшилт эхлэх өдөр, төгсгөл БИШ
  c.pickDay('2026-12-10');
  eq('анхдагч: анхдагч N хоногтой үед эхний товшилт шинэ ЭХЛЭХ өдөр (+3 хоног), төгсгөл БИШ', dt(c), '2026-12-10→2026-12-13');
  eq('анхдагч: тэр товшилтын дараа л «нэг товшилтоор төгсгөл солих» идэвхжинэ', c.state.endAuto, 'tap');
  const k = mkPick([{ ...PK3 }], { start: '2026-12-01', end: '2026-12-02' }, true);
  ok('анхдагч: ХҮНИЙ БАТЛАСАН огноог ХӨНДӨХГҮЙ', k.applyBundleStayDefault() === false && dt(k) === '2026-12-01→2026-12-02');
  const g = mkPick([{ price: 5, qty: 1 }], { start: '2026-12-01', end: '2026-12-02' }, false);
  ok('анхдагч: багцгүй сагсанд юу ч хийхгүй', g.applyBundleStayDefault() === false && dt(g) === '2026-12-01→2026-12-02');
  const u = mkPick([{ ...PK3 }], { start: '', end: '' }, false);
  ok('анхдагч: эхлэх огноо байхгүй бол юу ч хийхгүй (унахгүй)', u.applyBundleStayDefault() === false);
}
// Сануулга бичвэр (renderDuration)
function hintFor(cart, days) {
  const el = { innerHTML: '' };
  const c = createContext({ state: { cart, dates: { start: '2026-12-01', end: addDaysStr('2026-12-01', days) }, endAuto: false }, document: { getElementById: () => el }, fmt: (n) => Math.round(n).toLocaleString('en-US') + '₮', diffDays: () => days });
  runInContext('const BUNDLE_DAYS_MAX = 30; const RENTAL_TIERS = [{ min: 7, pct: 0.40, label: "7+" }, { min: 2, pct: 0.20, label: "Олон" }];', c);
  for (const fn of ['itemBundleDays', 'bundleStayDays', 'rentalDiscount', 'renderDuration']) runInContext(extractFn(fn), c);
  c.renderDuration();
  return el.innerHTML;
}
function addDaysStr(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
{
  const h4 = hintFor([{ ...PK3 }], 4);
  ok('сануулга: багцтай — «Багцын үнэ 3 хоног хүртэл ижил» + илүү хоногийн үнэ', /Багцын үнэ 3 хоног хүртэл ижил/.test(h4) && /илүү хоног тус бүр 130,000₮/.test(h4), h4);
  ok('сануулга: багцад «олон хоногийн хямдрал» ХУДАЛ ЗАРЛАХГҮЙ', !/олон хоногийн хямдрал орно/.test(h4) && !/20% хямдрал/.test(h4) && !/бусад бараа/.test(h4), h4);
  const h1 = hintFor([{ ...PK3 }], 1);
  ok('сануулга: 3-аас цөөн хоногт «3 хоног авч болно»', /3 хоног авч болно/.test(h1) && !/илүү хоног/.test(h1), h1);
  const h3 = hintFor([{ ...PK3 }], 3);
  ok('сануулга: яг N хоногт илүү тайлбар гарахгүй', !/илүү хоног/.test(h3) && !/авч болно/.test(h3), h3);
  const hm = hintFor([{ ...PK3 }, { price: 3000, qty: 5 }], 4);
  ok('сануулга: багц + энгийн бараа — бусад бараанд −20% гэж тусад нь', /бусад бараанд −20% олон хоногийн хямдрал/.test(hm), hm);
  const hn = hintFor([{ price: 3000, qty: 5 }], 4);
  ok('сануулга: багцгүй сагс ӨМНӨХ ШИГ', /−20% олон хоногийн хямдрал орно/.test(hn) && !/Багц/.test(hn), hn);
}
ok('SCAN: багц нэмэх, багц гаргах, алхам «dates» нээхэд огноог тааруулна', /if \(applyBundleStayDefault\(\)\) refreshDateViews\(\);/.test(SRC) && /s === 'dates' && applyBundleStayDefault\(\)/.test(SRC) && /state\.endAuto && !state\.datesChosen && !bundleStayDays\(\)/.test(SRC));
ok('SCAN: pickDay автомат төгсгөлийг зөвхөн ХҮНИЙ эхлэх товшилтын дараа солино', /state\.endAuto === 'tap' && s && e && d > parseYmd\(s\)/.test(SRC) && /state\.endAuto = 'default'/.test(SRC));

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

/* ── 18b. Ангиллын хуудас — хайлтын хэмжээ эндээс ирнэ ────────────────────── */
// ⚠ 2026-09-17: сайт 196 барааны хуудастай атлаа ангиллын хуудас 0 байв. Хүн
//   «сандал ширээ түрээс» гэж хайдаг, «3 талт матриц гэрэл» гэж хайдаггүй.
const CAT_DIR = join(ROOT, 'turees');
const smCats = [...SITEMAP.matchAll(/\/turees\/([^/]+)\//g)].map(m => m[1]);

ok('ангилал: sitemap-д ангиллын хуудас бий', smCats.length >= 10, `олдсон: ${smCats.length}`);

const catMissing = smCats.filter(s => !existsSync(join(CAT_DIR, s, 'index.html')));
ok('ангилал: sitemap-ийн бүх ангилал бодитоор байна', catMissing.length === 0, catMissing.join(', '));

// Хаягийн тогтвортой байдал: зөвхөн жижиг латин үсэг, тоо, зураас.
const badSlug = smCats.filter(s => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s));
ok('ангилал: slug нь цэвэр латин хаяг', badSlug.length === 0, badSlug.join(', '));
ok('ангилал: slug давхардаагүй', new Set(smCats).size === smCats.length);

// Хоосорсон ангиллын хуудас БАЙВАЛ хаагдсан (noindex) байх ёстой — устгавал 404.
const catDirs = existsSync(CAT_DIR) ? readdirSync(CAT_DIR)
  .filter(d => existsSync(join(CAT_DIR, d, 'index.html'))) : [];
const catGhosts = catDirs.filter(d => !smCats.includes(d)
  && !readFileSync(join(CAT_DIR, d, 'index.html'), 'utf8').includes('data-tombstone="1"'));
ok('ангилал: жагсаалтаас гарсан хуудас нээлттэй үлдээгүй', catGhosts.length === 0, catGhosts.join(', '));

// ⛔ Thin content: Google 1-2 мөртэй хуудсыг эрэмбэлэхгүй, бүр торгож ч мэднэ.
// ⚠ Байхгүй файлыг уншвал тест stack trace цацаж, дээрх шалгуурын ТОДОРХОЙ
//   мессежийг дардаг. Тиймээс байгаа хуудсыг л тоолно.
const thin = smCats.filter(s => existsSync(join(CAT_DIR, s, 'index.html')))
  .map(s => [s, (readFileSync(join(CAT_DIR, s, 'index.html'), 'utf8')
    .match(/class="it"/g) || []).length]).filter(x => x[1] < 3);
ok('ангилал: хэт цөөн барааны хуудас үүсээгүй', thin.length === 0,
  thin.map(x => x[0] + '=' + x[1]).join(', '));

// ⛔ Барааны талх үйрмэг ангиллын хуудас руу заана — заасан хуудас нь БАЙХ ёстой.
//   Эвдэрсэн дотоод холбоос нь зэрэглэл дамжуулахаа болиод 404 үүсгэнэ.
const dangling = [];
for (const d of skuDirs) {
  const h = readFileSync(join(PRODUCTS_DIR, d, 'index.html'), 'utf8');
  if (h.includes('data-tombstone="1"')) continue;
  const m = h.match(/<nav class="crumb">[\s\S]*?href="\/turees\/([^"/]+)\//);
  if (m && !existsSync(join(CAT_DIR, m[1], 'index.html'))) dangling.push(d + '→' + m[1]);
}
ok('ангилал: барааны талх үйрмэг эвдэрсэн холбоосгүй', dangling.length === 0,
  dangling.slice(0, 5).join(', '));

// ⛔ Хайлтын илэрцэд гарах тайлбар дунд үгээр тасарч БОЛОХГҮЙ.
//   2026-09-17 хүртэл `.slice(0,120)` шууд тасалж, ард нь «Улаанбаатар…» гэж
//   залгадаг байсан тул 225 барааны 116-д нь «…зориулсан өндөУлаанбаатар доторх»
//   гэж гарч байв. Хүн тэрийг хараад дардаггүй.
const cutMid = skuDirs.filter(d => {
  const m = readFileSync(join(PRODUCTS_DIR, d, 'index.html'), 'utf8')
    .match(/name="description" content="([^"]*)"/);
  return m && /[а-яёөүА-ЯЁӨҮ]Улаанбаатар/.test(m[1]);
});
ok('ангилал: meta тайлбар дунд үгээр тасраагүй', cutMid.length === 0,
  cutMid.slice(0, 5).join(', '));

// ⛔ SCAN: ангиллын slug ГАРААР бичигдсэн байх ёстой. Галиглалаар бодуулбал
//   функцийг зассан өдөр бүх амьд URL чимээгүй өөрчлөгдөж 404 болно.
ok('SCAN: ангиллын slug гараар тогтоогдсон',
  /const CAT_SLUG = \{/.test(BSEO) && /'Асар':\s*'asar'/.test(BSEO));
// SCAN: хоосорсон ангилал устгагдахгүй, хаагдана.
ok('SCAN: ангиллын хуудас устгагддаггүй',
  /tombstonePage\(d, 'Энэ ангилал/.test(BSEO) && !/rmSync[^\n]*turees/.test(BSEO));

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

// Гадны код — засах боломжгүй. Бүртгэвэл Issue үүсч жинхэнэ алдаа живнэ.
// (fp f11405417bbb: Facebook-ийн дотоод браузер өөрийн скриптээ шахаад унагасан.)
runInContext(extractFn('errIsNoise'), efp);
runInContext('var ERR_FOREIGN_SRC = ' + /^(?!https?:)[a-z][a-z0-9+.-]*:\/\//i.toString() + ';', efp);
runInContext('var ERR_FOREIGN_MSG = ' + /webkit\.messageHandlers|messageHandlers|iabjs|__fbNative/i.toString() + ';', efp);
ok('алдаа: in-app браузерын шахсан код тоохгүй (fp f11405417bbb)',
   efp.errIsNoise('Uncaught SyntaxError: Unexpected end of input', 'iabjs://iab_inner_frame_ota'));
ok('алдаа: өргөтгөлийн алдаа тоохгүй', efp.errIsNoise('x', 'chrome-extension://a/x.js'));
ok('алдаа: cross-origin «Script error.» тоохгүй', efp.errIsNoise('Script error.', ''));
ok('алдаа: манай https байрлалыг барина', !efp.errIsNoise('boom', 'https://mevent.mn/index.html'));
ok('алдаа: `/index.html:120`-г схем гэж андуурахгүй', !efp.errIsNoise('boom', '/index.html:120'));
// In-app браузер INLINE код шахдаг тул src нь манай хаяг болдог — схемээр барихгүй (fp 0f6bea95f208)
ok('алдаа: in-app браузерын гүүрийн алдаа тоохгүй (fp 0f6bea95f208)',
   efp.errIsNoise("undefined is not an object (evaluating 'window.webkit.messageHandlers')", 'https://mevent.mn/?fbclid=x'));
ok('алдаа: манай жинхэнэ алдаа шүүгдэхгүй', !efp.errIsNoise('TypeError: x is not a function', 'https://mevent.mn/index.html'));
ok('SCAN: reportErr эхлээд чимээг шүүнэ',
   /function reportErr[\s\S]{0,120}errIsNoise\(msg, src\)\) return;/.test(SRC));

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
  'm-event-site-order',    // n8n: захиалга илгээх (бичих)
]);
// ⚠ n8n `webhook/…` замыг ЗААВАЛ хамруулна. 2026-09-10-нд энэ regex зөвхөн
//   `rest/v1/…`-ийг хардаг байсан тул `webhook/mevent-products` нөөц зам тестийг
//   хууран өнгөрсөн — тэр зам 280 барааг ШҮҮЛТГҮЙ буцаадаг тул сайт шүүхээ
//   болисны дараа дотоод хөрөнгө олон нийтэд гарах нүх болж байв.
const touched = [...SRC.matchAll(/rest\/v1\/([a-z_]+)|webhook\/([a-z0-9-]+)|DB_BASE \+ '\/([a-z_]+)/g)]
  .map(m => m[1] || m[2] || m[3]);
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

// SEO хуудас Google-д ҮНЭН зарлах ёстой — «нөөцтэй» гэж хатуу бичихийг хаана.
// ⚠ Хөгжим DIAMOND (6.2сая₮) ба ULTRA (7.6сая₮) бодитоор угсрагдахгүй байхад
//   «InStock» гэж зарлагдаж байв (4 микрофон шаарддаг, 2 л байна).
ok('ГЭРЭЭ: SEO хуудас нөөцийг хатуу InStock гэж бичихгүй',
  !/availability: 'https:\/\/schema\.org\/InStock'/.test(noComments(BSEO2)));
ok('ГЭРЭЭ: нөөц харагдацын stock-оос тооцогдоно', /availOf\s*=\s*p\s*=>/.test(BSEO2));
ok('ГЭРЭЭ: priceValidUntil хатуу огноогүй',
  !/priceValidUntil: '20\d\d-\d\d-\d\d'/.test(noComments(BSEO2)));
// Багцын тооцоо сайтад давхардахаа болив — харагдац өгдөг.
ok('ГЭРЭЭ: applyProductList багцын тоог дахин бодохгүй',
  !/bundle_items/.test(noComments(extractFn('applyProductList'))));

/* ── 21. ГЭРЭЭ: алдааны хээ аппынхтай ижил (алтан утга) ──────────────────── */
// Хоёр репо нэг ижил томьёотой байх ёстой — эс бөгөөс нэг алдаа хоёр Issue болно.
// Ижил тогтмолыг аппын test/run.js-д ч бичсэн. Аль нэг тал өөрчлөгдвөл тэр тал унана.
eq('ГЭРЭЭ: errFingerprint алтан утга',
  efp.errFingerprint('boom', 'https://mevent.mn/app.js'), '0788b3feaf14');

/* ── 21b. Дүрмийн эх бичиг репод байгаа эсэх ──────────────────────────────── */
// ⚠ Харагдацын SQL зөвхөн VPS дээр байсан бол VPS дахин байгуулахад дүрэм алга
//   болно — нөөц хуулбарт ямар SQL байсныг хэн ч мэдэхгүй. `db/` фолдер нь
//   дүрмийн эх бичиг; эдгээр файл уствал эсвэл хоосорвол энэ тест унана.
{
  // SQL-ийн тайлбар нь `--` — JS-ийн `//` биш. Тайлбар доторх үг скан-тестийг
  // худал унагахгүй байх ёстой (файлын толгойд дүрмийг бүтнээр тайлбарласан).
  const noSql = (t) => String(t).replace(/--[^\n]*/g, '');
  const cat = noSql(readFileSync(join(ROOT, 'db/public_catalog.sql'), 'utf8'));
  ok('db: public_catalog.sql харагдац үүсгэдэг',
    /create or replace view public\.public_catalog/.test(cat));
  ok('db: дүрэмд үнэ 0 бараа хасагдана', /coalesce\(p\.price, 0\) > 0/.test(cat));
  ok('db: дүрэмд M-Event нөөц шалгагдана', /coalesce\(p\.qty_mevent, 0\) > 0/.test(cat));
  ok('db: багцын үлдэгдэл бүрэлдэхүүнээс бодогдоно',
    /jsonb_array_elements\(coalesce\(b\.bundle_items/.test(cat));
  ok('db: арилжааны багана харагдацад ороогүй',
    !/\bp\.cost\b|\bp\.supplier\b|\bp\.market_value\b|\bp\.purchase_date\b|\bp\.source_url\b/.test(cat));
  ok('db: катерингийн тоо дүрэмд ороогүй (CEO-гийн шийдвэр)', !/qty_catering/.test(cat));

  const cfg = noSql(readFileSync(join(ROOT, 'db/app_config_public.sql'), 'utf8'));
  ok('db: app_config_public.sql харагдац үүсгэдэг',
    /create or replace view public\.app_config_public/.test(cfg));
  // Харагдац сайтын уншдаг ЯГ тэр 3 түлхүүрийг гаргах ёстой — нэмэлт түлхүүр
  // задарвал дотоод утга нийтэд гарна.
  const keys = (cfg.match(/where key in \(([^)]+)\)/) || [])[1] || '';
  const declared = [...keys.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort();
  const used = [...new Set([...SRC.matchAll(/app_config_public\?key=eq\.([a-z_]+)/g)].map(m => m[1]))].sort();
  eq('db: харагдацын түлхүүр сайтын уншдагтай ЯГ таарна', declared.join(','), used.join(','));
}

/* ── 21c. Захиалга илгээх — ХУУРАМЧ амжилт гаргахгүй ──────────────────────── */
// ⚠ ЯГ БОЛСОН АЛДАА (2026-09-10): хариу ямар ч байсан `{}` болж хувирч,
//   `'#' + Date.now().toString(36)` гэсэн ЗОХИОМОЛ дугаар үүсгээд «Амжилттай»
//   дэлгэц гаргаж, сагсыг цэвэрлэдэг байв. n8n нь Code node унахад HTTP 200 +
//   ХООСОН бие буцаадаг (амьд шалгасан) тул захиалга чимээгүй алга болж,
//   харилцагч залгахыг хүлээж суудаг.
{
  // ЗӨВХӨН амьд салаа. `} else {` доторх «DEMO-…» нь n8n холбогдоогүй үеийн
  // локал туршилтын зам — тэнд зохиомол дугаар хэвийн.
  // ⚠ Зангуу нь `CONFIG.ORDER_URL` байх ЁСТОЙ — `const data = await r.json()` нь
  //   файлд олон удаа таарна (эхнийх нь барааны каталог татах функц).
  const _a = SRC.indexOf('if (CONFIG.ORDER_URL)');
  const sub = SRC.slice(_a, SRC.indexOf('} else {', _a));
  ok('захиалга: хариуг шалгадаг', /if \(!r\.ok \|\| data\.ok === false \|\| !num\)/.test(sub));
  ok('захиалга: зохиомол дугаар үүсгэдэггүй',
    !/Date\.now\(\)\.toString\(36\)\.toUpperCase\(\)/.test(sub), 'хуурамч дугаар буцаж ирсэн');
  ok('захиалга: амжилтгүй үед алдаа шиднэ', /throw new Error\(data\.reason/.test(sub));
  // Сагс цэвэрлэх нь ЗААВАЛ шалгалтын ДАРАА байх ёстой — эс бөгөөс алдаа гарсан ч
  // сагс алга болж харилцагч дахин захиалж чадахгүй.
  ok('захиалга: сагс цэвэрлэх нь шалгалтын дараа',
    SRC.indexOf('if (!r.ok || data.ok === false || !num)') < SRC.indexOf('state.cart = []; saveCart();'));
}

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
    asVar(/let DELIVERY_CITY_ONE_FEE = [^\n]+/);
    eq('АМЬД: хүргэлтийн нөөц үнэ тохиргоотой таарна', tCtx.DELIVERY_CITY_FEE, Number(v.delivery_city_fee));
    eq('АМЬД: км тарифын нөөц утга таарна', tCtx.DELIVERY_PER_KM, Number(v.delivery_per_km));
    eq('АМЬД: нэг талын хүргэлтийн нөөц үнэ таарна', tCtx.DELIVERY_CITY_ONE_FEE, Number(v.delivery_city_one_fee));
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

/* ── Зарын атрибуци ───────────────────────────────────────────────────────── */
// Хаанаас ирснийг URL-ээс АВТОМАТААР барина. Гараар сонгуулдаг лид суваг аппад
// 144 захиалгын 4-д нь л бөглөгдсөн байсан — тиймээс автомат байх ёстой.
const atx = createContext({ URLSearchParams, URL, Date });
runInContext(extractFn('refSource'), atx);
runInContext(extractFn('leadKeyFor'), atx);
runInContext(extractFn('parseAttrib'), atx);
runInContext(extractFn('attribToken'), atx);
runInContext(extractFn('attribFresh'), atx);

eq('атрибуци: fbclid → facebook', atx.parseAttrib('?fbclid=abc123', '2026-09-16').src, 'facebook');
eq('атрибуци: utm_source давуу', atx.parseAttrib('?fbclid=x&utm_source=google', '2026-09-16').src, 'google');
eq('атрибуци: кампанит ажил', atx.parseAttrib('?utm_source=fb&utm_campaign=asar', '2026-09-16').camp, 'asar');
// ⚠ 2026-09-17-ээс: зарын тэмдэггүй ч ИРСЭН ХУУДСААС таана. Өмнө нь ийм
//   зочин ТЭМДЭГГҮЙ үлдэж, «Google-ээс ирсэн үү, шууд орсон уу» гэдгийг
//   ХЭЗЭЭ Ч мэдэх боломжгүй байв.
eq('атрибуци: тэмдэггүй → шууд', atx.parseAttrib('?a=1', '2026-09-16', '').src, 'direct');
eq('атрибуци: тэмдэггүй нь СУЛ дохио', atx.parseAttrib('', '2026-09-16', '').weak, true);
eq('атрибуци: fbclid нь ХҮЧТЭЙ', atx.parseAttrib('?fbclid=x', '2026-09-16', '').weak, false);
eq('атрибуци: null → унахгүй', atx.parseAttrib(null, '2026-09-16', '').src, 'direct');

/* ── Ирсэн хуудсаар таних ─────────────────────────────────────────────────── */
eq('эх сурвалж: Google', atx.refSource('https://www.google.com/search?q=x'), 'google');
eq('эх сурвалж: Google MN', atx.refSource('https://www.google.mn/'), 'google');
eq('эх сурвалж: Facebook', atx.refSource('https://l.facebook.com/'), 'facebook');
eq('эх сурвалж: Instagram', atx.refSource('https://www.instagram.com/'), 'instagram');
eq('эх сурвалж: Bing → хайлт', atx.refSource('https://www.bing.com/'), 'google');
eq('эх сурвалж: хоосон → шууд', atx.refSource(''), 'direct');
eq('эх сурвалж: буруу хаяг → шууд', atx.refSource('огт хаяг биш'), 'direct');
eq('эх сурвалж: бусад сайт', atx.refSource('https://www.unegui.mn/x'), 'unegui.mn');
// ⛔ ӨӨРИЙН САЙТААС ирсэн нь эх сурвалж БИШ — дотоод шилжилт бүрд «referral»
//    гэж бичвэл бүх захиалга «mevent.mn-ээс ирсэн» болно.
eq('эх сурвалж: өөрийн сайт → тоохгүй', atx.refSource('https://mevent.mn/turees/asar/'), '');
eq('эх сурвалж: www өөрийн сайт', atx.refSource('https://www.mevent.mn/'), '');

/* ── LEAD түлхүүр аппын жагсаалттай таарна ────────────────────────────────── */
// ⛔ Танихгүй утга бичвэл аппад «мэдэхгүй» болж хамралт өсөхгүй.
eq('лид: facebook → fb', atx.leadKeyFor('facebook'), 'fb');
eq('лид: instagram → ig', atx.leadKeyFor('instagram'), 'ig');
eq('лид: google → site', atx.leadKeyFor('google'), 'site');
eq('лид: direct → site', atx.leadKeyFor('direct'), 'site');
eq('лид: танихгүй → хоосон', atx.leadKeyFor('unegui.mn'), '');

// ⛔ Токены тусгай тэмдэгт ЗААВАЛ хасагдана — эс бөгөөс note-ийн БҮХ токен
//   (⟦DLV⟧, ⟦CI⟧, ⟦RT⟧) эвдэрч аппын задлагч бүхэлдээ гажина.
const dirty = atx.parseAttrib('?utm_source=a⟦b⟧c|d', '2026-09-16');
eq('атрибуци: ⟦⟧| тэмдэгт хасагдана', dirty.src, 'abcd');
ok('атрибуци: токен цэвэр гарна', atx.attribToken(dirty).split('⟦').length === 2);

eq('атрибуци: facebook → LEAD токен ч гарна',
   atx.attribToken({ src: 'facebook', camp: 'asar', med: 'cpc' }),
   '⟦LEAD|fb⟧ ⟦ADS|facebook|asar|cpc⟧');
eq('атрибуци: google → LEAD|site',
   atx.attribToken({ src: 'google', camp: '', med: '' }), '⟦LEAD|site⟧ ⟦ADS|google||⟧');
eq('атрибуци: танихгүй эх сурвалж → зөвхөн ADS',
   atx.attribToken({ src: 'unegui.mn', camp: '', med: 'referrer' }), '⟦ADS|unegui.mn||referrer⟧');
eq('атрибуци: хоосон → токенгүй', atx.attribToken(null), '');
eq('атрибуци: эх сурвалжгүй → токенгүй', atx.attribToken({ camp: 'x' }), '');

// ⚠ Хугацаа: 30 хоногийн дотор хүчинтэй, дараа нь мартана.
ok('атрибуци: тэр өдөр хүчинтэй', atx.attribFresh({ at: '2026-09-16' }, '2026-09-16', 30));
ok('атрибуци: 30 хоногт хүчинтэй', atx.attribFresh({ at: '2026-08-17' }, '2026-09-16', 30));
ok('атрибуци: 31 хоногт хүчингүй', !atx.attribFresh({ at: '2026-08-16' }, '2026-09-16', 30));
ok('атрибуци: огноогүй → хүчингүй', !atx.attribFresh({}, '2026-09-16', 30));
ok('атрибуци: null → унахгүй', !atx.attribFresh(null, '2026-09-16', 30));

// SCAN: эхний хүрэлцээ ДАРАГДАХГҮЙ — зар дараад орсон хүн дараа нь шууд
// хаягаар ирэхэд зарын гавьяа алдагдах ёсгүй.
// ⛔ ХҮЧТЭЙ дохио (зарын тэмдэг) нь хадгалсан СУЛ дохиог ДАРЖ БИЧНЭ — эс
//    бөгөөс шууд орж үзсэн хүн «direct» гэж 30 хоног тогтож, дараа нь зар
//    дарж ирэхэд зарын гавьяа бүрмөсөн алдагдана.
ok('SCAN: хүчтэй дохио сулыг дарна',
   /cur && !cur\.weak && old && old\.weak/.test(SRC));
ok('SCAN: ирсэн хуудас уншигдана', /parseAttrib\(location\.search, today, document\.referrer\)/.test(SRC));
ok('SCAN: эхний хүрэлцээ хадгалагдана',
   /function captureAttrib[\s\S]{0,900}?if \(keepOld\) return old;/.test(SRC));
// SCAN: захиалгын note-д токен ЗААВАЛ нэмэгдэнэ (эс бөгөөс бүх ажил дэмий).
ok('SCAN: note-д атрибуци нэмэгдэнэ',
   /const _at = attribToken\(storedAttrib\(\)\);\s*\n\s*if \(_at\) s = \(s \? s \+ ' ' : ''\) \+ _at;/.test(SRC));
// SCAN: localStorage унавал сайт УНАХГҮЙ (adblock/private горим).
ok('SCAN: атрибуци сайтыг унагаахгүй',
   /function captureAttrib[\s\S]{0,1200}?catch \(e\) \{ return null; \}/.test(SRC));

/* ── Meta Pixel ───────────────────────────────────────────────────────────── */
// Pixel нь Facebook-т «хэн худалдаж авдаг вэ» гэдгийг заана. Үүнгүйгээр зар
// зөвхөн чат тоолж, хөрвөлтөөр оновчлох боломжгүй.
const fbx = createContext({ URLSearchParams, Date, RegExp, decodeURIComponent });
runInContext(extractFn('readCookie'), fbx);
runInContext(extractFn('synthFbc'), fbx);
runInContext(extractFn('fbqToken'), fbx);

eq('pixel: күүки уншина', fbx.readCookie('a=1; _fbp=fb.1.99.7; b=2', '_fbp'), 'fb.1.99.7');
eq('pixel: эхний күүки ч уншигдана', fbx.readCookie('_fbp=x; a=1', '_fbp'), 'x');
eq('pixel: байхгүй күүки → хоосон', fbx.readCookie('a=1', '_fbp'), '');
eq('pixel: хоосон мөр → унахгүй', fbx.readCookie(null, '_fbp'), '');
// ⚠ Нэрийн ХЭСЭГ таарах ёсгүй: `x_fbp` нь `_fbp` БИШ.
eq('pixel: нэрийн дундаас таарахгүй', fbx.readCookie('zz_fbp=bad; _fbp=good', '_fbp'), 'good');

eq('pixel: fbclid → fbc', fbx.synthFbc('AbC-1_2', 1700000000000), 'fb.1.1700000000000.AbC-1_2');
eq('pixel: fbclid байхгүй → хоосон', fbx.synthFbc('', 1), '');
eq('pixel: null → унахгүй', fbx.synthFbc(null, 1), '');
// ⛔ Токен эвдэх тэмдэгт ХАСАГДАНА — note-ийн бүх токен үүнээс шалтгаалж эвдэрнэ.
eq('pixel: fbc-ээс ⟦⟧| хасагдана', fbx.synthFbc('a⟦b⟧c|d', 5), 'fb.1.5.abcd');

eq('pixel: FBQ токен', fbx.fbqToken('fb.1.1.p', 'fb.1.2.c'), '⟦FBQ|fb.1.1.p|fb.1.2.c⟧');
eq('pixel: зөвхөн fbp', fbx.fbqToken('fb.1.1.p', ''), '⟦FBQ|fb.1.1.p|⟧');
eq('pixel: хоёулаа хоосон → токенгүй', fbx.fbqToken('', ''), '');
eq('pixel: null → токенгүй', fbx.fbqToken(null, null), '');
eq('pixel: токен цэвэрлэгдэнэ', fbx.fbqToken('a|b', '⟦c⟧'), '⟦FBQ|ab|c⟧');

// SCAN: Pixel үндсэн код хуудсанд БАЙХ ёстой (id-г андуурвал юу ч бүртгэгдэхгүй).
ok('SCAN: Pixel суусан', /fbq\('init','1546687400103761'\);fbq\('track','PageView'\);/.test(SRC));
// SCAN: гурван мөч бүртгэгдэнэ.
ok('SCAN: ViewContent буудаг', /fbEvent\('ViewContent', fbItem\(p\)\);/.test(SRC));
ok('SCAN: AddToCart буудаг', /fbEvent\('AddToCart', fbItem\(p\)\);/.test(SRC));
ok('SCAN: Lead буудаг', /fbEvent\('Lead',/.test(SRC));
// ⛔ Purchase-ыг САЙТААС илгээхгүй — сервер (CAPI) мөнгө орсны дараа илгээнэ.
//    Хоёуланг нь илгээвэл нэг захиалга ХОЁР удаа тоологдож зарын үр дүн
//    хоёр дахин их харагдана.
ok('SCAN: сайт Purchase илгээхгүй', !/fbEvent\('Purchase'/.test(SRC));
// ⛔ ₮ дүн Pixel рүү явуулахгүй — Meta MNT валютыг дэмждэггүй тул чимээгүй
//    хаягддаг. Дүн зөвхөн сервер талд, ам.доллар болж явна.
ok('SCAN: Pixel-д MNT дүн явуулахгүй',
   !/fbEvent\([^)]*currency/.test(SRC) && !/fbItem[\s\S]{0,200}?currency/.test(SRC));
// SCAN: note-д FBQ токен нэмэгдэнэ — эс бөгөөс CAPI хэнийг ч тулгаж чадахгүй.
ok('SCAN: note-д FBQ токен нэмэгдэнэ',
   /const _fq = fbqToken\(readCookie\(document\.cookie, '_fbp'\)/.test(SRC)
   && /if \(_fq\) s = \(s \? s \+ ' ' : ''\) \+ _fq;/.test(SRC));
// SCAN: fbq байхгүй үед сайт УНАХГҮЙ (adblock, iOS, офлайн).
ok('SCAN: Pixel сайтыг унагаахгүй',
   /function fbEvent[\s\S]{0,400}?if \(typeof fbq !== 'function'\) return;[\s\S]{0,300}?catch \(e\) \{\}/.test(SRC));

/* ── 25. NAP — хаяг/утас 4 газар ЯГ ИЖИЛ (2026-09-17) ─────────────────────── */
// Орон нутгийн хайлтад Google нь сайт дээрх хаяг/утсыг Business Profile-тайгаа
// тулгадаг. Зөрвөл «энэ ижил бизнес мөн үү?» гэж эргэлзэж эрэмбийг бууруулна.
// Хаяг index.html дотор ГУРВАН газар бичигдсэн (JSON-LD, хөл, CONFIG) тул
// нэгийг нь засаад нөгөөг мартах нь амархан — энэ тест түүнийг хаана.
const LB = (() => {
  for (const m of SRC.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { const d = JSON.parse(m[1]); if (d && d['@type'] === 'LocalBusiness') return d; } catch (_) {}
  }
  return null;
})();
ok('NAP: LocalBusiness JSON-LD байна', !!LB);

const pickupAddr = (SRC.match(/PICKUP_ADDRESS:\s*'([^']+)'/) || [])[1] || '';
const footAddr = (SRC.match(/<div class="fcontact">[\s\S]*?<span>([^<]+)<\/span>/) || [])[1] || '';
eq('NAP: хөлний хаяг = CONFIG.PICKUP_ADDRESS', footAddr.trim(), pickupAddr.trim());

// Гудамжны нэр нь бүтэн хаягт байх ёстой — «Улаанбаатар хот, БЗД» гэх мэт
// товчилсон хаяг Google-ийн бүртгэлтэй тулгагдахгүй.
const street = (LB && LB.address && LB.address.streetAddress) || '';
ok('NAP: JSON-LD-д гудамжны хаяг бий', /Ногоон зоорь/.test(street), street);
ok('NAP: JSON-LD гудамж нь CONFIG-ийн хаягт багтана',
  !!street && pickupAddr.includes(street.split(',')[0].trim()), `${street} ⊄ ${pickupAddr}`);
ok('NAP: шуудангийн код бий', !!(LB && LB.address && LB.address.postalCode));

// Газрын зургийн цэг хоёр газар — зөрвөл хүн өөр байшин руу явна.
const mapQ = (SRC.match(/PICKUP_MAP:\s*'[^']*query=([\d.]+),([\d.]+)/) || []);
if (mapQ.length === 3 && LB && LB.geo) {
  eq('NAP: JSON-LD өргөрөг = PICKUP_MAP', String(LB.geo.latitude), mapQ[1]);
  eq('NAP: JSON-LD уртраг = PICKUP_MAP', String(LB.geo.longitude), mapQ[2]);
} else {
  ok('NAP: PICKUP_MAP-д координат бий', false, 'query=lat,lng олдсонгүй');
}

// Ажлын цаг: JSON-LD нь тарифын нөөц утгатай нийцнэ (тариф нь DB-ээс ирдэг ч
// JSON-LD нь статик тул нөөц утгаас хазайвал хоёр өөр цаг зарлагдана).
const wh = (SRC.match(/let WORK_START = (\d+), WORK_END = (\d+)/) || []);
if (wh.length === 3 && LB && LB.openingHours) {
  const want = `Mo-Su ${String(wh[1]).padStart(2, '0')}:00-${String(wh[2]).padStart(2, '0')}:00`;
  eq('NAP: JSON-LD ажлын цаг = WORK_START/WORK_END', LB.openingHours, want);
}

/* ── 26. Ажлын бус цаг = ЦАГ БҮРТ (2026-10-05) ───────────────────────────── */
/* ⛔ Хавтгай «авах/өгөх бүрт» байсныг болив — 19:00-д ба 23:00-д буцаахыг ижил
   үнээр бодох нь буруу. ⚠ Аппын `offHoursSpan`-тай ЯГ ИЖИЛ томьёо байх ёстой;
   зөрвөл суваг хооронд өөр үнэ гарна. */
const ohx = createContext({ WORK_START: 9, WORK_END: 18 });
runInContext(extractFn('offHoursSpan'), ohx);
const ohSpan = (t) => runInContext(`offHoursSpan(${JSON.stringify(t)})`, ohx);
eq('бус цаг: 21:00 = 3', ohSpan('21:00'), 3);
eq('бус цаг: 07:00 = 2', ohSpan('07:00'), 2);
eq('бус цаг: 23:00 = 5', ohSpan('23:00'), 5);
eq('бус цаг: 12:00 = 0', ohSpan('12:00'), 0);
eq('бус цаг: 18:00 хил дээр = 0', ohSpan('18:00'), 0);
eq('бус цаг: 09:00 хил дээр = 0', ohSpan('09:00'), 0);
eq('бус цаг: хоосон = 0', ohSpan(''), 0);
const ohFee = (SRC.match(/OFFHOURS_FEE = (\d+)/) || [])[1];
eq('бус цаг: нөөц тариф 10,000₮/цаг (апптай ижил)', Number(ohFee), 10000);
/* ⛔ ЭХНИЙ ЦАГ ҮНЭТЭЙ (2026-10-05): 1-р цаг 20,000₮, цааш 10,000₮/цаг.
   ⚠ Аппын `offHoursFeeFor`-тэй ЯГ ИЖИЛ томьёо байх ёстой. */
const ohFirst = (SRC.match(/OFFHOURS_FIRST_FEE = (\d+)/) || [])[1];
eq('бус цаг: эхний цагийн нөөц тариф 20,000₮ (апптай ижил)', Number(ohFirst), 20000);
const ffx = createContext({ OFFHOURS_FEE: 10000, OFFHOURS_FIRST_FEE: 20000, Math });
runInContext(extractFn('offHoursFeeFor'), ffx);
const ff = (h) => runInContext(`offHoursFeeFor(${h})`, ffx);
eq('хөлс: 0 цаг = 0', ff(0), 0);
eq('хөлс: 1 цаг = 20,000', ff(1), 20000);
eq('хөлс: 3 цаг = 40,000', ff(3), 40000);
eq('хөлс: 5 цаг = 60,000', ff(5), 60000);

/* ── Дүн ──────────────────────────────────────────────────────────────────── */
if (fails.length) {
  console.log(`❌ LOGIC FAIL — ${pass} тэнцсэн, ${fails.length} унасан`);
  fails.forEach((f) => console.log('   · ' + f));
  process.exit(1);
}
console.log(`✅ LOGIC OK — ${pass} тест`);
