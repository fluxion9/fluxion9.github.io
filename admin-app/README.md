# Portfolio admin (Render app)

A small Node.js web app for editing the portfolio. Content is saved as `content/*.json` files in
the `fluxion9/fluxion9.github.io` repository; every save triggers the "Build and deploy site"
GitHub Action, which rebuilds the pages and the résumé/CV PDFs and publishes them to GitHub Pages
within a few minutes. The admin's own data (team, sign-ins, activity, analytics) is stored in
**MongoDB Atlas**.

- **Sign-in:** Google, emailed sign-in links (via Brevo), or email + password.
- **Team:** owners can add people (e.g. a friend who proofreads) under **Team**.
- **Activity:** owners see who saved, created or deleted what, and recent sign-ins (kept a year).
- **Uploads:** photos go straight to Cloudinary using **signed** uploads (the secret stays on the server).
- **No silent overwrites:** if an item was saved elsewhere since you opened it, your save is refused
  with a "reload" message instead of overwriting the other change.
- Every save is a GitHub commit authored by the person who made it.
- **Logins are JWTs** (HS256, via `jose`) in an HttpOnly cookie, with a separate audience per token type.
- The sections and fields you edit are defined in [`schema.yml`](schema.yml).

### What you can edit

| In the admin | Changes |
| --- | --- |
| **Profile & pages → Profile** | Name, headline, rotating roles, tagline, photo, location, email, phone, WhatsApp, "open to opportunities" badge, social links |
| **Profile & pages → Skills** | Skill groups on the site, résumé and CV |
| **Profile & pages → Certifications, awards & languages** | Shown on the site and CV when filled in |
| **Profile & pages → Home page text** | Section headings and text, buttons, contact-form reasons, Google title/description |
| **Profile & pages → Résumé & CV** | Professional summary, bullets per job and number of projects on the one-page résumé, photo on/off, PDF file name |
| **Profile & pages → Site settings** | Website address, contact form endpoint (Formspree), analytics address |
| **Experience / Projects / Education** | One item each; turn off **Published** to hide, **Include on résumé** to leave it off the one-page résumé |

### What's stored where

| Data | Where |
| --- | --- |
| Portfolio content | GitHub repository, `content/*.json` |
| Team (emails, names, roles, password hashes) | MongoDB `users` |
| Used emailed sign-in links (each works once) | MongoDB `login_links` (auto-deleted after expiry) |
| Sign-in attempt limits | MongoDB `rate_limits` (auto-deleted) |
| Activity log | MongoDB `activity` (auto-deleted after a year) |
| Website analytics (anonymous visits and actions) | MongoDB `analytics_views`, `analytics_events`, `analytics_salts` (auto-deleted after `ANALYTICS_RETENTION_DAYS`, default 2 years) |
| Admin settings changed in the app (which websites may send visits) | MongoDB `settings` |

## MongoDB Atlas

