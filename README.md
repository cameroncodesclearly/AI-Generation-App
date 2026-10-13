# Creative Creators Studio

An internal AI generation studio for the Clear Sky Creations team. Higgsfield-style creative UI, every model through
[OpenRouter](https://openrouter.ai), per-person credit limits with pre-run estimates, magic-link sign-in via Resend,
and a Cloudflare backend (Workers + D1 + R2 + Queues). Includes a social-video analyzer (transcript, summary,
visual breakdown, hooks, captions) with CSV batch in / CSV out.

```
src/web      React + Vite + Tailwind SPA (glassmorphic cinema design)
src/worker   Hono API on Cloudflare Workers, queue consumer, cron
src/shared   Types shared by both
migrations   D1 schema + seed presets
nas-analyzer Optional bridge container for TikTok/Instagram links (yt-dlp + whisper + ffmpeg)
scripts      Brand-asset generator (OpenRouter)
```

## Features

- **Image, video and copy generation** from one prompt panel: model picker with live prices, aspect ratio, resolution,
  duration, variations, negative prompt, reference images (first/last frame for video).
- **Credits.** Every request shows an estimate before it runs. The estimate is *reserved* against the person's limit,
  then *settled* to the real OpenRouter cost when the run finishes (refunded on failure). Admins set a per-person
  limit, monthly reset or a fixed pool, one-time top-ups, and can disable people. 1 credit = $0.01 of model spend
  by default, with a configurable markup for safety margin.
- **Presets.** Reusable prompt templates with `{{inputs}}`, locked parameters and baked-in reference images. Anyone
  runs them from a form; authors and admins edit. Save any studio prompt as a preset in one click. AI-generated covers.
- **Analyze video.** Drop a file or link plus a note. Get transcript, summary, scene-by-scene visual description,
  on-screen text, hook, key moments, caption ideas and hashtags, each with a copy button. Upload a CSV of links and
  download a CSV of all results.
- **Admin.** Team roster with usage meters and real spend, model allow-list with price overrides, usage by person and
  model, full credit ledger.
- **Auth.** Passwordless magic links (15 min, single use), 30-day sessions, admin bootstrap from `ADMIN_EMAILS`,
  invite-only for everyone else.

## Setup

Prereqs: Node 20+, a Cloudflare account (Workers Paid plan is required for Queues), an OpenRouter key, a Resend key
with a verified sending domain.

```bash
npm install

# 1. Cloudflare resources
npx wrangler login
npx wrangler d1 create studio-db          # paste the database_id into wrangler.jsonc
npx wrangler r2 bucket create studio-files
npx wrangler queues create studio-jobs

# 2. Config: edit wrangler.jsonc "vars"
#    APP_URL      -> your production URL (used in magic links)
#    MAIL_FROM    -> "Creative Creators <studio@yourdomain.com>" (domain verified in Resend)
#    ADMIN_EMAILS -> comma-separated admins; these can sign in before being invited
#    CREDIT_USD / CREDIT_MARKUP / DEFAULT_CREDIT_LIMIT

# 3. Secrets
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put RESEND_API_KEY
# optional NAS bridge (see nas-analyzer/README.md)
npx wrangler secret put NAS_ANALYZER_URL
npx wrangler secret put NAS_ANALYZER_TOKEN

# 4. Database + deploy
npm run db:migrate
npm run deploy
```

Open the app, enter an admin email, click the link in your inbox. Go to **Admin → Models**, click *Refresh catalog*
so live OpenRouter pricing is pulled in, and enable the models you want the team to use. Then **Admin → Team → Invite**.

### Local development

```bash
cp .dev.vars.example .dev.vars   # add keys; DEV_PRINT_MAGIC_LINK=1 prints links instead of emailing
npm run db:migrate:local
npm run dev                      # Vite on :5173 proxies /api and /files to wrangler on :8787
```

Without a Resend key the login page shows the magic link directly in dev mode. Without an OpenRouter key the catalog
falls back to curated models and runs fail with a clear message (credits are refunded).

## How credits work

| Step | What happens |
|---|---|
| Estimate | `POST /api/models/estimate` prices the request: per-image price × count, per-second × duration × resolution multiplier, or per-token for text. Prices come from OpenRouter's catalog (cached 1h), curated defaults, or an admin override. |
| Reserve | `POST /api/generate` atomically increments `credits_used` only if it stays ≤ `credit_limit` (SQL guard, no race). Otherwise 402 with the shortfall. |
| Settle | When the job completes, the worker reads `usage.cost` from the OpenRouter response (or `/generation`), converts it to credits and adjusts the reservation up or down. |
| Refund | Failed or timed-out jobs refund the reservation. |
| Reset | Monthly limits roll over on first use each month; admins can reset or top up any time. |

Video models are billed by OpenRouter asynchronously; if the job response doesn't carry a cost the estimate stands,
so keep the admin price overrides honest for video.

## Building custom presets: recommended approach

The preset system is already in place; this is how to get the most from it.

1. **Start from a win.** When a generation lands, hit *Preset* in the studio. The prompt, model, aspect ratio,
   duration and references are captured as-is.
2. **Carve out the inputs.** Replace only the parts that should change per run with `{{placeholders}}`
   (`{{product}}`, `{{scene}}`, `{{headline}}`). Everything else stays locked, which is what makes the look repeatable.
   Use *Choice* inputs with 3-6 options for things like lighting or surface so people pick instead of type.
3. **Bake in references.** Upload the brand's product shots, a character sheet or a style frame on the preset itself.
   Every run gets them automatically; runners can add their own on top.
4. **Write the description for the person, not the model.** "Use for hero shots of hard goods, 4:5, needs a product
   photo" is what makes a team member pick it in the gallery.
5. **Generate the cover.** The editor can render a cover with the house style so the gallery reads like a shelf of
   looks, not a list of prompts.
6. **Keep private until proven.** Build as *Only me*, run it a few times, then flip to *Whole team*.
7. **Ownership.** Authors and admins can edit; everyone can run. Runs are counted so the best presets float up.

Ideas for the next iteration (not built yet, all straightforward on this schema): preset versioning with rollback,
"remix" to fork a team preset, chaining (image preset → video preset with the output as first frame), and a per-preset
default credit cap.

## Video analysis

- **Files, direct `.mp4`/`.mov` links and YouTube links** go straight to Gemini on OpenRouter, which watches the video
  and audio itself. Uploads up to ~19 MB are sent inline; larger ones via a signed, time-limited link.
- **TikTok / Instagram / X links** can't be fetched from a Worker. Set up the NAS bridge (`nas-analyzer/`), which
  mirrors what the research app's container does: `yt-dlp` download, `faster-whisper` transcript, `ffmpeg` frames.
  The Worker then sends transcript + frames (or the video itself) to the model. The contract is documented in
  `nas-analyzer/README.md`; if the existing research container already has these pieces, exposing one `/analyze`
  route with that JSON shape is enough.
- **Batch.** CSV with `url` and `note` columns (header optional), up to 200 rows, or paste links one per line.
  Download results as CSV from the Batches list.

## Brand assets

`npm run assets:generate` (with `OPENROUTER_API_KEY`) renders the hero backdrop, login art and preset covers in the
house style into `generated-assets/`. Upload covers from the preset editor; drop the hero into `public/` and reference
it in `styles.css` if you prefer a rendered sky over the CSS one.

## API overview

| Route | Purpose |
|---|---|
| `POST /api/auth/request`, `GET /api/auth/verify`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/auth/ledger` | Magic-link auth and self info |
| `GET /api/models?kind=`, `POST /api/models/estimate`, `POST /api/models/estimate-analysis` | Catalog + estimates |
| `POST /api/generate`, `GET /api/generations`, `DELETE /api/generations/:id`, `POST /api/upload` | Generation |
| `GET/POST /api/presets`, `PUT/DELETE /api/presets/:id`, `POST /api/presets/:id/preview|run|cover` | Presets |
| `POST /api/analyses`, `POST /api/analyses/batch`, `GET /api/analyses`, `GET /api/analyses/batches`, `GET /api/analyses/batches/:id/export.csv`, `POST /api/analyses/:id/retry` | Video analysis |
| `GET/POST/PATCH /api/admin/users`, `POST /api/admin/users/:id/reset|adjust|invite`, `GET/PATCH /api/admin/models`, `GET /api/admin/usage`, `GET /api/admin/ledger` | Admin |
| `GET /files/:key` (session) · `GET /files/signed/:key` (time-limited) | R2 file serving with range support |

Jobs run on a Cloudflare Queue (`studio-jobs`); video jobs poll OpenRouter every 20 s for up to 30 min. A cron every
2 minutes re-drives anything stuck and expires old links and sessions.
