# Chargee (شارجي) — production image.
#
# Debian "slim" base, not Alpine: Prisma's query engine binary links against glibc/OpenSSL and has
# a long history of breaking on musl (Alpine) images with confusing "libssl.so not found" errors at
# runtime, not at build time. Slim avoids that whole class of failure for a few extra MB.
#
# Three stages: install deps once, build once, then copy only the standalone runtime output into a
# clean final image (no source, no dev dependencies, no build cache).

# ---------- deps ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---------- builder ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
# Prisma's engine binary is picked per detected OpenSSL version at `generate`/`build` time — without
# openssl installed here it silently guesses (openssl-1.1.x) and can download an engine that doesn't
# match what's on the base image, which only surfaces as a runtime crash in the final container, not
# a build failure. Installing it here, not just in the runner stage, is what makes the guess correct.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Values only needed to satisfy build-time validation (see src/lib/secret.ts, src/modules/documents/storage.ts) —
# never baked into the image as real secrets. Real runtime values are supplied via `docker run -e` /
# docker-compose / your platform's environment variables at container start, not at build time.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV SESSION_SECRET="build-time-placeholder-not-used-at-runtime-32chars"
RUN npx prisma generate
RUN npm run build

# ---------- runner ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone server + only the node_modules it actually traced as used.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Prisma's generated client + query engine binary are not part of the standalone trace in every
# Prisma version — copying the whole client dir is cheap insurance against "cannot find module
# .prisma/client" at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Local-disk fallback for documents (see src/modules/documents/storage.ts). Mount a volume here in
# docker-compose if you use STORAGE_DRIVER=local; ignored entirely when STORAGE_DRIVER=s3.
RUN mkdir -p /app/storage/uploads && chown -R nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
