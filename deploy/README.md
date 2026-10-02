# Deploying ChatLOL to https://chatlol.net

One server running nginx, which serves the web app and passes `/api`, `/socket.io` and `/uploads` to the API
(a Node process on port 4510, run by PM2). MongoDB can be on the same server or on MongoDB Atlas.

```
browser ──https──▶ nginx ─┬─ /            → /var/www/chatlol/apps/web/dist (built web app)
                          ├─ /uploads/    → /var/lib/chatlol/uploads  (photos, from disk)
                          └─ /api/, /socket.io/ → 127.0.0.1:4510 (API) ──▶ MongoDB
```

The files:

| File | Goes to |
|---|---|
| `nginx/chatlol.net.conf` | `/etc/nginx/sites-available/chatlol.net` |
| `nginx/snippets/chatlol-headers.conf` | `/etc/nginx/snippets/chatlol-headers.conf` |
| `nginx/chatlol.net.bootstrap.conf` | only while getting the first certificate |
| `pm2/ecosystem.config.cjs` | stays in the repo; `pm2 start` uses it |
| `systemd/chatlol-api@.service` | only if you use systemd instead of PM2 |
| `api.env.example` | `/etc/chatlol/api.env` (fill it in) |
| `coturn/turnserver.conf` | `/etc/turnserver.conf` (live video relay, optional) |

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

The code lives in `/var/www/chatlol` and runs as its own user, not root:

```sh
sudo useradd --system --home /var/www/chatlol --shell /usr/sbin/nologin chatlol
sudo git clone <your repo> /var/www/chatlol        # skip if it's already there
sudo mkdir -p /var/lib/chatlol/uploads /var/www/letsencrypt /etc/chatlol
sudo chown -R chatlol:chatlol /var/www/chatlol /var/lib/chatlol
cd /var/www/chatlol
sudo -u chatlol npm ci
```

Install from the repo root (`/var/www/chatlol`), not from `apps/server`: it's one workspace, and the server and
web app both need the shared package.

Don't use `npm run dev` on the server: that's development mode (restarts on every file change). The API runs
through systemd in step 6.

## 4. Build the web app

The web app calls the API on the same address (`/api`), so it needs no API URL.

```sh
cd /var/www/chatlol
sudo -u chatlol npm run build -w @chatlol/web
```

nginx serves `apps/web/dist` directly, so there's nothing to copy.

## 5. API settings

```sh
sudo cp deploy/api.env.example /etc/chatlol/api.env
sudo chmod 600 /etc/chatlol/api.env
sudo nano /etc/chatlol/api.env      # JWT_SECRET, MONGODB_URL, SMTP, keys…
```

`UPLOAD_DIR` must stay `/var/lib/chatlol/uploads` unless you also change `alias` in the nginx config.

## 6. Start the API (PM2)

```sh
sudo npm install -g pm2
cd /var/www/chatlol
pm2 start deploy/pm2/ecosystem.config.cjs
curl http://127.0.0.1:4510/api/health      # → {"ok":true,…}

pm2 save                                   # remember what's running…
pm2 startup                                # …and start it after a reboot (run the command it prints)
pm2 install pm2-logrotate                  # keep log files from growing forever
```

The API listens on `127.0.0.1:4510`, which is what the nginx upstream points at. Its settings come from
`/etc/chatlol/api.env`. The port, `HOST=127.0.0.1` and `NODE_ENV=production` are set in the PM2 config and win
over that file, so don't put `PORT` there.

| | |
|---|---|
| Status | `pm2 status` |
| Logs | `pm2 logs chatlol-api` |
| Restart | `pm2 restart chatlol-api` |
| After editing `/etc/chatlol/api.env` | `pm2 restart chatlol-api` |

Don't use PM2's cluster mode (`-i max`): realtime (Socket.IO) needs each visitor to stay on one process. For more
capacity, uncomment the second app (port 4511) in `ecosystem.config.cjs` and the `4511` line in the nginx
upstream; nginx keeps visitors on one process, and the processes share everything through MongoDB.

<details><summary>Using systemd instead of PM2</summary>

```sh
sudo cp deploy/systemd/chatlol-api@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now chatlol-api@4510
journalctl -u chatlol-api@4510 -f
```

</details>

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

## Uploads on Cloudflare R2

Photos can live in a Cloudflare R2 bucket instead of on this server's disk: no disk to fill up, served from
Cloudflare's network, and free egress.

1. **Create the bucket.** Cloudflare dashboard → R2 → *Create bucket*, e.g. `chatlol-uploads`.
2. **Give it a public address.** The bucket → *Settings* → *Custom Domains* → *Connect domain* → `media.chatlol.net`
   (chatlol.net must be on Cloudflare DNS). Use this, not the `r2.dev` address, which Cloudflare rate-limits and
   doesn't cache.
3. **Create a key.** R2 → *Manage R2 API Tokens* → *Create API token* → permission *Object Read & Write*, limited to
   that bucket. Copy the *Access Key ID*, *Secret Access Key*, and the S3 endpoint
   (`https://<account id>.r2.cloudflarestorage.com`).
