# ChatLOL API — build from the repo root:  docker build -f apps/server/Dockerfile -t chatlol-api .
ARG NODE_IMAGE=node:22-slim
FROM ${NODE_IMAGE}
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
# The optional "ca" secret lets builds behind a TLS-inspecting proxy trust its CA; normal builds don't need it.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    corepack enable && pnpm install --frozen-lockfile --filter @chatlol/server... --config.ignore-scripts=true
COPY packages/shared packages/shared
COPY apps/server apps/server
WORKDIR /app/apps/server
ENV NODE_ENV=production PORT=4000 UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "--import", "tsx", "src/index.ts"]
