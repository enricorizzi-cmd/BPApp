# Multi-stage build for BP App (frontend + backend)
# Optimized for Render.com deployment with fast builds

FROM node:20-alpine AS build-frontend
WORKDIR /app

# Copy package files first for better caching
COPY frontend/package.json frontend/package-lock.json ./frontend/

# Install dependencies with aggressive caching and optimization
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-timeout 300000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm ci --prefix ./frontend --no-audit --no-fund --prefer-offline

# Copy source code
COPY frontend ./frontend

# Build with production optimizations
RUN npm run build --prefix ./frontend -- --mode production --minify

FROM node:20-alpine AS backend
WORKDIR /app
ENV NODE_ENV=production

# Copy package files first for better caching
COPY backend/package.json backend/package-lock.json ./backend/

# Install backend dependencies with aggressive optimization
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-timeout 300000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm ci --prefix ./backend --omit=dev --no-audit --no-fund --prefer-offline

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

