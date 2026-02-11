# syntax=docker/dockerfile:1.3

#-------------------------------------------------------------------------------
# Stage 1: Build Image
#
# This stage installs all dependencies (dev and prod), compiles native modules,
# and builds the application source code.
#-------------------------------------------------------------------------------
FROM node:23-slim AS build

# Install OS-level dependencies needed for building
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    sqlite3 libsqlite3-dev \
    gdal-bin libgdal-dev \
    python3 python3-pip python3-gdal python3-venv \
    make g++ \
    openjdk-17-jdk-headless \
    && rm -rf /var/lib/apt/lists/*


ENV HOME=/home/nodeuser

# Set up Java environment
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH="$JAVA_HOME/bin:$PATH"

# Enable pnpm via corepack
RUN npm i -g corepack@latest && corepack enable pnpm

WORKDIR /app

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeuser
RUN chown nodeuser:nodejs /app
RUN chown nodeuser:nodejs /

RUN mkdir -p $HOME && chown -R nodeuser:nodejs $HOME

# Copy all source files and configuration
COPY --chown=nodeuser:nodejs . .

# Set user for the rest of the build process
USER nodeuser

# Install all dependencies and run build scripts.
# Postinstall hooks will run here correctly because all files are present.
RUN --mount=type=secret,id=env,target=.env \
    pnpm install --frozen-lockfile --loglevel verbose

RUN --mount=type=secret,id=env,target=.env \
    pnpm zenstack-generate && pnpm run build

#-------------------------------------------------------------------------------
# Stage 2: Production Image
#-------------------------------------------------------------------------------
FROM node:23-slim AS production

# 1. Install Runtime Dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates openssl sqlite3 gdal-bin \
    openjdk-17-jdk-headless \
    python3 python3-pip python3-venv python3-gdal \
    && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH="$JAVA_HOME/bin:$PATH"
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

WORKDIR /app

# 2. Setup Python Environment
# Wir erstellen die venv direkt in /app/.venv, wie dein Code es erwartet
COPY requirements.txt /tmp/requirements.txt
RUN python3 -m venv --system-site-packages /app/.venv
ENV PATH="/app/.venv/bin:$PATH"
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# 3. Create User
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeuser

# 4. Copy Files (WICHTIG: Hier sind die Korrekturen)
COPY --from=build --chown=nodeuser:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodeuser:nodejs /app/.build ./.build
COPY --from=build --chown=nodeuser:nodejs /app/package.json ./
# DIESE ZEILE HAT GEFEHLT:
COPY --from=build --chown=nodeuser:nodejs /app/python ./python
# Falls du einen lokalen bin-Ordner hast (ohne führenden Slash!):
COPY --from=build --chown=nodeuser:nodejs /app/bin ./bin

# Berechtigungen für die venv an den user übertragen
RUN chown -R nodeuser:nodejs /app/.venv

# 5. Switch to User
USER nodeuser

EXPOSE 3000

CMD ["node", "--expose-gc", ".build/index.js"]
