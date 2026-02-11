FROM node:23-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  openssl \
  sqlite3 libsqlite3-dev \
  gdal-bin libgdal-dev \
  python3 python3-pip python3-venv python3-gdal \
  make g++ \
  openjdk-17-jdk-headless \
  docker-buildx-plugin \
  && rm -rf /var/lib/apt/lists/*


ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /workspace

COPY .devcontainer/installScripts/ /tmp/installScripts/

# Make scripts executable, run in sorted order, then clean up
RUN set -eux; \
  find /tmp/installScripts -type f -name '*.sh' -print0 \
  | sort -z \
  | xargs -r -0 -I{} bash -lc 'f="{}"; sed -i "s/\r$//" "$f" || true; chmod +x "$f"; echo "Running $f"; bash "$f"'; \
  rm -rf /tmp/installScripts

RUN python3 -m venv --system-site-packages /workspace/.venv
ENV PATH="/workspace/.venv/bin:$PATH"
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

