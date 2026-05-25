#!/usr/bin/env bash
set -euo pipefail

echo "Node:"
node -v || true

echo "npm:"
npm -v || true

echo "npm registry:"
npm config get registry || true

echo "npm always-auth:"
npm config get always-auth || true

echo "package manager from package.json:"
node -e "console.log(require('./package.json').packageManager || 'not set')" || true

echo "Checking npm registry access..."
npm ping --registry=https://registry.npmjs.org/ || true

echo "Checking package-lock..."
test -f package-lock.json && echo "package-lock.json exists" || echo "package-lock.json missing"

echo "Checking yarn.lock..."
test -f yarn.lock && echo "WARNING: yarn.lock exists" || echo "yarn.lock not found"
