# Multi-stage build for BP App (frontend + backend)

FROM node:20-alpine AS build-frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN --mount=type=cache,target=/root/.npm npm ci --prefix ./frontend
COPY frontend ./frontend
RUN npm run build --prefix ./frontend

FROM node:20-alpine AS backend
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json ./backend/
RUN --mount=type=cache,target=/root/.npm npm ci --prefix ./backend --omit=dev
COPY backend ./backend
# copy built frontend into expected path (served by express)
COPY --from=build-frontend /app/frontend/dist ./frontend/dist

# Ensure data dir exists and is a volume
RUN mkdir -p /app/backend/data
VOLUME ["/app/backend/data"]

EXPOSE 3001
WORKDIR /app/backend
CMD ["node", "server.js"]

