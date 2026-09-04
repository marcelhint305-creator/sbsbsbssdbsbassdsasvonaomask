const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

// 🔥 LOGGING MIDDLEWARE
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 🔥 RAILWAY PORT CONFIGURATION
const PORT = process.env.PORT || 8080;

// 🔥 FULL PASARAN
const PASARAN = {
  "m17": "TOTO MACAU 4D",
  "m51": "TOTO MACAU 5D",
  "m83": "KINGKONG 4D",
  "p13863": "TOTO BEIJING",
  "p13852": "CHINA",
  "p13851": "CAMBODIA",
  "p13855": "HONGKONG",
  "p13860": "SINGAPORE",
  "p13862": "TAIWAN",
  "p13861": "SYDNEY",
  "p13859": "ROMA",
  "p13856": "MADRID",
  "p28515": "JEJULOTTO",
  "p28516": "TOTO FUZHOU",
  "p30102": "TAICHUNG",
  "p30100": "KOWLOON",
  "p30097": "CHONGQING",
  "p30095": "CHENGDU",
  "p30093": "FOSHAN",
  "p30092": "ECUADOR",
  "p30091": "CUBA",
  "p30090": "MONACO",
  "p28518": "TORONTO",
  "p28517": "BHUTAN",
  "p28514": "LAOS",
  "p28513": "HUNGARY",
  "p28512": "BULGARIA",
  "p18913": "CALIFORNIA",
  "p18909": "OREGON 12",
  "p18910": "OREGON 09",
  "p18912": "OREGON 06",
  "p18911": "OREGON 03",
  "p18902": "NEWYORK MID",
  "p18901": "NEWYORK EVE",
  "p18903": "FLORIDA MID",
  "p18904": "FLORIDA EVE",
  "p18906": "KENTUCKY MID",
  "p18905": "KENTUCKY EVE",
  "p18908": "CAROLINA DAY",
  "p18907": "CAROLINA EVE",
  "p13857": "MIAMI",
  "p13858": "PHILIPPINES",
  "p13853": "CYPRUS",
  "p13854": "GUANGDONG",
  "p13864": "TURIN",
  "p15472": "JAPAN",
  "p15473": "ICELAND",
  "p30531": "OSLO",
  "p30527": "ITALY",
  "p30528": "FRANCE",
  "p30529": "CHILE",
  "p30530": "MEXICO",
  "p30105": "DENVER",
  "p30104": "HAITI"
};

// 🔥 Daftar kode Toto Macau
const KODE_MACAU = ["m17", "m51"];

let cache = {};

// 🔄 SCRAPE FINAL dengan Logika Khusus Macau 1.5 Jam
async function scrape(kode) {
  try {
    const url = `https://kartuhappy.com/history/result/${kode}/kosong`;
    
    const { data } = await axios.get(url, { 
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(data);
    
    // 🔥 Waktu Sekarang (Server Time / UTC)
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0]; // Format YYYY-MM-DD
    
    // Hitung total menit sekarang untuk perbandingan
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    const currentTimeInMinutes = (currentHour * 60) + currentMinute;

    let found = null;

    $("table tbody tr").each((i, el) => {
      const cols = $(el).find("td");
      let tanggalText = "";
      let angka = "";

      if (!kode.startsWith("m")) {
        tanggalText = cols.eq(2).text().trim();
        angka = cols.eq(3).text().trim();
      } else {
        tanggalText = cols.eq(1).text().trim();
        angka = cols.eq(2).text().trim();
      }

      if (!tanggalText || !angka) return;

      // Split tanggal dan jam
      let [tanggal, jam] = tanggalText.split("|").map(x => x.trim());
      
      if (!tanggal || tanggal.length !== 10) return;

      // 🔥 CEK 1: Apakah tanggalnya HARI INI?
      if (tanggal === todayStr) {
        found = { tanggal, jam, angka };
        return false; // Break loop
      }
    });

    let status, pesan, newData;

    if (!found) {
      // Jika tidak ada data hari ini sama sekali
      status = "BELUM";
      pesan = `Data untuk tanggal ${todayStr} belum tersedia.`;
      
      newData = {
        kode,
        pasaran: PASARAN[kode],
        status,
        pesan,
        tanggalHariIni: todayStr,
        updated: new Date()
      };
      
    } else {
      // Ada data hari ini
      const { tanggal, jam, angka } = found;
      
      // Default status SUDAH
      status = "SUDAH";
      pesan = `Result tanggal ${tanggal} jam ${jam} tersedia.`;

      // 🔥 CEK KHUSUS MACAU: Jika lebih dari 1.5 Jam (90 Menit), anggap BELUM
      if (KODE_MACAU.includes(kode) && jam) {
        const [h, m] = jam.split(":").map(Number);
        const resultMinutes = (h * 60) + m;
        
        // Hitung selisih menit
        let diffMinutes = currentTimeInMinutes - resultMinutes;
        
        // Handle pergantian hari (jika result malam, cek pagi hari berikutnya)
        if (diffMinutes < 0) {
            diffMinutes += 1440; 
        }

        // Jika selisih > 90 menit, paksa jadi BELUM
        if (diffMinutes > 90) {
          status = "BELUM";
          pesan = `Data Macau terdeteksi lama (${diffMinutes} menit lalu). Dianggap belum naik untuk periode baru.`;
          console.log(`⚠️ ${kode}: Data lama (${diffMinutes} menit), status dipaksa BELUM`);
        } else {
           console.log(`✅ ${kode}: Data fresh (${diffMinutes} menit lalu), status SUDAH`);
        }
      } else {
         console.log(`✅ ${kode}: Data hari ini ditemukan, status SUDAH`);
      }

      newData = {
        kode,
        pasaran: PASARAN[kode],
        angka,
        tanggal,
        jam,
        status,
        pesan,
        updated: new Date()
      };
    }

    const old = cache[kode];
    cache[kode] = newData;

    // Emit update jika ada perubahan
    if (!old || old.status !== newData.status || old.angka !== newData.angka) {
      io.emit("update", newData);
    }

  } catch (err) {
    console.error(`❌ Error scraping ${kode}:`, err.message);
    cache[kode] = {
      kode,
      pasaran: PASARAN[kode],
      status: "ERROR",
      pesan: `Gagal mengambil data: ${err.message}`,
      updated: new Date()
    };
  }
}

// 🔁 LOOP REALTIME
setInterval(() => {
  Object.keys(PASARAN).forEach(scrape);
}, 10000); 

// ==================== ROUTES ====================

app.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "Backend realtime aktif",
    totalPasaran: Object.keys(PASARAN).length,
    cachedData: Object.keys(cache).length,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get("/api", (req, res) => {
  const { kode } = req.query;
  if (!kode) {
    return res.json({ message: "Gunakan parameter ?kode=m17" });
  }
  res.json(cache[kode] || { error: "Kode tidak ditemukan", status: "BELUM_DICEK" });
});

app.get("/api/pasaran", (req, res) => {
  res.json({ total: Object.keys(PASARAN).length, pasaran: PASARAN, macauCodes: KODE_MACAU });
});

app.get("/api/all", (req, res) => {
  res.json({ total: Object.keys(cache).length, data: cache });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", uptime: process.uptime() });
});

// SOCKET
io.on("connection", (socket) => {
  socket.emit("init", cache);
  socket.on("disconnect", () => {});
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Backend aktif di port", PORT);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
