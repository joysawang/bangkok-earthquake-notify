const axios = require('axios');
const { createClient } = require('redis');
require('dotenv').config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const API_URL = 'https://www.seismicportal.eu/fdsnws/event/1/query';

const BANGKOK_LAT = 13.7563;
const BANGKOK_LON = 100.5018;

const BBOX = {
  minlat: 5,
  maxlat: 30,
  minlon: 85,
  maxlon: 110
};

const MAX_DISTANCE_KM = 2000;
const MIN_MAGNITUDE = 0.0;

// === Redis setup ===
const redisClient = createClient({ url: process.env.REDIS_URL });

redisClient.on('error', (err) => console.error('❌ Redis error:', err));

// === คำนวณระยะทาง ===
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await axios.post(url, {
    chat_id: CHAT_ID,
    text: text
  });
}

// === ดึงและแจ้งเตือน ===
async function fetchEarthquakeData() {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const params = {
      format: 'json',
      starttime: oneDayAgo.toISOString(),
      endtime: now.toISOString(),
      minlat: BBOX.minlat,
      maxlat: BBOX.maxlat,
      minlon: BBOX.minlon,
      maxlon: BBOX.maxlon
    };

    const response = await axios.get(API_URL, { params });
    const earthquakes = response.data.features || [];

    for (const eq of earthquakes) {
      const props = eq.properties;
      const id = props.source_id;
      const lat = props.lat;
      const lon = props.lon;
      const magnitude = parseFloat(props.mag);
      const region = props.flynn_region || 'ไม่ระบุ';
      const time = new Date(props.time);

      const distance = calculateDistance(BANGKOK_LAT, BANGKOK_LON, lat, lon);

      if (magnitude >= MIN_MAGNITUDE && distance <= MAX_DISTANCE_KM) {
        // ตรวจว่าเคยแจ้งเตือนแล้วหรือยัง
        const alreadySent = await redisClient.get(id);
        if (!alreadySent) {
          const distanceFormatted = new Intl.NumberFormat().format(distance.toFixed(1));
          const timeFormatted = time.toLocaleString('th-TH', {
            timeZone: 'Asia/Bangkok',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });
          const message = `⚠️ แผ่นดินไหวแจ้งเตือน ⚠️\n\nสถานที่: ${region}\nขนาด: M${magnitude}\nห่างจากกรุงเทพ: ${distanceFormatted} กม.\nเวลา: ${timeFormatted}`;
          await sendTelegram(message);
          await redisClient.set(id, '1', { EX: 86400 }); // เก็บ eventid ไว้ 1 วัน
          console.log('✅ แจ้งเตือน:', message);
        } else {
          console.log('ℹ️ ข้าม event ซ้ำ:', id);
        }
      }
    }
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error.message);
  }
}

// === เริ่มระบบ ===
async function checkEarthquakes() {
  console.log('⏰ Running earthquake check...');
  await fetchEarthquakeData();
}

// === เริ่ม Redis ก่อนลูป ===
async function start() {
  await redisClient.connect();
  await checkEarthquakes();
  setInterval(checkEarthquakes, 60 * 1000);
}

start();
