# Hosting Guide — Eurosky Newcomer Feed Generator

This guide covers how to deploy and operate the feed generator on a VM.

## Prerequisites

- A Linux VM (Ubuntu 22.04+ recommended) with public IPv4
- A domain name (e.g. `feed.eurosky.social`) with DNS A record pointing to the VM
- Node.js ≥ 20 installed
- A Bluesky account for publishing the feed record

## 1. Clone and Build

```bash
git clone https://github.com/flkcgn/jetstream_newcomer_cli.git
cd jetstream_newcomer_cli
npm install
npm run build
```

## 2. Configure Environment

Create a `.env` file (this file is gitignored and must never be committed):

```bash
# Required
FEEDGEN_HOSTNAME=feed.eurosky.social
FEEDGEN_PUBLISHER_DID=did:plc:your-publisher-did

# Optional (defaults shown)
FEEDGEN_PORT=3000
FEEDGEN_LISTEN_HOST=0.0.0.0
FEEDGEN_SQLITE_PATH=feed.db
FEEDGEN_MAX_POST_AGE_HOURS=48
FEEDGEN_GC_INTERVAL_MINUTES=30
FEEDGEN_DEBUG=false
```

Find your DID by visiting `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=your-handle.bsky.social`.

## 3. TLS Termination

The AT Protocol requires HTTPS for `did:web` resolution. Use a reverse proxy:

### Option A: Caddy (recommended, auto-TLS)

```
# /etc/caddy/Caddyfile
feed.eurosky.social {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl enable --now caddy
```

### Option B: nginx + certbot

```nginx
server {
    server_name feed.eurosky.social;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/feed.eurosky.social/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/feed.eurosky.social/privkey.pem;
}

server {
    listen 80;
    server_name feed.eurosky.social;
    return 301 https://$host$request_uri;
}
```

```bash
sudo certbot --nginx -d feed.eurosky.social
```

## 4. Run as systemd Service

```bash
sudo tee /etc/systemd/system/eurosky-feed.service > /dev/null << 'EOF'
[Unit]
Description=Eurosky Newcomer Feed Generator
After=network.target

[Service]
Type=simple
User=feedgen
WorkingDirectory=/opt/eurosky-feed
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5

EnvironmentFile=/opt/eurosky-feed/.env

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/eurosky-feed

[Install]
WantedBy=multi-user.target
EOF
```

```bash
sudo useradd -r -s /bin/false feedgen
sudo cp -r . /opt/eurosky-feed
sudo chown -R feedgen:feedgen /opt/eurosky-feed

sudo systemctl daemon-reload
sudo systemctl enable --now eurosky-feed
```

## 5. Verify the Service

```bash
# Check the service
sudo systemctl status eurosky-feed

# Health check
curl http://localhost:3000/

# DID document (must be accessible via HTTPS externally)
curl https://feed.eurosky.social/.well-known/did.json

# Feed skeleton
curl "https://feed.eurosky.social/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://YOUR_DID/app.bsky.feed.generator/eurosky-newcomers"
```

## 6. Publish the Feed

Once the server is running and reachable via HTTPS:

```bash
export BLUESKY_HANDLE=your-handle.bsky.social
export BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
npm run publish-feed
```

After publishing, users can find and subscribe to the feed in the Bluesky app.

## 7. Monitoring

### Logs

```bash
sudo journalctl -u eurosky-feed -f
```

### Health Check

The `/` endpoint returns the current post count:

```json
{
  "name": "eurosky-newcomer-feed",
  "version": "1.0.0",
  "feed": "eurosky-newcomers",
  "indexedPosts": 42
}
```

### Database

The SQLite database at `FEEDGEN_SQLITE_PATH` (default: `feed.db`) stores indexed posts. Garbage collection runs automatically every `FEEDGEN_GC_INTERVAL_MINUTES` (default: 30) and removes posts older than `FEEDGEN_MAX_POST_AGE_HOURS` (default: 48).

## 8. Updating

```bash
cd /opt/eurosky-feed
git pull
npm install
npm run build
sudo systemctl restart eurosky-feed
```

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Feed not appearing in app | Feed not published | Run `npm run publish-feed` |
| `did:web` resolution fails | HTTPS not configured | Set up TLS (see step 3) |
| No posts in feed | Jetstream not connected | Check logs for connection errors |
| Old posts not removed | GC not running | Check `FEEDGEN_GC_INTERVAL_MINUTES` |
| `FEEDGEN_PUBLISHER_DID` error | DID not set | Set the env var to your account DID |