1. In [MongoDB Atlas](https://cloud.mongodb.com), create a cluster (the free **M0** tier is plenty)
   in a region near your Render service.
2. **Database Access → Add New Database User:** password authentication, a strong generated
   password, role **Read and write to any database** (or only the `portfolio_admin` database).
3. **Network Access → Add IP Address:** Render's outgoing addresses change, so allow `0.0.0.0/0`
   (access is still protected by the database user's password).
4. **Connect → Drivers → Node.js:** copy the connection string, put the user's password in it, and
   set it as `MONGODB_URI`. The database and its collections are created on first start.

## GitHub token

Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new):
repository access **Only select repositories → fluxion9/fluxion9.github.io**, permission
**Contents: Read and write**. Put it in `GITHUB_TOKEN`.

## Deploy on Render

1. **New → Web Service**, connect the `fluxion9/fluxion9.github.io` repository.
2. Settings:
   | Setting         | Value               |
   | --------------- | ------------------- |
   | Root Directory  | `admin-app`         |
   | Runtime         | Node                |
   | Build Command   | `npm install`       |
   | Start Command   | `node server.js`    |
   | Health Check    | `/health`           |
3. Add the environment variables below (Render's "Add from .env" accepts a filled-in
   [`.env.example`](.env.example)), deploy, and set `PUBLIC_URL` to the service's address.
4. Optional: in **Settings → Build Filters**, include only `admin-app/**`, so saving content
   doesn't redeploy the admin.

Render's free plan sleeps after ~15 minutes without visits, so the first visit afterwards takes up
to a minute (and a visit or two to the portfolio can go uncounted while it wakes). A paid instance
stays awake.

### Environment variables

| Variable | Required | What it is |
| --- | --- | --- |
| `JWT_SECRET` | yes | At least 32 random characters (`openssl rand -hex 32`). Signs logins and emailed links. Changing it signs everyone out. |
| `MONGODB_URI` | yes | Your MongoDB Atlas connection string. |
| `PUBLIC_URL` | yes | The admin's address, e.g. `https://portfolio-admin.onrender.com` (no trailing slash). |
| `GITHUB_TOKEN` | yes | Fine-grained token with **Contents: Read and write** on the repository (see above). |
| `OWNER_EMAILS` | yes | Comma-separated emails that are always owners — yours. |
| `OWNER_INITIAL_PASSWORD` | optional | Lets an owner sign in with this password the first time (you're asked to set your own). Remove it afterwards. |
| `MONGODB_DB` | optional | Default `portfolio_admin`. |
| `GITHUB_REPO` / `GITHUB_BRANCH` | optional | Default `fluxion9/fluxion9.github.io` / `main`. |
| `SITE_URL` | optional | Default `https://fluxion9.github.io` (for "View on website" links and analytics). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google sign-in | See below. |
| `BREVO_API_KEY`, `MAIL_FROM` | for emailed links & password resets | See below. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | for uploads | Cloudinary → Settings → API Keys. |
| `CLOUDINARY_FOLDER` | optional | Default `portfolio`. |
| `ANALYTICS_TIMEZONE` | optional | Time zone for days and hours in Analytics. Default `Africa/Lagos`. |
| `ANALYTICS_RETENTION_DAYS` | optional | How long visit data is kept. Default `730`. |
| `ANALYTICS_ORIGINS` | optional | Starting point for which websites may send visits. Empty = any. |
| `ANALYTICS_INCLUDE_LOCAL` | optional | `true` to also count visits from localhost (testing). |

### Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project and an OAuth
   consent screen (External).
2. *Credentials → Create credentials → OAuth client ID* → **Web application**, authorised redirect
   URI `<PUBLIC_URL>/auth/google/callback`.
3. Put the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

Only people on the team (or in `OWNER_EMAILS`) can get in.

### Emailed sign-in links (Brevo)

1. In [Brevo](https://www.brevo.com), verify a sender address (or your domain).
2. *SMTP & API → API Keys* → put the key in `BREVO_API_KEY`, and the sender in `MAIL_FROM`,
   e.g. `Portfolio Admin <you@example.com>`.

Links work once and expire after 20 minutes.

## Website analytics

**Analytics** (owners) shows visitors, visits, page views, time on page, scroll depth, where people
came from (search, LinkedIn and other social sites, AI assistants, campaign links), countries,
devices and browsers — plus what matters for a portfolio:

- **Résumé & CV downloads** (and prints of the online versions),
- **messages sent** through the contact form, and what they're about (job, freelance, collaboration…),
- email, phone and WhatsApp taps, **social profiles opened** (GitHub, LinkedIn…),
- which **projects** were seen and whose links were clicked, and which **sections** were read.

To switch it on, open **Analytics → Connect the website** once. That saves this admin's address as
`analytics_url` in `content/settings.json`; the site rebuilds and starts sending anonymous visits to
`<PUBLIC_URL>/e`. No cookies and no IP addresses are stored; a visitor is counted with a hash that
changes daily. Country comes from Cloudflare's `CF-IPCountry` header when available, otherwise from
the visitor's time zone.

**Track a campaign link** builds links like `https://fluxion9.github.io/?utm_source=linkedin&utm_campaign=acme-backend-role`
— use one per job application to see which applications led to a visit.

To stop counting your own visits, open the portfolio once per browser with `?analytics=off`
(`?analytics=on` to undo). CSV export is included.

## First sign-in

Sign in with an `OWNER_EMAILS` address — using Google, an emailed link, or `OWNER_INITIAL_PASSWORD`
— then set your own password under **My account** and remove `OWNER_INITIAL_PASSWORD`.

## Local development

```bash
cd admin-app
npm install
cp .env.example .env      # set CONTENT_BACKEND=local to edit the files in this checkout;
                          # without MONGODB_URI an in-memory database is used (lost on restart)
node server.js            # loads .env automatically
```

Open http://localhost:3000. In local mode emailed links are printed in the terminal. Run
`node build.mjs` in the repository root afterwards to see your changes in the built pages.

It's a plain Node.js (20.12+) app, so it also runs on any Node host or as a container
(`docker build -t portfolio-admin admin-app && docker run -p 3000:3000 --env-file admin-app/.env portfolio-admin`).
