# Deploying ChatLOL to https://chatlol.net

One server running nginx, which serves the web app and passes `/api`, `/socket.io` and `/uploads` to the API
(two Node processes). MongoDB can be on the same server or on MongoDB Atlas.

```
browser ──https──▶ nginx ─┬─ /            → /var/www/chatlol/web      (built web app)
                          ├─ /uploads/    → /var/lib/chatlol/uploads  (photos, from disk)
                          └─ /api/, /socket.io/ → 127.0.0.1:4000, :4001 (API) ──▶ MongoDB
```

The files:

| File | Goes to |
|---|---|
| `nginx/chatlol.net.conf` | `/etc/nginx/sites-available/chatlol.net` |
| `nginx/snippets/chatlol-headers.conf` | `/etc/nginx/snippets/chatlol-headers.conf` |
| `nginx/chatlol.net.bootstrap.conf` | only while getting the first certificate |
| `systemd/chatlol-api@.service` | `/etc/systemd/system/chatlol-api@.service` |
| `api.env.example` | `/etc/chatlol/api.env` (fill it in) |

## 1. DNS

Point `chatlol.net` and `www.chatlol.net` (A, and AAAA if you have IPv6) at the server. If you use live video
through your own coturn, also point `turn.chatlol.net` at the TURN server.

## 2. Packages (Ubuntu / Debian)

```sh
sudo apt install nginx certbot
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install nodejs
```

MongoDB must run as a replica set (the API uses transactions). Atlas already is one. For your own MongoDB,
start it with `--replSet rs0` and run `rs.initiate()` once.

## 3. The code

```sh
sudo useradd --system --home /opt/chatlol --shell /usr/sbin/nologin chatlol
sudo mkdir -p /opt/chatlol /var/lib/chatlol/uploads /var/www/chatlol/web /var/www/letsencrypt /etc/chatlol
sudo chown -R chatlol:chatlol /opt/chatlol /var/lib/chatlol
sudo -u chatlol git clone <your repo> /opt/chatlol
cd /opt/chatlol
sudo -u chatlol npm ci -w @chatlol/server -w @chatlol/web -w @chatlol/shared
```

## 4. Build the web app

The web app calls the API on the same address (`/api`), so it needs no API URL.

```sh
cd /opt/chatlol
sudo -u chatlol npm run build -w @chatlol/web
sudo rsync -a --delete apps/web/dist/ /var/www/chatlol/web/
```

## 5. API settings

```sh
sudo cp deploy/api.env.example /etc/chatlol/api.env
sudo chmod 600 /etc/chatlol/api.env
sudo nano /etc/chatlol/api.env      # JWT_SECRET, MONGODB_URL, SMTP, keys…
```

`UPLOAD_DIR` must stay `/var/lib/chatlol/uploads` unless you also change `alias` in the nginx config.

## 6. Start the API

```sh
sudo cp deploy/systemd/chatlol-api@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now chatlol-api@4000 chatlol-api@4001
curl http://127.0.0.1:4000/api/health      # → {"ok":true,…}
journalctl -u chatlol-api@4000 -f          # logs
```

The two processes share everything through MongoDB (realtime messages, rate limits, which one runs the AI
personas). For one process, start only `chatlol-api@4000` and delete the `:4001` line from the nginx upstream.

## 7. HTTPS certificate and nginx

nginx won't start the full config before the certificate exists, so get it with the small bootstrap config first:

```sh
sudo cp deploy/nginx/chatlol.net.bootstrap.conf /etc/nginx/sites-available/chatlol.net
sudo ln -sf /etc/nginx/sites-available/chatlol.net /etc/nginx/sites-enabled/chatlol.net
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo certbot certonly --webroot -w /var/www/letsencrypt -d chatlol.net -d www.chatlol.net \
  --deploy-hook "systemctl reload nginx"

# Now the real config:
sudo cp deploy/nginx/snippets/chatlol-headers.conf /etc/nginx/snippets/
sudo cp deploy/nginx/chatlol.net.conf /etc/nginx/sites-available/chatlol.net
sudo nginx -t && sudo systemctl reload nginx
```

Certbot renews on its own through the same webroot and reloads nginx afterwards.

Open https://chatlol.net. Sign up with an address from `ADMIN_EMAILS` to get the admin panel.

## 8. Webhooks and app stores

- **Stripe**: webhook URL `https://chatlol.net/api/payments/stripe/webhook`, events `checkout.session.completed` and `charge.refunded`.
- **RevenueCat**: webhook URL `https://chatlol.net/api/payments/revenuecat/webhook`, with the same authorization value as `REVENUECAT_WEBHOOK_AUTH`.

## Updating

```sh
cd /opt/chatlol
sudo -u chatlol git pull
sudo -u chatlol npm ci -w @chatlol/server -w @chatlol/web -w @chatlol/shared
sudo -u chatlol npm run build -w @chatlol/web
sudo rsync -a --delete apps/web/dist/ /var/www/chatlol/web/
sudo systemctl restart chatlol-api@4000 && sleep 5 && sudo systemctl restart chatlol-api@4001
```

Restarting one process at a time keeps the site up: nginx sends everyone to the other one in the meantime.

## Behind Cloudflare

If the domain is proxied through Cloudflare, set SSL mode to **Full (strict)** and turn on WebSockets. To log
and rate-limit real visitor addresses instead of Cloudflare's, add `set_real_ip_from` lines for
[Cloudflare's ranges](https://www.cloudflare.com/ips/) and `real_ip_header CF-Connecting-IP;` to the server block.
