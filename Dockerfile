FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
COPY . .

# Generate Prisma client cho Linux (tạo .ts files + linux query engine)
RUN npx prisma generate

# Build NestJS (src/ → dist/)
RUN npm run build

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/assets ./assets

# tsx cho phép Node.js đọc file .ts từ generated/ khi runtime
RUN npm install tsx

EXPOSE 8080
CMD ["node", "--require", "tsx/cjs", "dist/main"]
