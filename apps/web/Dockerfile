# ChatLOL web — build from the repo root:  docker build -f apps/web/Dockerfile -t chatlol-web .
ARG NODE_IMAGE=node:22-slim
ARG NGINX_IMAGE=nginx:1.27-alpine
FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    corepack enable && pnpm install --frozen-lockfile --filter @chatlol/web... --config.ignore-scripts=true
COPY packages/shared packages/shared
COPY apps/web apps/web
# Empty = same origin (nginx below proxies /api, /uploads and /socket.io to the API).
ARG VITE_API_URL=
RUN pnpm --filter @chatlol/web exec vite build

FROM ${NGINX_IMAGE}
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
