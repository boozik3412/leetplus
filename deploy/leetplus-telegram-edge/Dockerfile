FROM node:24-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
ARG API_URL=https://api.leetplus.ru
ARG NEXT_PUBLIC_API_URL=https://api.leetplus.ru
ENV API_URL=$API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter database db:generate \
  && pnpm --filter api build \
  && pnpm --filter web build \
  && pnpm store prune

EXPOSE 4010 3100
