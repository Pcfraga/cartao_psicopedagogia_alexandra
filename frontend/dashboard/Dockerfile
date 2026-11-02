FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/dashboard/package.json frontend/dashboard/package.json
COPY frontend/landing/package.json frontend/landing/package.json
COPY packages/studio/package.json packages/studio/package.json
RUN npm ci
COPY packages/studio packages/studio
COPY frontend/dashboard frontend/dashboard
ARG VITE_API_URL
ARG VITE_PUBLIC_SITE_URL
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ENV VITE_API_URL=$VITE_API_URL VITE_PUBLIC_SITE_URL=$VITE_PUBLIC_SITE_URL VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
RUN npm run build -w @atelie/dashboard
FROM nginx:stable-alpine
COPY frontend/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dashboard/dist /usr/share/nginx/html
EXPOSE 80
