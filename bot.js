const axios = require('axios');
const { createClient } = require('redis');
require('dotenv').config();
const { chromium } = require('playwright');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

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
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://www.tmd.go.th/warning-and-events/warning-earthquake');
    await page.waitForSelector('#section-list-contentInfo');

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

    for (const item of data) {
      try {
        const alreadySent = await redisClient.get(item.id);
        if (!alreadySent) {
          const message = `⚠️ แผ่นดินไหวแจ้งเตือน ⚠️\n\n${item.title}\n${item.description}\nเวลา: ${item.timeFormatted}`;
          await sendTelegram(message);
          await redisClient.set(item.id, '1', { EX: 86400 });
          console.log('✅ แจ้งเตือน:', message);
        }
      } catch (err) {
        console.error('❌ Redis/set/send error:', err.message);
      }
    }
  } catch (err) {
    console.error('❌ Scraping error:', err.message);
  } finally {
    if (browser) await browser.close();
  }
}

// === เริ่มต้นโปรแกรม ===
async function start() {
  try {
    await redisClient.connect();
    await checkEarthquakes();
    setInterval(checkEarthquakes, 60 * 1000);
  } catch (err) {
    console.error('❌ Start error:', err.message);
  }
}

start();
