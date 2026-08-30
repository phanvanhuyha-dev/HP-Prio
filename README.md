# HPPrio

Trợ lý ưu tiên hóa công việc cá nhân: nói/gõ việc cần làm, AI (Gemini) tự phân loại khẩn cấp/quan trọng theo ma trận Eisenhower, bạn duyệt và hành động. PWA, cài được lên iPhone như app thật.

Tính năng chính:
- **Trợ lý "Bé iu"**: nút nổi góc dưới màn hình, mở khung nhập việc (gõ hoặc đọc chính tả), AI phân tích rồi bạn duyệt trước khi lưu. Tên trợ lý đổi được một dòng trong `lib/branding.ts`.
- **Ma trận ưu tiên 2x2** kèm bộ lọc, mục Đã xong, Thùng rác (giữ 30 ngày), hoàn tác.
- **Chế độ tập trung (deep work)**: bấm ▶ trên một việc, chọn 15/25/50 phút, màn hình chỉ còn việc đó cùng các bước; ghi lại tổng thời gian tập trung mỗi ngày. Lưu ý: nếu khóa máy giữa phiên, đồng hồ vẫn tính đúng nhưng không có chuông khi hết giờ (giới hạn của nền tảng web, cần Vercel Pro mới đặt được push theo phút).
- **Chia bước bằng AI**: nút ✨ trên mỗi việc, AI đề xuất các bước dạng danh sách đánh dấu (checklist) trong ghi chú, bạn duyệt rồi lưu, tích dần từng bước kể cả trong lúc tập trung.

**Kiến trúc:** Next.js (App Router) + Vercel Postgres + Gemini API — 100% serverless, deploy trên Vercel.

---

## 1. Chuẩn bị tài khoản (làm 1 lần)

### 1.1. Google Cloud — OAuth + Gemini
1. Vào https://console.cloud.google.com → tạo project mới (vd "HPPrio").
2. Vào **APIs & Services > OAuth consent screen** → chọn "External" → điền tên app "HPPrio", email của anh → Save.
3. Vào **APIs & Services > Credentials** → **Create Credentials > OAuth client ID** → chọn "Web application".
   - Authorized redirect URIs, thêm 2 dòng:
     - `http://localhost:3000/api/auth/callback/google` (để test local)
     - `https://<tên-app-của-anh>.vercel.app/api/auth/callback/google` (điền sau khi deploy, xem bước 3)
   - Lưu lại **Client ID** và **Client Secret**.
4. Lấy **Gemini API key** tại https://aistudio.google.com/app/apikey → Create API key.

### 1.2. GitHub
- Tạo 1 repo trống, tên gợi ý: `hpprio`.

### 1.3. Vercel
- Đăng nhập https://vercel.com bằng GitHub.

---

## 2. Chạy thử trên máy (tùy chọn, không bắt buộc)

```bash
npm install
cp .env.example .env.local
# điền các giá trị vào .env.local (xem hướng dẫn từng biến trong file .env.example)
npx web-push generate-vapid-keys   # dán kết quả vào NEXT_PUBLIC_VAPID_PUBLIC_KEY và VAPID_PRIVATE_KEY
npm run dev
```
Mở http://localhost:3000

---

## 3. Đưa code lên GitHub

```bash
cd HP_Prio
git init
git add .
git commit -m "Khởi tạo HPPrio"
git branch -M main
git remote add origin https://github.com/<username-của-anh>/hpprio.git
git push -u origin main
```

---

## 4. Deploy trên Vercel

1. Vào https://vercel.com/new → chọn repo `hpprio` vừa push → **Import**.
2. **Trước khi bấm Deploy lần đầu**, vào tab **Storage** của project → **Create Database > Postgres** → đặt tên bất kỳ → Vercel tự động thêm các biến `POSTGRES_URL`... vào project.
3. Vào **Settings > Environment Variables**, thêm các biến còn lại (copy từ `.env.example`, điền giá trị thật):
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `OWNER_EMAIL` (email Gmail của anh — chỉ email này được phép đăng nhập)
   - `NEXTAUTH_SECRET` (chạy `openssl rand -base64 32` để tạo)
   - `NEXTAUTH_URL` → điền `https://<tên-app>.vercel.app`. Nếu chưa biết domain thì **đừng tạo biến này**, cứ để deploy xong rồi thêm sau. Tạo biến mà bỏ trống giá trị là bản build sẽ hỏng (xem mục 7).
   - `GEMINI_API_KEY`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (chạy `npx web-push generate-vapid-keys` ở máy anh)
   - `CRON_SECRET` (chuỗi bất kỳ do anh tự đặt, dùng để bảo vệ endpoint cron)

   **Bắt buộc phải điền đủ**, đặc biệt là hai khóa VAPID: thiếu chúng thì bản build trên Vercel sẽ hỏng, không phải chỉ mất tính năng thông báo. Thiếu `OWNER_EMAIL` thì app khóa toàn bộ đăng nhập (chặn mặc định cho an toàn).

   **Đừng tạo biến `GEMINI_MODEL`.** App tự chọn model dùng được: mặc định dùng bí danh `gemini-flash-latest` (Google tự trỏ sang bản mới nhất), và nếu bí danh đó hỏng thì tự hỏi Google xem key còn model nào rồi chuyển sang, không cần deploy lại. Ghim một tên phiên bản cụ thể là hỏng app sau vài tháng, vì Google liên tục ngừng cấp model cũ. Chỉ điền biến này khi cần ép dùng đúng một model nào đó.

   App cũng tự **tắt chế độ suy luận (thinking)** của model. Các model dòng 2.5 trở lên bật sẵn tính năng này, ngốn phần lớn thời gian chờ. App chỉ cần trích vài trường JSON từ một câu tiếng Việt nên không cần suy luận nhiều bước. Model nào không cho tắt thì app tự gọi lại theo mặc định.
