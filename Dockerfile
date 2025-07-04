# syntax=docker/dockerfile:1.3

FROM node:23-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN npm i -g corepack@latest

# Install dependencies only when needed
FROM base AS deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
WORKDIR /app
# ENV COREPACK_INTEGRITY_KEYS=0
# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    --mount=type=secret,id=env,target=.env \
    corepack enable pnpm && pnpm i --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules

RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    --mount=type=secret,id=env,target=.env \
    corepack enable pnpm && pnpm zenstack-generate && pnpm run build

EXPOSE 3000

ENV PORT=3000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
ENV HOSTNAME="0.0.0.0"
CMD ["node", "build/index.js"]