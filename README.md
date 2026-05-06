# M Event · Захиалгын сайт

Бэлэн ажиллагаатай вэбсайт. Зөвхөн интернетэд гаргахад л үлдсэн.

## Юу багтаж байгаа вэ

```
m-event-website/
├── index.html          ← Сайт өөрөө (1 файл, 37 КБ)
├── products.json       ← 249 барааны мэдээлэл (зураг + үнэ)
└── README.md           ← Энэ заавар
```

Сайт нь **single-page** — нэг л HTML файл. Гадаад зүйл хэрэггүй.

---

## 5 минутад GitHub Pages дээр гаргах

### 1. GitHub account авах (хэрэв байхгүй бол)

https://github.com/signup → email → username сонгох → баталгаажуулах.

### 2. Шинэ repository үүсгэх

1. https://github.com/new
2. **Repository name:** `m-event-website` (эсвэл хүссэн нэр)
3. **Public** ✅ (GitHub Pages үнэгүй ажиллахын тулд)
4. **Create repository** дарна

### 3. Файл upload хийх

Repository хуудсан дээр:

1. **"uploading an existing file"** линк дээр дарна (`Add file → Upload files`)
2. Энэ folder доторх **3 файлыг чирж** оруулна:
   - `index.html`
   - `products.json`
   - `README.md`
3. Доод талд **"Commit changes"** ногоон товч дарна

### 4. GitHub Pages идэвхжүүлэх

1. Repository хуудсаа дээр → **Settings** табыг сонго (баруун дээр)
2. Зүүн talcaps цэснээс → **Pages**
3. **Source** хэсэгт:
   - Branch: `main` сонго
   - Folder: `/ (root)` сонго
4. **Save** дарна
5. 1-2 минут хүлээгээд дээд талд ногоон самбар гарна:
   ```
   ✓ Your site is live at https://USERNAME.github.io/m-event-website/
   ```

Тэр URL л чиний сайт. Багт болон үйлчлүүлэгчдэдээ хуваалц.

---

## Custom domain (m-event.mn гэх мэт) холбох

Хэрэв чи өөрийн domain-той бол:

1. Repo → Settings → Pages → **Custom domain** хэсэгт `m-event.mn` гэж бичээд Save
2. Domain хостын DNS settings руу орж дараах CNAME record нэмнэ:
   ```
   Name:  www  (эсвэл @)
   Type:  CNAME
   Value: USERNAME.github.io
   ```
3. 30 минутын дотор `https://m-event.mn` чиний сайт болж ажиллана.

---

## Шинэ бараа нэмэх

Эхний хувилбарт `products.json` дотор бараа байна. Шинэ бараа нэмэхийн тулд:

### Хялбар хувилбар (одоохондоо)

1. `products.json`-ыг компьютер дээрээ татаж засна
2. Шинэ бараа нэмнэ:
   ```json
   {
     "id": "unique-id-12345",
     "name": "Шинэ бараа",
     "category": "Сандал",
     "type": "rental",
     "price": 5000,
     "deposit": 5000,
     "photo": "https://...",
     "description": "Дэлгэрэнгүй мэдээлэл"
   }
   ```
3. GitHub repo дээр шинэчилсэн хувилбараа upload хийнэ (хуучин дээр нь дараад солино)
4. 1 минутад сайт автомат шинэчлэгдэнэ

### Гүн хувилбар (n8n + Google Sheets)

Дараа нь n8n + Google Sheets-тэй холбож, Sheet дээр шинэ мөр нэмэхэд автомат сайт дээр гарч ирдэг болгоно. (`order.html` дотор `CONFIG.PRODUCTS_URL` талбарт n8n webhook URL оруулахад л болно.)

---

## Захиалга хүлээн авах

Одоогоор **demo mode**: сайт дээр захиалга өгөхөд console-руу log хийгээд "DEMO-XXX" дугаар буцаана. Жинхэнэ ажиллахын тулд:

1. n8n дээр захиалга хүлээн авах workflow тохируулна
2. `index.html` дотор:
   ```js
   const CONFIG = {
     PRODUCTS_URL: '',
     ORDER_URL: 'https://your-n8n.example.com/webhook/order',  ← энд оруул
     PHONE: '+976 8800-0000',
   };
   ```
3. Repo руу upload (хуучныг солино)

n8n workflow нь:
- POST хүсэлт хүлээн авна (form data + cart)
- "Санхүүгийн тайлан" Google Sheet-д шинэ мөр нэмнэ (32 баганад тохирох)
- Захиалгын дугаар буцаана
- (нэмэлт) Slack/email-ээр чамд мэдэгдэнэ

---

## Тестлэх

Browser дээр `index.html`-г double-click хий — шууд ажиллана. Зураг сайн харагдвал — амжилттай.

GitHub Pages дээр гарсныхаа дараа `https://USERNAME.github.io/m-event-website/` руу ор.

---

## Анхаарах зүйлс

- **Зургууд** одоогоор Booqable CDN-аас татагдана. Booqable subscription цуцалбал зураг алга болно. Шилжих болсон бол Google Drive рүү зөөнө.
- **Үнэ** Booqable-ийн тэр үеийн үнэ. Үнэ өөрчлөгдвөл `products.json`-г шинэчлэх ёстой.
- **Availability** (сул байгаа эсэх) шалгахгүй. Захиалга авсны дараа гар аргаар шалгана.

---

## Тусламж

- HTML/JS код засах хэрэгтэй бол → developer найзаасаа лавлах
- n8n workflow тохируулах → бид холбож өгнө

Хийсэн: Cowork mode (Anthropic Claude) · 2026/05
