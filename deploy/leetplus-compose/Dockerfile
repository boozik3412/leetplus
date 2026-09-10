# syntax=docker/dockerfile:1
FROM node:22.22.2-bookworm-slim@sha256:868499d55378719bffa87b0ed1f099591823c029b543043c09c2483468e93201 AS dependencies
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/database/package.json ./packages/database/package.json

FROM dependencies AS build
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
ARG RELEASE_SHA
ARG BUILD_TIME
ENV CI_RELEASE_SHA=$RELEASE_SHA RELEASE_SHA=$RELEASE_SHA BUILD_TIME=$BUILD_TIME
ENV API_URL=http://127.0.0.1:4000 NEXT_PUBLIC_API_URL=https://api.leetplus.ru
RUN node deploy/leetplus-compose/image-metadata.mjs write /app/release.json
RUN pnpm --filter database db:generate && pnpm --filter api build && pnpm --filter web build
RUN node -e 'const fs=require("fs"),p=require("path");fs.cpSync(p.dirname(require.resolve("typescript/package.json",{paths:["/app/apps/web"]})),"/runtime-typescript",{recursive:true})'

FROM dependencies AS production-dependencies
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
COPY packages/database/prisma ./packages/database/prisma
RUN pnpm --filter database db:generate

FROM node:22.22.2-bookworm-slim@sha256:868499d55378719bffa87b0ed1f099591823c029b543043c09c2483468e93201 AS runtime
ARG RELEASE_SHA
LABEL org.opencontainers.image.revision=$RELEASE_SHA ru.leetplus.contract=LEETPLUS_COMPOSE_BLUE_GREEN_V1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN for pair in api-blue:12010 api-green:12011 web-blue:12020 web-green:12021 bonus-worker:12040 daily-worker:12041; do name=${pair%:*}; uid=${pair#*:}; groupadd -g "$uid" "$name"; useradd --no-log-init -u "$uid" -g "$uid" -M -s /usr/sbin/nologin "$name"; done \
    && groupadd -g 12050 leetplus-audit
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=production-dependencies /app /app
COPY --from=build /app/release.json /app/release.json
COPY deploy/leetplus-compose/runtime-entry.cjs /opt/leetplus/runtime-entry.cjs
COPY deploy/leetplus-compose/health.cjs /opt/leetplus/health.cjs
USER 12010:12010
ENTRYPOINT ["node", "/opt/leetplus/runtime-entry.cjs"]

FROM runtime AS api
COPY --from=build /app/apps/api/dist /app/apps/api/dist
CMD ["api"]

FROM runtime AS web
COPY --from=build /runtime-typescript /app/apps/web/node_modules/typescript
COPY --from=build /app/apps/web/.next /app/apps/web/.next
COPY --from=build /app/apps/web/public /app/apps/web/public
COPY --from=build /app/apps/web/next.config.ts /app/apps/web/next.config.ts
CMD ["web"]
