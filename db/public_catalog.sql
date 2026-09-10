-- ═══════════════════════════════════════════════════════════════════════
-- public_catalog — «mevent.mn дээр юу харагдах» ДҮРМИЙН ЦОРЫН ГАНЦ ЭХ СУРВАЛЖ
-- Үүсгэсэн: 2026-09-10
--
-- ДҮРЭМ (энгийнээр)
--   Нийтэд харагдах бараа = архивлаагүй + үнэтэй (0₮ биш)
--                           + (үйлчилгээ/багц ЭСВЭЛ M-Event агуулахад үлдэгдэлтэй).
--
-- ЯАГААД DB-Д БАЙХ ЁСТОЙ ВЭ
--   Энэ дүрэм өмнө нь ГУРВАН газарт ГУРВАН өөрөөр бичигдсэн байв:
--     сайт index.html · applyProductList → 196 бараа
--     build-seo.js · filter              → 190 бараа
--     апп app.js · isRentable            → 196 бараа
--   Нэгийг нь засахад нөгөө хоёр нь хоцордог. «Аппад бараа хадгалахад сайтаас
--   бараа чимээгүй алга болдог» гэсэн алдааны үндсэн шалтгаан яг энэ байсан.
--   Одоо сайт, build-seo.js, build-products-json.js гурвуулаа ЭНД уншиж,
--   өөрсдөө шүүхээ болисон. Аппад юу ч өөрчилсөн дүрэм хэвээр үлдэнэ.
--
--   ⚠ Дүрэм өөрчлөх = ЭНЭ ФАЙЛЫГ засаад ажиллуулах. Кодод шүүлт БҮҮ нэм —
--     `test/logic.mjs` түүнийг хаадаг.
--
-- ЯАГААД `type` БАГАНАД НАЙДАХГҮЙ ВЭ
--   `products.type` нь бараа хадгалах бүрд аппад автоматаар дахин тооцогддог тул
--   найдваргүй: жинхэнэ түрээсийн бараа «asset» болж хайлтаас унасан тохиолдол
--   бий (M-244 Генератор 32квт 440,000₮, M-209 Дугуй ширээ түрээс 33,000₮).
--   Жинхэнэ хамгаалалт нь `qty_mevent > 0` — компанийн дотоод хөрөнгө тэр
--   баганад байдаггүй (тэд `qty_chimun`-д байна).
--
-- КАТЕРИНГ
--   `qty_catering` ЗОРИУД хамрагдаагүй. Катерингийн 48 бараа (ширээний хэрэглэл)
--   нийтэд түрээслэгдэхгүй — CEO-гийн шийдвэр, 2026-09-10.
--
-- ЮУ ЗАДРАХГҮЙ
--   Өртөг, нийлүүлэгч, худалдан авсан огноо, зах зээлийн үнэ, салбар бүрийн тоо,
--   эвдэрсэн/засварт тоо, архивын туг — эдгээр харагдацад ОРООГҮЙ. Оронд нь
--   бодогдсон `stock` ганц багана гарна.
--
-- ГАРЦУУД
--   ⚠ `create or replace view` нь баганыг зөвхөн ТӨГСГӨЛД нэмж чаддаг. Дунд нь
--     оруулбал «cannot change name of view column» алдаа гарна. Тиймээс `photos`
--     хамгийн сүүлд байгаа — шинэ багана мөн сүүлд нэмнэ.
--   ⚠ `security_invoker`-ыг ЗОРИУД тавиагүй: харагдац эзнийхээ эрхээр `products`-ыг
--     уншина. Ингэснээр `products`-ыг нийтээс бүрэн хаасан ч сайт ажиллана.
-- ═══════════════════════════════════════════════════════════════════════

begin;

