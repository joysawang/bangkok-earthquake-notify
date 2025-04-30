const axios = require('axios');
require('dotenv').config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// URL ของข้อมูลแผ่นดินไหวจาก USGS API
const USGS_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

// พิกัดกรุงเทพ
const BANGKOK_LAT = 13.7563;
const BANGKOK_LON = 100.5018;

// ระยะทางสูงสุดที่ต้องการแจ้งเตือน (กิโลเมตร)
const MAX_DISTANCE_KM = 2000;

// แรงสั่นสะเทือนต่ำสุด (M4.0 ขึ้นไป)
const MIN_MAGNITUDE = 4.0;

async function fetchEarthquakeData() {
  try {
    // ปรับเวลาให้ดึงข้อมูลจาก 1 นาทีที่ผ่านมา
    const params = {
      format: 'geojson',
      starttime: new Date(Date.now() - 60 * 1000).toISOString(), // 1 นาทีที่ผ่านมา
      endtime: new Date().toISOString(),
      minmagnitude: MIN_MAGNITUDE
    };

    const response = await axios.get(USGS_URL, { params });
    const earthquakes = response.data.features;

    for (const eq of earthquakes) {
      const magnitude = eq.properties.mag;
      const place = eq.properties.place || '';
      const time = new Date(eq.properties.time);
      const coords = eq.geometry.coordinates; // [longitude, latitude, depth]
      const eqLon = coords[0];
      const eqLat = coords[1];

      // คำนวณระยะห่างจากกรุงเทพ
      const distance = calculateDistance(BANGKOK_LAT, BANGKOK_LON, eqLat, eqLon);

      if (magnitude >= MIN_MAGNITUDE && distance <= MAX_DISTANCE_KM) {
        const distanceFormatted = new Intl.NumberFormat().format(distance.toFixed(1));
        const timeFormatted = time.toLocaleString('th-TH', { hour12: false });
        const message = `⚠️ แผ่นดินไหวแจ้งเตือน ⚠️\n\nสถานที่: ${place}\nขนาด: M${magnitude}\nห่างจากกรุงเทพ: ${distanceFormatted} กม.\nเวลา: ${timeFormatted}`;
        await sendTelegram(message);
        console.log('ส่งข้อความเตือนแล้ว:', message);
      }
    }
  } catch (error) {
    console.error('เกิดข้อผิดพลาด:', error.message);
  }
}

// ฟังก์ชันคำนวณระยะห่างระหว่าง 2 จุดพิกัด (หน่วย: กิโลเมตร)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // รัศมีโลก (กม.)
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
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
  try {
    console.log('⏰ Running earthquake check...');
    await fetchEarthquakeData();
  } catch (error) {
    console.error('❌ Error during check:', error.message);
  }
}

// เรียกทุก 60,000 มิลลิวินาที = 1 นาที
setInterval(checkEarthquakes, 60 * 1000);

// เรียกตอนเริ่มโปรแกรมด้วย
checkEarthquakes();
