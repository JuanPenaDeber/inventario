# =============================================================================
# Build de producción: la app es un SPA estático (Vite + React), sin backend
# propio. Este Dockerfile compila y sirve los archivos estáticos con nginx.
#
# IMPORTANTE: las variables VITE_* se "hornean" dentro del JS en el paso de
# `npm run build` (etapa "build" de abajo) — no son variables que la app lea
# en tiempo de ejecución. Por eso acá son ARG (valores de build), no ENV del
# contenedor final. En Dokploy hay que configurarlas como Build Args /
# Build-time variables de la aplicación, no solo como "Environment" del
# contenedor en ejecución — si Dokploy solo las inyecta en runtime, esta
# imagen se construye igual pero con la API key vacía y la app falla al
# hacer la primera petición (ver shared/api/espoClient.ts).
# =============================================================================

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Únicamente VITE_ESPOCRM_API_KEY es obligatoria (sin ella `npm run build`
# igual termina bien — el error salta recién en el navegador, en la primera
# petición — así que si el build "pasa" sin este ARG no es señal de que esté
# bien configurado). El resto tiene default correcto en el código y solo
# hace falta pisarlo si tu EspoCRM quedó distinto (ver .env.example).
ARG VITE_ESPOCRM_API_KEY
ARG VITE_PURCHASE_ORDER_ENTITY
ARG VITE_PURCHASE_REQUEST_ENTITY
ARG VITE_PROFORMA_ENTITY
ARG VITE_SUGGESTION_ENTITY
ARG VITE_PHOTOS_BASE_URL
ARG VITE_ADMIN_PASSWORD

ENV VITE_ESPOCRM_API_KEY=$VITE_ESPOCRM_API_KEY \
    VITE_PURCHASE_ORDER_ENTITY=$VITE_PURCHASE_ORDER_ENTITY \
    VITE_PURCHASE_REQUEST_ENTITY=$VITE_PURCHASE_REQUEST_ENTITY \
    VITE_PROFORMA_ENTITY=$VITE_PROFORMA_ENTITY \
    VITE_SUGGESTION_ENTITY=$VITE_SUGGESTION_ENTITY \
    VITE_PHOTOS_BASE_URL=$VITE_PHOTOS_BASE_URL \
    VITE_ADMIN_PASSWORD=$VITE_ADMIN_PASSWORD

RUN npm run build

# --- Etapa final: solo los archivos estáticos + nginx ------------------------
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8020
