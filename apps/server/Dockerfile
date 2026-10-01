# ChatLOL API — build from the repo root:  docker build -f apps/server/Dockerfile -t chatlol-api .
ARG NODE_IMAGE=node:22-slim
FROM ${NODE_IMAGE}
WORKDIR /app
# All workspace manifests are copied so npm ci can match the lockfile; only the server's deps get installed.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/native/package.json apps/native/
COPY apps/desktop/package.json apps/desktop/
# The optional "ca" secret lets builds behind a TLS-inspecting proxy trust its CA; normal builds don't need it.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --omit=dev --ignore-scripts -w @chatlol/server
COPY packages/shared packages/shared
COPY apps/server apps/server
WORKDIR /app/apps/server
ENV NODE_ENV=production PORT=4000 UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
