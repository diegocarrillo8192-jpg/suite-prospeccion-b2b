# Imagen oficial de Playwright: incluye Node.js, Chromium y sus dependencias
# del sistema, necesarios para el motor de scraping local.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# La imagen ya trae un usuario sin privilegios.
RUN chown -R pwuser:pwuser /app
USER pwuser
CMD ["npm", "start"]
