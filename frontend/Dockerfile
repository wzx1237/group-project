FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG GRADEFLOW_API=http://127.0.0.1:8000
ENV GRADEFLOW_API=$GRADEFLOW_API
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
