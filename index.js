const axios = require('axios');
require('dotenv').config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const API_URL = 'https://www.seismicportal.eu/fdsnws/event/1/query';

// พิกัดกรุงเทพ
const BANGKOK_LAT = 13.7563;
const BANGKOK_LON = 100.5018;

// พื้นที่ล้อมรอบพม่าและไทย (ประมาณ)
const BBOX = {
  minlat: 5,
  maxlat: 30,
  minlon: 85,
  maxlon: 110
};

const MAX_DISTANCE_KM = 2000;
const MIN_MAGNITUDE = 0.0;

async function fetchEarthquakeData() {
  try {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 1 * 60 * 1000);

    const params = {
      format: 'json',
      starttime: oneMinuteAgo,
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
      const lat = props.lat;
      const lon = props.lon;
      const magnitude = parseFloat(props.mag);
      const region = props.flynn_region || 'ไม่ระบุ';
      const time = new Date(props.time);

      const distance = calculateDistance(BANGKOK_LAT, BANGKOK_LON, lat, lon);

      if (magnitude >= MIN_MAGNITUDE && distance <= MAX_DISTANCE_KM) {
        const distanceFormatted = new Intl.NumberFormat().format(distance.toFixed(1));
        const timeFormatted = time.toLocaleString('th-TH', { hour12: false });
        const message = `⚠️ แผ่นดินไหวแจ้งเตือน ⚠️\n\nสถานที่: ${region}\nขนาด: M${magnitude}\nห่างจากกรุงเทพ: ${distanceFormatted} กม.\nเวลา: ${timeFormatted}`;
        await sendTelegram(message);
        console.log('ส่งข้อความเตือนแล้ว:', message);
      }
    }
  } catch (error) {
    console.error('เกิดข้อผิดพลาด:', error.message);
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) ** 2;
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

async function checkEarthquakes() {
  console.log('⏰ Running earthquake check...');
  await fetchEarthquakeData();
}

setInterval(checkEarthquakes, 60 * 1000);
checkEarthquakes();