4. **Tell ChatLOL.** In `/etc/chatlol/api.env`:

   ```sh
   S3_BUCKET=chatlol-uploads
   S3_REGION=auto
   S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
   S3_PUBLIC_URL=https://media.chatlol.net
   S3_ACCESS_KEY_ID=<access key id>
   S3_SECRET_ACCESS_KEY=<secret access key>
   ```

5. `pm2 restart chatlol-api`, upload a photo, and check its address starts with `https://media.chatlol.net/uploads/`.

If `S3_BUCKET` is set without a proper `S3_PUBLIC_URL`, the API refuses to start and says why, rather than saving
photos nobody can see. Photos uploaded before the switch keep their old `https://chatlol.net/uploads/…` addresses
and keep loading from the server, so leave the `/uploads/` part of the nginx config in place.

## Live video relay (TURN)

Live video connects people directly. On strict networks (some mobile carriers, offices, hotels) that fails, and a
TURN server relays the video instead. coturn can run on this same server.

1. **DNS.** Add an A record `turn.chatlol.net` → this server's IP. If the domain is on Cloudflare, set it to
   **DNS only** (grey cloud): Cloudflare can't proxy TURN.

2. **Install coturn and the config.**

   ```sh
   sudo apt install coturn
   sudo cp deploy/coturn/turnserver.conf /etc/turnserver.conf
   openssl rand -hex 32                 # the shared secret
   sudo nano /etc/turnserver.conf       # put it in static-auth-secret=…
   ```

   If the server is behind NAT (its network card has a private 10.x / 172.16–31.x / 192.168.x address, as on AWS
   or GCP), also set `external-ip=<public IP>`. A VPS whose card has the public IP doesn't need it.

3. **Certificate for `turns:`** (TLS on port 5349, which gets through firewalls that block everything but HTTPS).
   The nginx config already answers certbot for `turn.chatlol.net`:

   ```sh
   sudo mkdir -p /etc/coturn/certs /var/log/turnserver
   sudo chown turnserver:turnserver /var/log/turnserver
   sudo certbot certonly --webroot -w /var/www/letsencrypt -d turn.chatlol.net \
     --deploy-hook 'cp -L /etc/letsencrypt/live/turn.chatlol.net/{fullchain,privkey}.pem /etc/coturn/certs/ && chown turnserver:turnserver /etc/coturn/certs/*.pem && systemctl restart coturn'
   ```

   The hook copies the certificate where coturn can read it, on every renewal.

4. **Firewall.**

   ```sh
   sudo ufw allow 3478/udp && sudo ufw allow 3478/tcp && sudo ufw allow 5349/tcp
   sudo ufw allow 49160:49200/udp       # relayed video (min-port…max-port in turnserver.conf)
   ```

   If your VPS provider also has a firewall in its control panel, open the same ports there.

5. **Start coturn.**

   ```sh
   echo 'TURNSERVER_ENABLED=1' | sudo tee /etc/default/coturn   # older Debian/Ubuntu packages need this
   sudo systemctl enable --now coturn
   sudo systemctl status coturn
   ```

6. **Tell ChatLOL.** In `/etc/chatlol/api.env`, the same secret:

   ```sh
   TURN_URLS=turn:turn.chatlol.net:3478?transport=udp,turn:turn.chatlol.net:3478?transport=tcp,turns:turn.chatlol.net:5349?transport=tcp
   TURN_SECRET=<the same value as static-auth-secret>
   ```

   Then `pm2 restart chatlol-api`.

7. **Check it.** Signed in on chatlol.net, open the browser console (F12) and run:

   ```js
   fetch('/api/rtc/ice', { headers: { Authorization: 'Bearer ' + localStorage.getItem('chatlol.token') } }).then((r) => r.json()).then(console.log)
   ```

   It lists the TURN addresses with a `username` and `credential`. Paste those into
   [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/) (one server at a time,
   e.g. `turn:turn.chatlol.net:3478?transport=udp`) and press *Gather candidates*: a line of type **relay** means
   TURN works. A `401` in `/var/log/turnserver/turnserver.log` means the two secrets don't match.

`RTC_RELAY_ONLY=1` sends all live video through TURN, which hides viewers' and streamers' IP addresses from each
other, at the cost of your server's bandwidth.

## Updating

```sh
cd /var/www/chatlol
sudo -u chatlol git pull
sudo -u chatlol npm ci
sudo -u chatlol npm run build -w @chatlol/web
pm2 restart chatlol-api
```

A restart takes a few seconds. With a second process on 4511, restart them one at a time
(`pm2 restart chatlol-api && sleep 5 && pm2 restart chatlol-api-2`) and the site stays up: nginx sends everyone
to the other one in the meantime.

## Behind Cloudflare

If the domain is proxied through Cloudflare, set SSL mode to **Full (strict)** and turn on WebSockets. To log
and rate-limit real visitor addresses instead of Cloudflare's, add `set_real_ip_from` lines for
[Cloudflare's ranges](https://www.cloudflare.com/ips/) and `real_ip_header CF-Connecting-IP;` to the server block.
