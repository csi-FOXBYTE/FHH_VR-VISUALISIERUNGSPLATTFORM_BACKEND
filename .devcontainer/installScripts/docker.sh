#!/usr/bin/env bash
set -euo pipefail

# Use sudo only when not root
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "Not root and sudo is unavailable." >&2
    exit 1
  fi
fi

# Skip if already installed
if command -v docker >/dev/null 2>&1; then
  echo "docker CLI already installed, skipping."
  exit 0
fi

# Make sure apt is ready and required tools are present
$SUDO apt-get update -y
$SUDO apt-get install -y --no-install-recommends ca-certificates curl gnupg

# Keyring directory (note: 'install -d' has no '-y' flag)
$SUDO install -m 0755 -d /etc/apt/keyrings

# Import Docker's GPG key
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
$SUDO chmod a+r /etc/apt/keyrings/docker.gpg

# Figure out Debian codename (fallback to bookworm)
. /etc/os-release
CODENAME="${VERSION_CODENAME:-bookworm}"

# Add Docker repo
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/debian ${CODENAME} stable" \
  | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null

# Install Docker CLI and Buildx after adding Docker's package repository
$SUDO apt-get update -y
$SUDO apt-get install -y --no-install-recommends \
  docker-ce-cli \
  docker-buildx-plugin

# Optional cleanup to keep the image slim
$SUDO rm -rf /var/lib/apt/lists/*
