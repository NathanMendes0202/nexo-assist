# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 é um módulo nativo: se não houver binário pré-compilado, compila aqui.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
# O lockfile é opcional: com ele a instalação é reprodutível (npm ci); sem ele, usa npm install.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM deps AS build
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXO_DB_PATH=/data/nexo.db
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# O SQLite fica em /data: monte um volume persistente aqui.
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data
EXPOSE 3000
# NENHUMA chave é gravada na imagem: a chave do provedor entra só quando o container sobe.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
