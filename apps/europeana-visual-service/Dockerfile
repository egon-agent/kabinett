FROM node:22-bookworm-slim

WORKDIR /app

COPY apps/europeana-visual-service/package.json /app/apps/europeana-visual-service/package.json
RUN npm install --prefix /app/apps/europeana-visual-service

COPY apps/europeana-visual-service /app/apps/europeana-visual-service
COPY packages/europeana-visual-core /app/packages/europeana-visual-core

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4318
ENV KABINETT_CLIP_ALLOW_REMOTE=1

EXPOSE 4318

CMD ["node", "/app/apps/europeana-visual-service/node_modules/tsx/dist/cli.mjs", "/app/apps/europeana-visual-service/server.ts"]
