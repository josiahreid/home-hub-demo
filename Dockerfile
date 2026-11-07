# Home Hub – production image (Next.js standalone server + built-in node:sqlite).
# Build:  docker build -t home-hub:latest .
# Run it with docker-compose.yml / portainer-stack.yml (Tailscale sidecar) – see DEPLOY.md.

# Node 24 has node:sqlite built in, so no native database driver is needed.
FROM node:24-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

# ── dependencies ──
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── build ──
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── runtime ──
FROM base AS runner
# links the published image to the (private) repo on GitHub
LABEL org.opencontainers.image.source="https://github.com/josiahreid/home-hub-demo"
WORKDIR /app
ENV NODE_ENV=production \
    TZ=Pacific/Auckland \
    HOME_HUB_DATA_DIR=/data \
    HOME_HUB_MODE=tailscale \
    PORT=3000 \
    HOSTNAME=127.0.0.1

# tzdata so the container's own clock/logs are NZ time too (Home Hub itself also forces NZ time)
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data && chown node:node /data

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# the sample-data loader (optional: `docker exec home-hub node scripts/sample-data.mjs`)
COPY --from=build --chown=node:node /app/scripts ./scripts

USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
