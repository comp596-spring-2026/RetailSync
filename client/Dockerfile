FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY shared/src ./shared/src
COPY client/package.json client/tsconfig.json client/tsconfig.node.json client/vite.config.ts client/index.html ./client/
COPY client/src ./client/src

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @retailsync/client build

FROM nginx:1.27-alpine AS runtime

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/client/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
