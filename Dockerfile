FROM node:24-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm check

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:/data/agent-artifacts.db
ENV STORAGE_DIR=/data/files

EXPOSE 3000
VOLUME ["/data"]

CMD ["pnpm", "start"]
