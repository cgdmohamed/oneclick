# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* bun.lock* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage ---
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY src/db/migrations ./dist/db/migrations
# Bundle Arabic-capable PDF font (LOC-01) so renders work in a fresh container.
COPY assets ./assets

# Persist uploads across container restarts (OPS-05). For multi-instance
# deployments swap this for S3/R2 (SCL-02) — see README.
RUN mkdir -p /app/uploads/public /app/uploads/private
VOLUME ["/app/uploads"]

# Non-root user
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
