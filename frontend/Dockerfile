FROM node:20-slim

ENV UI_PATH /frontend

WORKDIR $UI_PATH

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "run", "start"]