FROM node:20-alpine AS build
WORKDIR /app
# Cap V8 heap so `vite build` doesn't OOM on the small (~1.8 GB) shared host
# and disturb co-tenants. The SPA is small; 1 GB is ample headroom.
ENV NODE_OPTIONS=--max-old-space-size=1024

COPY package.json ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

COPY . .
RUN npm run build

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
