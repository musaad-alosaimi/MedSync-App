# ---- build the Angular/Ionic web app ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Public https URL of the MedSync API (the MedSync-Server service). Set it as a Railway variable named API_URL.
ARG API_URL
RUN test -n "$API_URL" || (echo "ERROR: set the API_URL variable to the deployed API, e.g. https://medsync-api.up.railway.app" >&2; exit 1)
RUN sed -i "s|apiUrl: '[^']*'|apiUrl: '${API_URL%/}'|" src/environments/environment.prod.ts \
 && grep -n "apiUrl" src/environments/environment.prod.ts
RUN npx ng build --configuration production

# ---- serve the static build ----
FROM nginx:1.27-alpine
# nginx's entrypoint renders /etc/nginx/templates/*.template, substituting ${PORT} (Railway injects it).
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/www /usr/share/nginx/html
ENV PORT=8080
