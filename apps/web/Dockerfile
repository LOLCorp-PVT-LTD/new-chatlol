# ChatLOL web — build from the repo root:  docker build -f apps/web/Dockerfile -t chatlol-web .
ARG NODE_IMAGE=node:22-slim
ARG NGINX_IMAGE=nginx:1.27-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/native/package.json apps/native/
COPY apps/desktop/package.json apps/desktop/
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --ignore-scripts -w @chatlol/web
COPY packages/shared packages/shared
COPY apps/web apps/web
# Empty = same origin (nginx below proxies /api, /uploads and /socket.io to the API).
ARG VITE_API_URL=
RUN npm exec -w @chatlol/web -- vite build

FROM ${NGINX_IMAGE}
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
