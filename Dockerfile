FROM node:20-alpine AS builder

# OpenSSL cần cho Prisma query engine trên Alpine
RUN apk add --no-cache openssl

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
COPY . .

# Generate Prisma client cho Linux (tạo ra .ts files + linux query engine)
RUN npx prisma generate

# Compile generated/ folder thành JS (vì nest build chỉ compile src/)
RUN npx tsc generated/prisma/client.ts generated/prisma/enums.ts generated/prisma/models.ts \
    --module commonjs --target ES2023 --esModuleInterop --skipLibCheck \
    --outDir . --rootDir .

# Build NestJS
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

EXPOSE 8080
CMD ["node", "dist/main"]