create or replace view public.public_catalog as
with base as (
  select p.sku, p.id, p.code, p.name, p.category, p.all_categories,
         p.type, p.price, p.deposit, p.description,
         p.photo, p.media_url, p.bundle_items,
         p.variant_group, p.variant_label, p.setup_fee, p.updated_at,
         p.photos,
         -- Түрээслэх боломжтой нөөц = M-Event салбарын тоо − эвдэрсэн − засварт.
         greatest(0, coalesce(p.qty_mevent, 0)
                   - coalesce(p.broken, 0)
                   - coalesce(p.maintenance, 0))::int as unit_stock
  from public.products p
  where coalesce(p.archived, false) = false
    and coalesce(p.price, 0) > 0
    and (p.type in ('service', 'package') or coalesce(p.qty_mevent, 0) > 0)
)
select b.sku, b.id, b.code, b.name, b.category, b.all_categories,
       b.type, b.price, b.deposit, b.description,
       b.photo, b.media_url, b.bundle_items,
       b.variant_group, b.variant_label, b.setup_fee, b.updated_at,
       case
         -- БАГЦ = бүтээгдэхүүн биш, бүтээгдэхүүний нийлбэр. Хадгалагдсан тоо нь
         -- бүрэлдэхүүн өөрчлөгдөхөд хоцордог тул бүрэлдэхүүнээс бодно: хамгийн
         -- дутуу бүрэлдэхүүн хэдэн багц гаргаж чадах вэ, тэр нь багцын үлдэгдэл.
         -- Бүрэлдэхүүн нь энэ харагдацад ороогүй бол (үнэ 0 болсон, нөөц дууссан)
         -- LEFT JOIN нь 0 өгч, багц зөв «дууссан» болно.
         --
         -- ⚠ Энэ тоо ОГНООНООС ХАМААРАХГҮЙ (SQL идэвхтэй түрээсийг мэдэхгүй).
         --   Сонгосон огнооны СУЛ тоог сайт `availStock`-оор бүрэлдэхүүнээс бодно.
         when b.type = 'package' then coalesce((
              select min(floor(coalesce(c2.unit_stock, 0)::numeric
                             / greatest(1, coalesce((c->>'qty')::numeric, 1))))::int
              from jsonb_array_elements(coalesce(b.bundle_items, '[]'::jsonb)) as c
              left join base c2 on c2.sku = (c->>'sku')
              where (c->>'sku') is not null
         ), 0)
         else b.unit_stock
       end as stock,
       b.photos
from base b;

comment on view public.public_catalog is
  'mevent.mn-д юу харагдахын ЦОРЫН ГАНЦ дүрэм. Сайтын index.html, build-seo.js, build-products-json.js гурвуулаа эндээс уншина. Дүрэм өөрчлөх = ЭНЭ харагдацыг өөрчлөх, кодыг БИШ. Эх хувь: m-event-website-ready/db/public_catalog.sql';

grant select on public.public_catalog to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════
-- ШАЛГАХ (2026-09-10-ны байдлаар хүлээгдэх утга):
--   1) Барааны тоо — 192:
--      curl -sS 'https://n8n.nomaadcamp.com/db/rest/v1/public_catalog?select=sku' | grep -o sku | wc -l
--   2) Багцын үлдэгдэл — Өвлийн майхан 18; MINI/MINI+/STARTER/BASIC/SILVER/GOLD/PLATINUM тус бүр 1;
--      DIAMOND ба ULTRA = 0 (4 микрофон/чанга яригч шаарддаг ч 2 л байна):
--      curl -sS 'https://n8n.nomaadcamp.com/db/rest/v1/public_catalog?select=sku,name,stock&type=eq.package'
--   3) Зургийн галерей — 200:
--      curl -sS -o /dev/null -w '%{http_code}\n' 'https://n8n.nomaadcamp.com/db/rest/v1/public_catalog?select=sku,photos&limit=1'
--   4) Арилжааны багана задраагүй — 400:
--      curl -sS -o /dev/null -w '%{http_code}\n' 'https://n8n.nomaadcamp.com/db/rest/v1/public_catalog?select=sku,cost&limit=1'
--   5) Агуулахын дотоод тоо задраагүй — 400:
--      curl -sS -o /dev/null -w '%{http_code}\n' 'https://n8n.nomaadcamp.com/db/rest/v1/public_catalog?select=sku,qty_mevent&limit=1'
--
-- БУЦААХ:  drop view if exists public.public_catalog;  notify pgrst, 'reload schema';
--   ⚠ Буцаавал сайт бараагаа ХАРУУЛАХГҮЙ болно (products.json нөөц зам л үлдэнэ).
-- ═══════════════════════════════════════════════════════════════════════
