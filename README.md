# Pixel Rooms

Decorate your own pixel room and explore a shared house built by the community.

English, Spanish, and Russian interfaces, selected from browser language preferences or a saved manual choice. Light, dark, and system themes. Independent, lightweight HTML/CSS/JavaScript with no third-party browser dependencies, remote fonts, analytics, or CDN.

## Quick start

Requires Node.js 24+. No install or build step.

```sh
npm start
```

Open http://localhost:3000. The root opens this application; unrelated app routes and APIs are disabled. Data persists in `data/minute.sqlite`.

```sh
npm test
npm run check
```

## Deploy

Set `PUBLIC_ORIGIN` to the exact HTTPS origin, give the process a persistent `DATA_DIR`, and put an HTTPS reverse proxy in front. Example Dockerfile, Caddy config, environment file, and systemd unit are included. Each independent project needs its own port and data directory. `.env` is not loaded automatically: use exported variables or `node --env-file=.env server/index.mjs`. See [OPERATIONS.md](OPERATIONS.md) for backups, moderation, identity limitations, and storage details.

Every browser owns one 16×16 room. The gallery is public, room writes check ownership and version, and drafts stay local until saved. The HMAC-signed cookie is the key: clearing cookies loses edit access. There is no recovery/account system in v1.
