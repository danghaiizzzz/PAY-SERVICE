# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Runner
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

# Copy dist từ builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/proto ./proto   

EXPOSE 8080

CMD ["node", "dist/main.js"]