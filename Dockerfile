# Multi-stage build for BP App (frontend + backend)
# Optimized for Render.com deployment with timeout prevention

FROM node:20-alpine AS build-frontend
WORKDIR /app

# Copy package files first for better caching
COPY frontend/package.json frontend/package-lock.json ./frontend/

# Install dependencies with timeout and retry settings
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-timeout 300000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm ci --prefix ./frontend --no-audit --no-fund

# Copy source code
COPY frontend ./frontend

# Build with timeout protection
RUN npm run build --prefix ./frontend

FROM node:20-alpine AS backend
WORKDIR /app
ENV NODE_ENV=production

# Copy package files first for better caching
COPY backend/package.json backend/package-lock.json ./backend/

# Install backend dependencies with timeout settings
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-timeout 300000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm ci --prefix ./backend --omit=dev --no-audit --no-fund

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

