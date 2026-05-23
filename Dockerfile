FROM node:24-slim

WORKDIR /app

COPY cm-calculator-web/package.json ./cm-calculator-web/
COPY cm-calculator-web/frontend/package.json ./cm-calculator-web/frontend/
COPY cm-calculator-web/server/package.json ./cm-calculator-web/server/

RUN cd cm-calculator-web \
  && npm install \
  && npm run install:all

COPY cm-calculator-web ./cm-calculator-web
COPY Input ./Input

RUN cd cm-calculator-web && npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0

WORKDIR /app/cm-calculator-web/server
CMD ["node", "dist/index.js"]
