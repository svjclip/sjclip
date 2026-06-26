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

**Frontend**
- LoginDialog 3 tab (Giriş / Kayıt / Telegram) + forgot password sub-flow (2 step)
- SetPasswordDialog — needs_password_setup ise zorunlu modal (kapatılamaz)
- SubmitClipDialog 403 yakalama → gate-telegram-modal veya ChannelGateDialog tetikleme
- auth.jsx — withCredentials cookie tabanlı, passwordLogin/register/verifyTelegramCode/setPasswordForLegacy/forgotPassword/resetPassword/logout/recheckChannels API'leri
- formatApiError helper — nested error object handling

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
