FROM node:20-bookworm-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS backend
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install
COPY server ./
RUN npm run prisma:generate && npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app/server
ENV NODE_ENV=production
ENV PUBLIC_DIR=/app/public
COPY --from=backend /app/server/package*.json ./
COPY --from=backend /app/server/node_modules ./node_modules
COPY --from=backend /app/server/dist ./dist
COPY --from=backend /app/server/prisma ./prisma
COPY --from=frontend /app/dist /app/public
EXPOSE 8787
CMD ["node", "dist/index.js"]
