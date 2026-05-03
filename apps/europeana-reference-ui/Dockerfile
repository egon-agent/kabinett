FROM node:22-alpine

WORKDIR /app

COPY apps/europeana-reference-ui /app

ENV HOST=0.0.0.0
ENV PORT=4320
ENV VISUAL_SERVICE_URL=http://europeana-visual-service:4318

EXPOSE 4320

CMD ["node", "/app/server.mjs"]