4. Bấm **Deploy**.
5. Sau khi có domain thật (vd `hpprio-xyz.vercel.app`):
   - Quay lại Google Cloud Console, thêm redirect URI: `https://hpprio-xyz.vercel.app/api/auth/callback/google`
   - Cập nhật lại `NEXTAUTH_URL` trong Vercel = domain thật → Redeploy.
6. **Tạo bảng: không cần làm gì cả.** App tự tạo bảng và tự thêm cột còn thiếu ngay lần đầu ghi dữ liệu. Mọi câu lệnh đều chỉ cộng thêm, không xóa cột, không xóa dữ liệu.

   Muốn tạo trước bằng tay thì vẫn được, chọn một trong hai cách:

   **Cách A, dán SQL trên web (nhanh nhất, không cần cài gì):**
   - Mở database vừa tạo (trên Vercel: **Storage > Query**, hoặc trên Neon Console: **Query**)
   - **Tắt công tắc "Read-only"** nếu có
   - Mở file `scripts/schema-oneshot.sql`, copy toàn bộ, dán vào rồi bấm Run

   Phải dùng `schema-oneshot.sql` chứ không phải `schema.sql`: các trình soạn thảo SQL trên web chỉ nhận một lệnh mỗi lần, dán nhiều lệnh sẽ báo `cannot insert multiple commands into a prepared statement`. File oneshot đã bọc tất cả trong một khối `DO $$ ... $$`.

   **Cách B, chạy từ máy:**
   ```bash
   npm i -g vercel
   vercel login
   vercel link
   vercel env pull .env.local
   npm run db:init
   ```
   Lưu ý `vercel env pull` sẽ **ghi đè** `.env.local`, nên sao lưu file cũ trước nếu trong đó có giá trị chưa đưa lên Vercel.

---

## 5. Cài lên iPhone như app thật (PWA)

1. Mở domain HPPrio bằng **Safari** trên iPhone (không phải Chrome — Add to Home Screen của PWA hoạt động ổn định nhất trên Safari iOS).
2. Bấm nút **Share** (biểu tượng mũi tên đi lên) → **Add to Home Screen**.
3. Mở app từ icon vừa tạo → bấm **Bật nhắc deadline** trong app để kích hoạt Web Push.

**Lưu ý:** Web Push trên iPhone chỉ hoạt động với iOS ≥ 16.4, và **chỉ khi mở từ icon Home Screen** (mở qua tab Safari thường sẽ không nhận được thông báo).

Yêu cầu kỹ thuật để icon và chế độ toàn màn hình chạy đúng trên iOS (đã có sẵn trong code, ghi lại để sau này khỏi vô tình bỏ đi):
- Thẻ `apple-touch-icon`: iOS **không** đọc icon từ `manifest.json`. Thiếu thẻ này thì iPhone lấy ảnh chụp trang làm icon.
- Icon phải là PNG **không có kênh trong suốt**, nếu không iOS tô nền đen vào vùng trong suốt.
- `padding-top: env(safe-area-inset-top)` trên `body`: ở chế độ toàn màn hình, thanh trạng thái đè lên nội dung.

---

## 6. Về lịch chạy nhắc deadline (Cron)

File `vercel.json` đặt cron `0 1 * * *`. Vercel chạy cron theo **giờ UTC**, nên `01:00 UTC` = **8h sáng giờ Việt Nam**. Lịch này chạy 1 lần/ngày nên chạy được trên gói **Hobby (free)**.

Mỗi lần chạy, hệ thống quét các việc có deadline trong **24h tới hoặc vừa quá hạn trong 48h qua** và chưa được nhắc. Khoảng lùi 48h là để cron chạy ngày một lần không bỏ sót việc có deadline rơi vào giữa hai lần chạy.

Nếu muốn nhắc sát giờ hơn (vd mỗi giờ, `0 * * * *`), phải nâng lên **Vercel Pro**. Đặt lịch dày hơn 1 lần/ngày trên gói Hobby sẽ khiến deploy báo lỗi.

