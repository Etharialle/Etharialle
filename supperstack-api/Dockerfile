FROM node:22-alpine

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node src ./src

ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

USER node

CMD ["node", "--no-warnings", "src/index.mjs"]
