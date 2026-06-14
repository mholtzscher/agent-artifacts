FROM oven/bun:1.3.13-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run check

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:/data/agent-artifacts.db
ENV STORAGE_DIR=/data/files

EXPOSE 3000
VOLUME ["/data"]

CMD ["bun", "run", "start"]
