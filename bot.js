const axios = require('axios');
const { createClient } = require('redis');
require('dotenv').config();
const { chromium } = require('playwright');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const MIN_MAGNITUDE = 4.0;

// === Redis setup ===
const redisClient = createClient({ url: process.env.REDIS_URL });

redisClient.on('error', (err) => console.error('❌ Redis error:', err));

// === ฟังก์ชันส่ง Telegram ===
async function sendTelegram(text) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: CHAT_ID,
      text: text
    });
  } catch (err) {
    console.error('❌ Telegram error:', err.message);
  }
}

// === ฟังก์ชันดึงและแจ้งเตือนแผ่นดินไหว ===
async function checkEarthquakes() {
  console.log('⏰ Running earthquake check...');

  let browser;
  let page;
  
  try {
    // เพิ่ม timeout และ options สำหรับ stability
    browser = await chromium.launch({ 
      headless: true,
      timeout: 30000,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security'
      ]
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
    
    page = await context.newPage();
    
    // เพิ่ม timeout สำหรับทุก action
    page.setDefaultTimeout(30000);
    
    await page.goto('https://www.tmd.go.th/warning-and-events/warning-earthquake', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await page.waitForSelector('#section-list-contentInfo', { timeout: 15000 });

    const data = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.list-content'))
        .map((row) => {
          const anchor = row.querySelector('.link-list-title a');
          if (!anchor) return null;

          const href = anchor.getAttribute('href');
          const match = href.match(/\/(\d{12})$/);
          if (!match) return null;

          const id = match[1];
          const title = anchor.textContent.trim();
          const description = row.querySelector('.link-list-description a')?.textContent.trim();

          const day = id.substring(0, 2);
          const month = id.substring(2, 4);
          const year = id.substring(4, 8);
          const hour = id.substring(8, 10);
          const minute = id.substring(10, 12);

          const iso = `${year}-${month}-${day}T${hour}:${minute}:00+07:00`;
          const date = new Date(iso);

          const timeFormatted = date.toLocaleString('th-TH', {
            timeZone: 'Asia/Bangkok',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });

          return { id, title, description, timeFormatted };
        })
        .filter(Boolean);
    });

    console.log(`📊 Found ${data.length} earthquake records`);

    for (const item of data) {
      try {
        const alreadySent = await redisClient.get(item.id);
        const magnitudeMatch = item.title.match(/ขนาด\s([\d.]+)/);
        const magnitude = magnitudeMatch ? parseFloat(magnitudeMatch[1]) : null;

        if (!alreadySent && magnitude !== null && magnitude >= MIN_MAGNITUDE) {
          const message = `⚠️ แผ่นดินไหวแจ้งเตือน ⚠️\n\n${item.title}\n${item.description}\nเวลา: ${item.timeFormatted}`;
          await sendTelegram(message);
          await redisClient.set(item.id, '1', { EX: 86400 });
          console.log('✅ แจ้งเตือน:', item.title);
        }
      } catch (err) {
        console.error('❌ Redis/send error:', err.message);
      }
    }
    
  } catch (err) {
    console.error('❌ Scraping error:', err.message);
  } finally {
    // ปิด page และ browser ให้แน่ใจ
    try {
      if (page && !page.isClosed()) {
        await page.close();
      }
    } catch (pageErr) {
      console.error('❌ Page close error:', pageErr.message);
    }
    
    try {
      if (browser && browser.isConnected()) {
        await browser.close();
      }
    } catch (browserErr) {
      console.error('❌ Browser close error:', browserErr.message);
    }
  }
}

// === เริ่มต้นโปรแกรม ===
async function start() {
  try {
    await redisClient.connect();
    console.log('✅ Redis connected');
    
    // รัน check ครั้งแรก
    await checkEarthquakes();
    
    // ตั้ง interval (60 วินาที)
    const intervalId = setInterval(async () => {
      try {
        await checkEarthquakes();
      } catch (err) {
        console.error('❌ Interval check error:', err.message);
      }
    }, 60 * 1000);
    
    // จัดการ graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('🛑 Shutting down gracefully...');
      clearInterval(intervalId);
      try {
        await redisClient.disconnect();
      } catch (err) {
        console.error('❌ Redis disconnect error:', err.message);
      }
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      console.log('🛑 Shutting down gracefully...');
      clearInterval(intervalId);
      try {
        await redisClient.disconnect();
      } catch (err) {
        console.error('❌ Redis disconnect error:', err.message);
      }
      process.exit(0);
    });
    
  } catch (err) {
    console.error('❌ Start error:', err.message);
    process.exit(1);
  }
}

start();
