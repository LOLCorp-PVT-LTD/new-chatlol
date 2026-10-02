// ChatLOL API under PM2, on 127.0.0.1:4510 (what the nginx upstream points at).
//
//   cd /var/www/chatlol
//   pm2 start deploy/pm2/ecosystem.config.cjs
//   pm2 save && pm2 startup        # start again after a reboot (run the command `pm2 startup` prints)
//
// Settings (database, secrets, email…) come from /etc/chatlol/api.env (see deploy/api.env.example).
// PORT, HOST and NODE_ENV are set here and win over that file.
const path = require('node:path');

const server = path.join(__dirname, '../../apps/server');
const api = (name, port) => ({
  name,
  cwd: server,
  script: 'src/index.js',
  node_args: '--env-file=/etc/chatlol/api.env',
  // Fork mode, one process per port. Not PM2's cluster mode: Socket.IO needs each visitor to stay on one process,
  // which nginx does per port (ip_hash) but PM2's shared-port cluster can't.
  exec_mode: 'fork',
  instances: 1,
  env: { NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1' },
  autorestart: true,
  max_restarts: 20,
  min_uptime: '10s',
  restart_delay: 3000,
  kill_timeout: 15000,
  max_memory_restart: '1G',
  time: true, // timestamps in `pm2 logs`
});

module.exports = {
  apps: [
    api('chatlol-api', 4510),
    // More capacity: uncomment, uncomment the 4511 line in the nginx upstream, then `pm2 reload deploy/pm2/ecosystem.config.cjs`.
    // api('chatlol-api-2', 4511),
  ],
};
