FROM node:22-alpine AS deps
WORKDIR /app
COPY backend/package.json ./package.json
RUN npm install --omit=dev

FROM node:22-alpine AS build-client
WORKDIR /app
COPY backend/package.json ./package.json
RUN npm install
COPY backend/prisma ./prisma
RUN npx prisma generate

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build-client /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build-client /app/node_modules/@prisma ./node_modules/@prisma
COPY backend/package.json ./package.json
COPY backend/prisma ./prisma
COPY backend/src ./src
EXPOSE 3000
# Aplica as migracoes antes de subir a API.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
