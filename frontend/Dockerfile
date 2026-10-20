# syntax=docker/dockerfile:1
#
# Frontend image: build the React app with Node, then serve the finished files with nginx.
# Node is only needed to build. The final image has no Node, no node_modules, no source code.

# ---------- stage 1: build ----------
FROM node:22-alpine AS build
WORKDIR /app

# Dependency files first, for layer caching (same idea as the backend).
COPY package.json package-lock.json ./

# "npm ci" installs exactly what package-lock.json says, so builds are repeatable.
# The cache mount keeps npm's download cache between builds without storing it in the image.
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .
RUN npm run build

# ---------- stage 2: serve ----------
# The "unprivileged" nginx image runs as a normal user and listens on 8080 instead of 80.
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
