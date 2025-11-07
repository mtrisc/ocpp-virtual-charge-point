FROM node:25-slim as builder
LABEL authors="mobility"

# Set working directory
WORKDIR /app

# Install dependencies first (better Docker layer caching)
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:25-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force


COPY --from=builder /app/dist ./dist

# Expose admin API port
EXPOSE 9999

# Run the TypeScript entrypoint with tsx
ENTRYPOINT ["node", "dist/stationAPIServer.js"]