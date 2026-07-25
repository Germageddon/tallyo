FROM node:20-slim
WORKDIR /app

# better-sqlite3 ships prebuilt binaries for common platforms, but keep build tooling
# available in case a source build is needed on this base image.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run typecheck

# Entrypoint (src/index.ts) is added in Milestone 3; until then this image is for
# build/CI parity. The bot uses Telegram long-polling (outbound only) — no ports.
CMD ["npx", "tsx", "src/index.ts"]
