FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/dashboard/package.json frontend/dashboard/package.json
COPY frontend/landing/package.json frontend/landing/package.json
COPY packages/studio/package.json packages/studio/package.json
RUN npm ci
COPY packages/studio packages/studio
COPY frontend/landing frontend/landing
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @atelie/landing
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@atelie/landing"]
