FROM node:20-alpine

WORKDIR /app

COPY package.json ./

# No external dependencies yet, but keep this for future migration steps.
RUN npm install --omit=dev

COPY . .

EXPOSE 3310

CMD ["node", "server.js"]
