# Multi-stage build for BP App (frontend + backend)
# Optimized for Render.com deployment with fast builds and retry logic

FROM node:20-alpine AS build-frontend
WORKDIR /app

# Install build dependencies and configure npm for reliability
RUN apk add --no-cache git && \
    npm config set fetch-timeout 600000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    npm config set registry https://registry.npmjs.org/

# Copy package files first for better caching
COPY frontend/package.json frontend/package-lock.json ./frontend/

# Install dependencies with aggressive caching, retry logic, and optimization
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/tmp/.npm \
    cd ./frontend && \
    for i in 1 2 3; do \
        npm ci --no-audit --no-fund --prefer-offline --maxsockets 1 && break || \
        (echo "Attempt $i failed, retrying..." && sleep 5); \
    done

# Copy source code
COPY frontend ./frontend

# Build with production optimizations and chunk splitting
RUN cd ./frontend && \
    npm run build -- --mode production --minify --chunkSizeWarningLimit 1000

FROM node:20-alpine AS backend
WORKDIR /app
ENV NODE_ENV=production

# Configure npm for backend reliability
RUN npm config set fetch-timeout 600000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    npm config set registry https://registry.npmjs.org/

# Copy package files first for better caching
COPY backend/package.json backend/package-lock.json ./backend/

# Install backend dependencies with retry logic and optimization
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/tmp/.npm \
    cd ./backend && \
    for i in 1 2 3; do \
        npm ci --omit=dev --no-audit --no-fund --prefer-offline --maxsockets 1 && break || \
        (echo "Backend attempt $i failed, retrying..." && sleep 5); \
    done

# Copy backend source
COPY backend ./backend

# Copy built frontend
COPY --from=build-frontend /app/frontend/dist ./frontend/dist

# Ensure data dir exists and is a volume
RUN mkdir -p /app/backend/data
VOLUME ["/app/backend/data"]

EXPOSE 3001
WORKDIR /app/backend
CMD ["node", "server.js"]

