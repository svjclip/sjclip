# CLIPSTORM Clip Voting Platform — PRD

## Problem Statement (original, Turkish)
> sadece tek bir yayıncının klipleri yüklenecek. kullanıcılar klipleri alıp linkleriyle yükleyecek. site üzerinden klipler izlenebilecek ve oy verilecek. en çok oy alan klip sahibi oylarla belirlenip her hafta ödül kazanacak. ancak bunun için bazı önlemler alınması gerek mesela klibe oy verebilmek için telegramla giriş yapması ve kanalları takip ediyor olması gerekecek gibi. adım adım yapalım ekleye ekleye gideriz. öncelikle site sana bu yüklediğim araçlarla ui ux frame motion gibi yüklenen araçlarla yapılacak kesinlikle klasik yapay zeka fontları ve renkleri kullanılmayacak 3d bir tasarım istiyorum kick clone site gibi düşün ama çok daha profesyonel bir platform olacak. kullanan kişiler kendini kick gibi profesyonel bir platformda hissedecek. sıra sıra yapalım aynı zamanda canlı şekilde test edelim localde

## Persona
- Streamer's community member who watches Kick streams, wants to submit/vote on best moments and compete for weekly prize.

## Architecture
- **Backend**: FastAPI + Motor (MongoDB). Routes prefixed `/api`. Auth via `X-User-Id` header (mock); to be replaced with Telegram OAuth Phase 2.
- **Frontend**: React 19 + React Router 7, Three.js via @react-three/fiber + drei for 3D hero, Framer Motion for transitions, Tailwind + shadcn/ui for components, sonner for toasts.
- **DB**: collections `users`, `clips`, `votes`. Indexes on username (unique), kick_clip_id (unique), (clip_id,user_id) compound (unique).

## Implemented (Phase 1 — 2026-02)
- 3D hero with floating neon icosahedrons + wireframe torus rings + particle field
- Streamer name resolved from backend `/api/config` (env STREAMER_NAME)
- Mock username login + persistent session via localStorage
- Submit Kick clip dialog with URL regex parsing (kick.com/.../clips/clip_XXX)
- Feed grid sortable by Top / Newest
- Vote / Unvote with optimistic UI updates
- Weekly leaderboard with crowned winner card and runner-up rows
- Live countdown to next Sunday 00:00 UTC
- Clip detail page with full embed iframe + vote
- Dark theme with neon green (#53FC18), Unbounded + Outfit fonts, glassmorphism

## Known Limitations
- Telegram login + channel-follow check is MOCKED via username field (Phase 2)
- Weekly prize is decorative; no real prize distribution logic
- No anti-abuse beyond 1-vote-per-user-per-clip
- Inline error UX uses toasts; no aria-role alert (minor)

## Backlog
### P0 (next phase)
- Telegram Login Widget integration + Bot API channel membership verification
- Admin panel to set weekly prize description, freeze winner at week-end
### P1
- Profile pages showing clips submitted + votes received
- Comment threads per clip
- Anti-spam: rate limit submissions per user
- Past weeks archive with hall-of-fame
### P2
- Streamer dashboard with analytics
- Social share buttons (Twitter/X, Telegram, Discord)
- Email/Telegram notification when your clip wins
