FROM node:20-alpine AS deps
WORKDIR /app
COPY shared ./shared
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY shared ./shared
COPY backend ./backend
COPY --from=deps /app/backend/node_modules ./backend/node_modules
WORKDIR /app/backend
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app/backend
ENV NODE_ENV=production
COPY --from=build /app/shared /app/shared
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/package.json ./
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/scripts ./scripts
COPY --from=build /app/backend/data ./data
COPY --from=build /app/backend/tsconfig.json ./
COPY --from=build /app/backend/entrypoint.sh ./entrypoint.sh
EXPOSE 3000
CMD ["./entrypoint.sh"]