---

## 7. Kiểm tra cấu hình khi có lỗi

Đăng nhập vào app rồi mở đường dẫn `/api/health` trên domain của anh:

```
https://<domain>/api/health
```

Trang này liệt kê một lần cho biết: biến môi trường nào còn thiếu, database đã kết nối và đã tạo bảng chưa, Gemini gọi được chưa. Trường `sanSang: true` nghĩa là mọi thứ đã đủ.

Trang chỉ mở cho tài khoản đã đăng nhập và **không bao giờ hiện giá trị của biến bí mật**, chỉ hiện có hay không.

## 8. Lỗi hay gặp

### Build báo `TypeError: Invalid URL` khi prerender `/`, `/login`, `/_not-found`

Nguyên nhân: biến `NEXTAUTH_URL` được tạo trên Vercel nhưng **để trống giá trị**. next-auth đọc biến này ngay lúc nạp module và gọi `new URL("")`, làm hỏng bước prerender. Thông báo lỗi không hề nhắc tới `NEXTAUTH_URL` nên rất khó đoán.

Lưu ý: biến **không tồn tại** thì không sao, next-auth tự suy ra domain từ `VERCEL_URL`. Chỉ biến **tồn tại nhưng rỗng** mới gây lỗi, vì toán tử `??` của next-auth chỉ bỏ qua `undefined` chứ không bỏ qua chuỗi rỗng.

Cách xử lý: vào Settings > Environment Variables, xóa hẳn `NEXTAUTH_URL` hoặc điền domain thật vào, rồi Redeploy.

`next.config.mjs` đã có sẵn lớp chặn tự bỏ qua giá trị rỗng hoặc chỉ có khoảng trắng, nhưng vẫn nên đặt đúng domain thật cho môi trường Production.

### Đăng nhập Google báo `redirect_uri_mismatch`

Chưa thêm redirect URI của domain thật vào Google Cloud Console. Xem lại bước 5 ở mục 4.

### `cannot insert multiple commands into a prepared statement`

Đang dán nhiều câu lệnh SQL vào trình soạn thảo trên web. Dùng `scripts/schema-oneshot.sql` thay cho `schema.sql`, và nhớ tắt công tắc **Read-only**.

### `missing_connection_string` khi chạy `npm run db:init`

`.env.local` ở máy chưa có `POSTGRES_URL`. Biến điền trên Vercel không tự về máy, phải chạy `vercel env pull .env.local`. Hoặc đơn giản hơn là dùng Cách A ở mục 4 bước 6, tạo bảng thẳng trên web thì không cần biến ở máy.

### Nút micro không hoạt động trên iPhone

Không phải lỗi. **Safari trên iOS không hỗ trợ Web Speech API**, và mọi trình duyệt trên iPhone (kể cả Chrome) đều chạy lõi WebKit của Safari nên cũng không có.

App tự phát hiện điều này và thay nút micro bằng hướng dẫn: bấm vào ô nhập rồi chọn nút 🎤 trên **bàn phím iOS** để đọc chính tả. Cách này chất lượng tiếng Việt tốt hơn, và chạy được trong mọi ô nhập của app.

Nút micro trong app vẫn hiện bình thường trên Chrome/Edge máy tính, Safari macOS và Chrome Android.

### Đăng nhập xong bị đá về trang login

Kiểm tra `OWNER_EMAIL` đã đúng địa chỉ Gmail đang dùng để đăng nhập chưa. Biến này để trống thì app khóa toàn bộ đăng nhập.

---

## Cấu trúc project

```
app/
  page.tsx              → Dashboard chính (yêu cầu đăng nhập)
  login/page.tsx         → Trang đăng nhập Google
  api/
    auth/[...nextauth]   → Xử lý đăng nhập
    parse                → Gọi Gemini để phân tích câu nhập
    analyze               → Gọi Gemini để phân tích danh sách việc + khuyến nghị
    tasks                 → CRUD công việc
    push/subscribe        → Lưu đăng ký nhận thông báo
    cron/reminders         → Vercel Cron gọi định kỳ, gửi push nhắc deadline
components/               → UI (TaskInput, QuadrantBoard, AnalysisPanel...)
lib/                       → db.ts (Postgres), gemini.ts, auth.ts, push.ts
scripts/                   → schema.sql + script khởi tạo database
public/                    → manifest.json, service worker (sw.js), icons
```

## Giới hạn phiên bản v1 (đã thống nhất khi thiết kế)
- Chỉ 1 người dùng (khóa theo `OWNER_EMAIL`)
- Không có native iOS app (dùng PWA)
- Không tích hợp Google Calendar
- Không có thống kê xu hướng dài hạn
- Deadline chỉ được AI điền khi đủ chắc chắn — nếu mơ hồ, để trống và cần anh tự nhập tay khi duyệt
