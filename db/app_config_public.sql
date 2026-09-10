-- ═══════════════════════════════════════════════════════════════════════
-- app_config_public — сайтад ХЭРЭГТЭЙ 3 тохиргоог гаргах харагдац
-- Үүсгэсэн: 2026-09-09
--
-- ЯАГААД
-- `app_config` бүхэлдээ нийтийн (anon) эрхээр уншигддаг байсан. Дотор нь сайтад
-- огт хэрэггүй дотоод утга байв:
--   · personal_settlements — хувийн данснаас гарсан компанийн зардал (данс, дүн)
--   · writeoffs            — актласан хөрөнгө, худалдан авагч, дүнтэйгээ
--   · org_overrides        — ажилтны 8 оронтой утсаар түлхүүрлэсэн бүтэц
--   · stock_count, worker_type_overrides, rh_roi_fix, next_arrival …
--
-- Сайтад хэрэгтэй нь ердөө 3 түлхүүр. Тэдгээрийг л гаргаж, үндсэн хүснэгтийг
-- нийтээс хаасан (`db/anon-grants.sql`, chimun-tasks репод).
--
-- ⚠ Эзнийхээ эрхээр ажиллана (`security_invoker` тавиагүй) тул үндсэн хүснэгт
--    нийтэд хаалттай байсан ч энэ харагдац ажиллана.
--
-- ⚠ Сайтад ШИНЭ тохиргоо хэрэгтэй бол доорх жагсаалтад нэмнэ. Аппын шинэ
--    түлхүүр автоматаар нийтэд гарахгүй — энэ нь ЗОРИУДЫНХ.
-- ═══════════════════════════════════════════════════════════════════════

begin;

create or replace view public.app_config_public as
  select key, value, updated_at
  from public.app_config
  where key in ('tariffs', 'mevent_category_groups', 'mevent_popularity');

comment on view public.app_config_public is
  'mevent.mn уншдаг тохиргооны түлхүүрүүд. app_config нийтэд ХААЛТТАЙ (хувийн данс, актласан хөрөнгө, ажилтны утас дотор нь байдаг). Сайтад шинэ түлхүүр хэрэгтэй бол ЗӨВХӨН энд нэмнэ.';

grant select on public.app_config_public to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════
-- ШАЛГАХ:
--   Гарах ёстой 3 түлхүүр (түлхүүргүйгээр):
--     curl -sS 'https://n8n.nomaadcamp.com/db/rest/v1/app_config_public?select=key'
--   Үндсэн хүснэгт хаалттай эсэх (401 байх ёстой):
--     curl -sS -o /dev/null -w '%{http_code}\n' 'https://n8n.nomaadcamp.com/db/rest/v1/app_config?select=key'
--
-- БУЦААХ:  drop view if exists public.app_config_public;
--          grant select on public.app_config to anon;   -- ⚠ дотоод утга дахин задарна
--          notify pgrst, 'reload schema';
-- ═══════════════════════════════════════════════════════════════════════
