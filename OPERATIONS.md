# Minute Club

Ten small web projects with Russian interfaces, a shared lightweight visual language, and no runtime dependencies. Seven use Node.js 24 + SQLite for real community data; three run entirely in the browser. No remote fonts, trackers, CDN assets, build framework, or paid API.

| Repository | Route | Features | Runtime |
| --- | --- | --- | --- |
| caption-club | /caption/ | Daily original illustration, captions, voting, yesterday's winner, share links, PNG cards | Node + SQLite |
| majority-vote | /majority/ | 12 unusual questions, majority prediction, real answer counts, direct question links | Node + SQLite |
| meme-arena | /arena/ | Seed memes, unique pair battles, win counts, moderated image submissions | Node + SQLite |
| memory-sketch | /memory/ | 30-second canvas drawing, undo, eraser, four references, PNG export, friend challenges | Static |
| excuse-bureau | /papers/ | Three document templates, live canvas preview, local drafts, PNG export | Static |
| crowd-decides | /decide/ | Shareable polls with 2–6 options, results, browser-local recent polls | Node + SQLite |
| pixel-rooms | /house/ | Shared room gallery, 16×16 editor, 16 colors, keyboard controls, undo, conflict detection | Node + SQLite |
| daily-minute | /minute/ | Shared daily odd-word puzzle, server-validated attempts, elapsed time, local history | Node + SQLite |
| odd-finds | /finds/ | Moderated photo collection, categories, voting, sorting, pagination, direct item links | Node + SQLite |
| motion-playground | /mischief/ | Escaping button, draggable spring cards, playful progress, 3D flip, calm mode | Static |

## Run the combined development project

Requires Node.js 24 or newer. No installation step:

```sh
npm start
```

Open http://localhost:3000. The tenth experiment is at `/mischief/`. To enable image submissions, first set `ADMIN_TOKEN` to a long random value; uploads remain private until approved at `/admin/`.

```sh
ADMIN_TOKEN='replace-with-a-long-random-value' npm start
npm test
npm run check
```

## Create standalone packages

```sh
node ops/export.mjs /absolute/path/to/output
```

Each folder is an independent project. Server packages expose only their own API group and route. Static packages contain a `public/` directory that any static web server can serve at a domain root; they do not call an API.

## Deploy on your server

Node packages require one process each. They bind to loopback by default; put Caddy or another HTTPS reverse proxy in front. Each project must use its own port, `DATA_DIR`, and origin. Set environment variables through your service manager or `node --env-file=.env server/index.mjs`; `.env` is not loaded automatically. Examples are in `ops/`.

```sh
PORT=3001 PUBLIC_ORIGIN=https://caption.example.com DATA_DIR=/srv/caption-data npm start
```

Alternatively build the included Dockerfile, bind port 3000 to loopback, and mount a persistent volume at `/app/data`. Do not expose a development server to the internet.

Static packages can be served with Caddy's `file_server` or any static host. Their absolute asset paths assume a domain root, not a GitHub Pages project subdirectory. No hosting or domain changes are performed by this repository.

## Disk budget and media

The combined project limits accepted images to 80 GB total. Standalone Meme Arena and Odd Finds default to **40 GB each**, leaving 20 GB of your 100 GB allocation for databases, WAL, and operational headroom. Set `UPLOAD_BUDGET_BYTES` to change the per-project limit. This limits image payload bytes, not total filesystem use; monitor actual disk space. Keep backups on a different disk or reserve more headroom for them.

Only JPEG, PNG, and non-animated WebP are accepted. The browser re-encodes to at most 1200 pixels and 500,000 bytes, stripping original metadata. The server independently checks signature, size, and dimensions (max 2048×2048), then stores the bytes in SQLite. GIF/APNG/animated WebP are deliberately excluded from v1. Failed submissions never become public. Without `ADMIN_TOKEN`, uploads are disabled.

No public object-store keys, paid services, or original large uploads are needed. There is no image-generation AI dependency: starter illustrations are original lightweight vectors.

## Operations and moderation

- `/healthz`: process health endpoint.
- `/admin/`: pending images and reported posts. The key stays in tab memory; it is never put in a URL or localStorage.
- Approve to publish, or delete to remove a post, image, and attached reports. SQLite reuses freed pages; file size will not immediately shrink. Run SQLite `VACUUM` only during a planned offline maintenance window with enough free disk space.
- Back up with `node ops/backup.mjs /other-disk/backup.sqlite`. It uses SQLite's online backup API, including committed WAL content. Also protect a copy of `data/session-key` if preserving browser room access after a restore matters. Test restores periodically.
- Use one Node process per database. Do not cluster multiple writers or put a live SQLite database on a network filesystem.
- Rate limits are per TCP peer, with write and publication limits. Behind the supplied reverse proxy, all traffic shares the proxy's bucket. For a larger audience, enforce visitor-specific limits at the proxy and adjust the application limiter deliberately; arbitrary forwarded headers are not trusted.
- Pending queues return the latest 100 items per request. Review them regularly before accepting a large volume of submissions.
- Reports are a manual moderation workflow, not automatic content detection. Configure a real contact channel and any jurisdiction-specific notices before a public launch.

## Identity and limitations

A random HMAC-signed HttpOnly SameSite cookie identifies a browser. Secure cookies are enabled when `PUBLIC_ORIGIN` is HTTPS. This prevents tampering with an existing session ID but does not make a browser a verified person: clearing cookies can create another identity. The polls are for entertainment, not elections. There is no login, account recovery, or cross-device room ownership in v1.

Submitted text is escaped before DOM insertion. The server uses parameterized SQL, bounded JSON, same-origin checks, restrictive CSP, and MIME sniffing restrictions. Anonymous public content still requires ongoing moderation. Daily tasks use Europe/Moscow by default; configure `APP_TIMEZONE` before launch, not mid-contest.

The daily word puzzle rotates seven word pairs; the caption contest rotates five original scenes. Expand those content pools in `server/content.mjs` as the audience grows. Drawing comparisons are visual; no automatic recognition or score is claimed. Poll results and meme ranks are real visitor counts, with no invented engagement data.

## Validation

`npm test` exercises actual HTTP requests and temporary SQLite databases: publication, repeated votes, pair validation, poll option validation, room ownership and version conflicts, daily answers, pending media privacy, moderation, reports, quotas, origins, rollback, and restart persistence. `npm run check` validates JavaScript syntax, local asset references, and an 18 KB gzip ceiling for common assets.

The shared server test can be run with Node's coverage support:

```sh
node --test --experimental-test-coverage tests/server.test.mjs
```

UI interactions must also be checked in a real browser. Automated server coverage does not measure browser canvas behavior, mobile layout, or abuse resistance under a production workload.
