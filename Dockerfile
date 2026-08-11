FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY db/ ./db/
COPY database.json ./

EXPOSE 3000

CMD ["node", "src/server.js"]
