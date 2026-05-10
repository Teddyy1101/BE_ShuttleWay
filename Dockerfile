FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
COPY . .

# Generate Prisma client cho Linux
RUN npx prisma generate

# 1) Build NestJS (src/ → dist/) bằng SWC như cũ
RUN npm run build

# 2) Compile generated/ prisma files thành JS (tạo .js cạnh .ts)
RUN npx tsc -p tsconfig.generated.json

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
