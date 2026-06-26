# SVJ.CLIPS — Product Requirements Document

(previously: CLIPSTORM.CLIPS — renamed mid-development)

## Problem Statement
SVJ adlı Kick yayıncısı için topluluk klip oylama platformu. Kullanıcılar haftalık olarak Kick klip linkleri gönderir ve topluluk oylar; Pazar 00:00 UTC reset ile haftalık leaderboard. Site Türkçe, neon yeşil + koyu tema, R3F atmosferik 3D arka plan, framer-motion scroll animasyonları.

## User Personas
- **İzleyici (Voter)**: Yayını takip eden, Telegram kanallarına üye, en iyi klipleri oylayan kullanıcı.
- **Klip Avcısı (Submitter)**: Akan yayında dikkat çeken klipleri yakalayıp paylaşan kullanıcı.
- **Yayıncı/Mod (SVJ)**: Top klipleri görüp yayında highlight eden — özel admin yok, herkesle aynı işler.

## Core Requirements (Sabit)
- Yayıncı: **SVJ**. Site: **SVJ.CLIPS**
- Renkler: neon yeşil `#53FC18` + koyu siyah (`#050505`/`#0A0A0A`)
- Fontlar: **Unbounded** (display), **Outfit** (body)
- 3D: R3F atmosferik (yıldız alanı + uzakta wireframe küre — yeşil blob YOK)
- Animasyon: framer-motion scroll-driven sections
- Klip kaynağı: **Kick only** — regex `kick.com/.../clips/clip_XXX`, iframe embed `kick.com/clips/{id}/embed`
- Required Telegram channels: `@thesvjduyuru`, `@thesvjbaris` (bot'un üye olmadığı kanal auto-skip)
- Bot: `@sjclip_bot`
- Tüm UI **Türkçe**, her interaktif öğede `data-testid` (kebab-case)

## Tech Stack
- Backend: FastAPI + Motor (Mongo) + bcrypt + PyJWT
- Frontend: React 19 + Tailwind + shadcn + framer-motion + @react-three/fiber + axios + sonner
- Auth: JWT (httpOnly cookie `access_token`, samesite=none, secure, 30d) + bcrypt
- Storage: MongoDB collections — `users`, `clips`, `votes`, `verify_codes`, `password_reset_codes`

## Implementation History

### Phase 10 — Admin Panel + Klip Silme + Flame Badge + Hover Preview (DONE — 2026-06-26)
**User isteği:** "klip silme + admin rapor inceleme paneli", "anlık oy artışı flame badge", "hover'da otomatik 3s preview"

**Backend (4 yeni endpoint + helper'lar)**
- `ADMIN_USERNAMES` env (comma-separated, default: testuser_phase3) + `is_admin()` helper + `require_admin` dependency
- `FLAME_VOTES_THRESHOLD` env (default 3) + `compute_hot_map()` — single aggregation: votes per clip in last 1h. `attach_vote_status` artık `votes_last_hour` + `is_hot` döndürüyor
- `DELETE /api/clips/{id}` — owner or admin; votes cascade silinir; open reports auto-resolved
- `GET /api/admin/stats` — gerçek (şişirilmemiş) sayılar (users, telegram, clips, votes, reports)
- `GET /api/admin/reports?status={open|resolved|all}` — clip snapshot ile birlikte
- `POST /api/admin/reports/{id}/resolve` — action: ignore | delete_clip (delete_clip → klip+votes cascade + ilgili open reports auto-resolved)
- `/auth/me` artık `is_admin` döndürüyor

**Frontend**
- ClipCard: turuncu gradient flame badge `hot-badge-{id}` ("+N / 1sa", pulse anim) sağ üstte; delete-clip-btn-{id} owner/admin için, iki tıklama onayı (Sil → Emin misin? → 2.5s revert); onMouseEnter 800ms timer → setPlaying(true) + iframe `?muted=true` hover preview
- AdminPage (`/admin`): admin-page hero, 7'li admin-stats-grid (gerçek sayılar), admin-reports-list filter tabs (open/resolved/all), admin-ignore-{id} ve admin-delete-clip-{id} action butonları
- Navbar: nav-admin link sadece is_admin=true ise görünür; nav-onboarding-hint admin için gizli
- App.js: GlobalTelegramGate admin için bypass (admin moderatördür, voter değildir)

**Test (iteration_10.json):** Backend 25/25 ✅, Frontend 100% ✅. Admin gate bypass eklenince testuser_phase3 admin paneline gerçek UI'da erişebiliyor.

### Phase 9 — Layout Compact + ClipDetail Vote Bar Unification (DONE — 2026-06-26)
**User feedback:** "ClipDetailPage vote butonu hâlâ eski tarz" + "klipler çok aşağıda kalıyor çok fazla scroll gerekiyor"
**Changes**
- **HomePage layout reorganize**: hero `min-h-[100vh]` → `78vh`, hero başlık tek satır (3 satır → 1 satır), section padding `py-24` → `pt-12 pb-10`. Section sırası: `hero → Top3 → Feed → HowItWorks → PrizeReveal` (önceki: `hero → HowItWorks → PrizeReveal → Top3 → Feed`). Sonuç: 1080p ekranda klipler **fold üzerinde** görünür — first upvote-btn y=1309 (önceden 2140, ~830px yukarı).
- **ClipDetailPage vote bar**: ClipCard ile aynı tasarım — `w-full h-16` "OY VER · N" / "OYLADIN · N". Iframe üstüne success overlay (1.1s büyük yeşil ✓ + "Oy verildi"). Spring icon swap + count slide-in + voted'da gradient + glow + inset boxShadow infinite pulse. Eski sağdaki küçük pill kaldırıldı.

**Test (iteration_9.json):** Frontend 100% ✅, Backend 5/5 ✅, regression yok. Hero 842px, first clip y=1309, detail vote-btn 960×64px, anonim/self-vote'ta overlay tetiklenmiyor (gate korunmuş).

### Phase 8 — Vote Bar Redesign + Counter Formula Fix (DONE — 2026-06-26)
**User feedback:** "oy verme butonu değişmemiş", "sayı çok şişmiş", "1 kişi kayıt olunca onu 4 kişi saysın, sıradakine 8. kişi sen ol desin"
**Changes**
- ClipCard vote button: kart altında **tam genişlik 56px bar** (eski sağ-alt köşedeki pill kaldırıldı). "OY VER · N" / "OYLADIN · N" (büyük uppercase font-display). Spring icon swap (ChevronUp ↔ Check), count slide-in, voted'da gradient yeşil + soft inner glow infinite.
- Community counter formülü sadeleştirildi: `displayed = real * COMMUNITY_DISPLAY_MULTIPLIER` (default 4, no offset). `next_position = telegram_linked + MULT`. real=1 → 4 görünür → sıradakine "8.kişi sen ol". Frontend `stats.next_position` doğrudan kullanılıyor (eski `+1` kalıntı kaldırıldı).
- **Vote sayıları (clip.votes_count) DB'de gerçek — şişirme YOK.** Sadece community counter (üye sayısı) gösterimde şişirilir.

**Test (iteration_8.json):** Backend 28/28 ✅, Frontend 100% ✅. Vote bar w=387px h=56px, counter backend.next_position'a tam eşit, register sonrası total_members +4 artar.

### Phase 7 — Contest Hardening + Slotjack Lock + Vote UX (DONE — 2026-06-26)
**Backend güvenliği (yarışma için)**
- `ALLOWED_KICK_STREAMER` env (default: `slotjack`) — `parse_kick_clip_id` sadece slotjack URL'lerini kabul ediyor (case-insensitive, `@slotjack` ve `slotjack` ikisi de). Diğer yayıncılar 400 + Türkçe mesaj.
- Submit_clip: URL parse → gate sıralaması (yanlış URL'de Telegram-bağlı olmayan kullanıcı bile net feedback alır).
- Vote_clip yarışma gate'leri:
  - **Self-vote engeli**: 403 "Kendi klibine oy veremezsin" (clip.submitter_id == user.id)
  - **Hafta gate**: 403 "Sadece bu haftaki kliplere oy verilebilir" (clip.week_key != current_week)
  - **Atomic vote**: existing check kaldırıldı; insert try/except DuplicateKeyError → 409; sadece insert başarılıysa $inc; race condition'da unique index korur
  - Clip silinirse insert rollback (votes.delete)
- Unvote_clip: sadece bu hafta klipleri için (403 past-week), `votes_count > 0` koruması (negatife düşmez)
- Community counter şişirme: `displayed = real * 3 + 1247` (env `COMMUNITY_DISPLAY_OFFSET`) — gerçek DB sayısı asla açığa çıkmaz

**Frontend (vote UX + profil)**
- ClipCard yeni pill vote butonu: gradient yeşil + Check ikon (voted) / ChevronUp (unvoted) + sürekli soft glow (animate boxShadow infinite)
- Vote confirmation overlay: 1.1s büyük ✓ + "Oy verildi" yazısı (framer-motion AnimatePresence + spring)
- Vote count animasyonu: değer değişiminde slide-down
- SubmitClipDialog: "Sadece @slotjack klipleri kabul edilir" uyarısı + slotjack placeholder
- parseKickClipId (api.js): backend ile aynı regex — slotjack-only
- ProfilePage zenginleştirme: 
  - Hero: 28x28 avatar + Telegram badge overlay + büyük 6xl username + 3 mini rozet (joined date, "En iyi: N oy", "Bu hafta N klip")
  - 4'lü stat grid: KLİP / TOPLAM OY (yeşil accent) / BU HAFTA OY / KLİP BAŞINA (avg)
  - Vitrin section: en çok oy alan klip + büyük 7xl oy sayısı
  - Tüm klipler grid (3 col)

**Test Sonuçları (iteration_7.json)**
- Backend: 19/19 (slotjack regex 5+4 kabul/red, inflated counter, self-vote 403, race-vote atomic, regression)
- Frontend: 100% (profile testid+stats, pill button, overlay anim, anon-vote toast, inflated #1251 counter)

### Phase 6 — Navbar Gate + Gamification + Profile + Reporting (DONE — 2026-06-26)
**Backend**: `/api/stats/community`, `/api/users/{username}` (public profile), `/api/clips/{id}/report` (unique (clip_id, reporter_user_id))
**Frontend**: Navbar fullyOnboarded gate (TELEGRAM BAĞLA rozeti), TelegramLinkDialog gamification counter, ProfilePage, ReportClipDialog (5 preset + freeform), ClipCard report button + profile link

### Phase 5 — UX revize: Telegram tab kaldırıldı, zorunlu post-auth TelegramLinkDialog (DONE — 2026-06-26)

### Phase 1 — Foundation (DONE)
- R3F 3D hero (yıldız + wireframe küre)
- Mock username login (X-User-Id header)
- Klip CRUD + Kick URL parsing
- Vote/unvote + haftalık leaderboard + Pazar 00:00 UTC reset countdown
- DiceBear default avatar + AvatarPicker
- Tüm UI Türkçe, neon yeşil tema, Unbounded+Outfit fontlar

### Phase 2 — Telegram (DONE)
- Telegram Login Widget (HMAC verify) — `POST /api/auth/telegram`
- Bot webhook + `/start` komutu → 6-haneli verify code (15dk TTL)
- `POST /api/auth/verify-code` — kod ile login/link
- Channel membership check — bot'un member olmadığı kanal skip edilir
- Klip gönderme + oy verme zaten gate'liydi (channel)
- ChannelGateDialog modali

### Phase 3 — Auth System + Permanent Link + Reset (DONE — 2026-06-26)
**Backend**
- `POST /api/auth/register` — username + password + email + phone, bcrypt hash, JWT cookie
- `POST /api/auth/login` — username + password
- `POST /api/auth/logout` — cookie temizleme
- `GET /api/auth/me` — JWT cookie öncelikli + Bearer fallback + X-User-Id legacy (backward compat)
- `POST /api/auth/set-password` — Telegram-only legacy user için zorunlu ilk-giriş şifre+kullanıcı adı ataması
- `POST /api/auth/forgot-password` — username verir, "Bota /reset gönder" instructions
- `POST /api/auth/reset-password` — kod + yeni şifre → password değişir, JWT verilir
- Telegram bot `/reset` komutu handler — telegram_id'ye bağlı + şifresi olan kullanıcı için 6-haneli kod üretir, `password_reset_codes` collection'a yazar (15dk TTL)
- `POST /api/clips` gate — login + telegram_id var + tüm gerekli kanal üyeliği
- `POST /api/clips/{id}/vote` gate — aynı kurallar
- Telegram bağlama PERMANENT — unique partial index (`partialFilterExpression={telegram_id: {$type:'string'}}`), 409 conflict, unlink endpoint YOK
- model_dump(exclude_none=True) tüm User insert'lerinde — null index collision önlemi
- DuplicateKeyError handler keyPattern'e bakıp doğru mesaj döner

**Frontend (UX revize 2026-06-26)**
- LoginDialog: **sadece 2 sekme** (Giriş Yap / Kayıt Ol). Telegram sekmesi KALDIRILDI.
- LoginDialog forgot password sub-flow (2 step) — değişmedi
- TelegramLinkDialog (YENİ) — kayıt/giriş sonrası ZORUNLU modal (allowSkip=false, X yok, Escape/overlay engelli). Stage: link → channels → done (1.2s sonra otomatik kapanır)
- App.js GlobalTelegramGate — user var + (telegram_id yok || missing_channels) ise otomatik render, sayfa yenileme sonrası persistent
- SetPasswordDialog — needs_password_setup ise zorunlu modal (Telegram-only legacy user için, Telegram gate'inden ÖNCE çalışır)
- SubmitClipDialog 403 yakalama → refreshUser() → GlobalTelegramGate otomatik tetikler
- auth.jsx — withCredentials cookie tabanlı API'ler

**Test Sonuçları (iteration_5.json)**
- Backend smoke: 6/6 PASS
- Frontend UX: 12/12 PASS — Telegram tab yok, kayıt sonrası zorunlu modal, dismissible değil, sayfa yenileme persistent

**Indexes (MongoDB)**
- `users.username` unique
- `users.telegram_id` unique + partialFilterExpression ($type:string) — PERMANENT link
- `users.email` partialFilterExpression
- `verify_codes.code` unique
- `password_reset_codes.code` unique
- `clips.kick_clip_id` unique
- `votes.(clip_id, user_id)` unique

## Test Coverage
- `/app/backend/tests/test_phase3_auth.py` — 25 backend tests (all green)
- `/app/test_reports/iteration_4.json` — final pass report

## Prioritized Backlog
### P2 (UX polish — opsiyonel)
- `/auth/me` Telegram bağlı olmayan kullanıcı için missing_channels=REQUIRED_CHANNELS dönsün → frontend gate'i preemptive göstersin (şu an reactive 403 sonrası gösteriliyor)
- server.py'ı router'lara böl (auth, telegram, clips, leaderboard) — 1005 satır
- pydantic field validators ile validate_username/password/phone DRY

### P3 (gelecek faz fikirleri)
- Profil sayfası: kullanıcının gönderdiği klipler + oyları
- Şikayet/raporla butonu
- Klip thumbnail cache (Kick API)
- Discord webhook bildirimleri (yeni klip / haftalık şampiyon)
- Email opt-in newsletter (zaten kayıt esnasında toplanıyor)

## Environment
- `JWT_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `REQUIRED_CHANNELS`, `STREAMER_NAME`, `PUBLIC_BACKEND_URL`, `TELEGRAM_WEBHOOK_SECRET` — backend/.env
- `REACT_APP_BACKEND_URL=https://clips-auth-phase3.preview.emergentagent.com` — frontend/.env

## URLs
- Preview: `https://clips-auth-phase3.preview.emergentagent.com`
- Bot: `https://t.me/sjclip_bot`
- Channels: `https://t.me/thesvjduyuru`, `https://t.me/thesvjbaris`

## Changelog
### 2026-02-26 — Bug Fixes (Iter 11)
- **BUG (Kick embed URL)**: `kickEmbedUrl()` in `frontend/src/lib/api.js` was returning `https://kick.com/clips/{id}/embed` (streamer-less ve geçersiz). Düzeltildi: artık resmi `https://player.kick.com/{clipId}` formatını döndürüyor. Klip videoları artık iframe içinde yüklenebiliyor.
- **BUG (Telegram dialog tıkıyor)**: `GlobalTelegramGate` `allowSkip={false}` ile çağırılıyordu, X butonu ve 'Daha sonra' linki gizliydi. Düzeltildi: artık `allowSkip={true}`, sessionStorage destekli `dismissed` state ile kullanıcı dialog'u kapatabiliyor, navbar'daki yeni `nav-open-telegram-gate-btn` butonu ile (custom event `svj:open-telegram-gate`) istediğinde tekrar açabiliyor. Test ajanı `iteration_11.json` ile her iki düzeltmeyi de doğruladı.

