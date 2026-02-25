FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY shared/src ./shared/src
COPY server/package.json server/tsconfig.json ./server/
COPY server/src ./server/src

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @retailsync/shared build
RUN pnpm --filter @retailsync/server build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache wget && addgroup -S nodejs && adduser -S nodeuser -G nodejs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder /app/shared/package.json ./shared/package.json
COPY --from=builder /app/shared/node_modules ./shared/node_modules
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/src ./shared/src
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/server/tsconfig.json ./server/tsconfig.json
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/src ./server/src

USER nodeuser
WORKDIR /app
EXPOSE 8080

CMD ["node", "server/dist/index.js"]
