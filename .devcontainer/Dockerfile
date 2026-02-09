FROM node:23-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  openssl \
  sqlite3 libsqlite3-dev \
  gdal-bin libgdal-dev \
  python3 python3-pip python3-gdal \
  make g++ \
  openjdk-17-jdk-headless \
  && rm -rf /var/lib/apt/lists/*


ENV DEBIAN_FRONTEND=noninteractive

COPY .devcontainer/installScripts/ /tmp/installScripts/

# Make scripts executable, run in sorted order, then clean up
RUN set -eux; \
  find /tmp/installScripts -type f -name '*.sh' -print0 \
  | sort -z \
  | xargs -r -0 -I{} bash -lc 'f="{}"; sed -i "s/\r$//" "$f" || true; chmod +x "$f"; echo "Running $f"; bash "$f"'; \
  rm -rf /tmp/installScripts

# Allow git to work inside workspace

COPY requirements.txt /tmp/requirements.txt

RUN pip install --no-cache-dir --break-system-packages -r /tmp/requirements.txt

WORKDIR /workspace
