# Deployment

J&B’s RPG is one container and one data folder. On your home network that’s all you need. This
page covers running it, keeping it safe on the internet, and updating it.

## Run it

```bash
git clone https://github.com/brentonmallen1/jb-rpg.git && cd jb-rpg
cp .env.example .env        # then edit it
docker compose up -d --build
```

The app listens on `BACKEND_PORT` (8000). Everything it keeps lives in the data folder
(`DATA_DIR`, mounted at `/data`):

| File | What |
|---|---|
| `stories/*.json` | Your stories (a fresh folder gets the demo once) |
| `state.json` | The game in progress, so it survives restarts |
| `assets/<story>/audio/` | Uploaded ambience and stings |
| `admin.json` | The generated login, if you didn’t set one |
| `session.key` | The key that signs the storyteller’s sign-in cookie |

Back up the folder and you’ve backed up everything. Deleting `session.key` signs every browser out.

## The login

Only the storyteller signs in. Set `ADMIN_USER` and `ADMIN_PASSWORD` in `.env`, or leave them
empty and one is generated on first start (shown by `docker compose logs`, saved in
`admin.json`). Changing the password signs everyone out.

`AUTH_DISABLED=true` turns the login off entirely. Use it only on your own machine: on a server it
lets anyone who can reach the address edit your stories and run games.

Players never sign in. A game’s player link contains a long random id that can’t be guessed, and it
stops working when the game ends.

## Putting it on the internet

So friends elsewhere can join, the app needs a public HTTPS address. Two rules matter:

1. **HTTPS only.** The sign-in and the player link travel with every request; over plain HTTP,
   anyone on the same network could read them.
2. **Set `BASE_URL`** to the public address (for example `https://story.example.com`), so the
   player links the stage hands out point there.

Then pick how to expose it, from most to least protected.

### Cloudflare Tunnel, with Cloudflare Access for the storyteller (recommended)

The tunnel connects out from your server, so no ports are opened on your router, and Cloudflare
provides HTTPS. Point the tunnel at `http://localhost:8000`. Live updates (Server-Sent Events)
work through it; the app sends a heartbeat every 20 seconds to keep streams open.

Optionally, put a Cloudflare Access policy (a one-time code to your email, for example) in front of
the storyteller’s paths only, listed below. Players aren’t affected, and your login page is no
longer visible to the internet.

### A reverse proxy with automatic HTTPS

[Caddy](https://caddyserver.com) gets certificates by itself:

```caddy
story.example.com {
    reverse_proxy localhost:8000 {
        flush_interval -1   # don't buffer the live-update stream
    }
}
```

Forward port 443 to it. With nginx, turn off buffering for `/api/events` (the app already sends
`X-Accel-Buffering: no`) and allow request bodies up to 30 MB for audio uploads
(`client_max_body_size 30m`).

### Tailscale for you, the internet for players

Reach the stage privately over Tailscale and expose only the players’ paths publicly.

### Only on game nights

Start the container before you play and stop it after. Crude, but it removes nearly all exposure.

## Which paths are whose

If you restrict the storyteller’s side (Access policies, IP allow-lists), restrict these:

- Pages: `/`, `/login`, `/editor/…`, `/run`
- APIs: `/api/stories…`, `/api/admin/…`, `/api/state/start`, `/api/state/resume`

These must stay public, because phones use them (storyteller actions among them already need the
storyteller’s token):

- `/player/…`, `/assets/…` and the icons
- `/api/events`, `/api/state`, `/api/session/…`, `/api/config` and the other `/api/state/…` actions

## Updating

```bash
git pull
docker compose up -d --build
```

A game in progress carries on after the update. Browsers signed in before an update that changes
how sign-in works are asked to sign in again.
