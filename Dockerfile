# ✅ ใช้ base image ที่เตรียม Chromium ไว้ให้แล้ว
FROM mcr.microsoft.com/playwright:v1.55.0-jammy

# ตั้ง working directory
WORKDIR /app

# คัดลอกไฟล์และติดตั้ง dependency
COPY package*.json ./
RUN npm install

# คัดลอก source code ทั้งหมด
COPY . .

# ✅ ไม่ต้องรัน npx playwright install อีก เพราะ image นี้ลงให้แล้ว

CMD ["npm", "start"]
