FROM node:18-alpine

# ตั้ง working directory
WORKDIR /app

# คัดลอกไฟล์และติดตั้ง dependency
COPY package*.json ./
RUN npm install

# คัดลอก source code ทั้งหมด
COPY . .

CMD ["yarn", "start"]
