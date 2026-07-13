# Puppeteer's official image ships a matching Chromium + all system libs already,
# which removes the single most painful part of deploying an HTML->PDF service.
FROM ghcr.io/puppeteer/puppeteer:23.11.1

# The base image runs as the non-root "pptruser". Set workdir under its home.
WORKDIR /home/pptruser/app

# Install deps first for better layer caching.
COPY --chown=pptruser:pptruser package.json ./
# Let `npm install` download the exact Chrome build this Puppeteer version needs,
# into Puppeteer's own cache dir where it looks by default. (We deliberately do NOT
# set PUPPETEER_EXECUTABLE_PATH — the base image's Chrome is NOT at
# /usr/bin/google-chrome-stable in this version, which was causing launch failures.)
ENV NODE_ENV=production
RUN npm install --omit=dev

COPY --chown=pptruser:pptruser . .

ENV PORT=3000
EXPOSE 3000
CMD ["node", "src/server.js"]
