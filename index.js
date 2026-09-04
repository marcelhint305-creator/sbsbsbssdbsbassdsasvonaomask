const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

// 🔥 LOGGING MIDDLEWARE (untuk debugging Railway)
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

// 🔄 SCRAPE FINAL dengan timeout dan pengecekan tanggal yang akurat
async function scrape(kode) {
  try {
    const url = `https://kartuhappy.com/history/result/${kode}/kosong`;
    
    // 🔥 Tambahkan timeout untuk mencegah hanging
    const { data } = await axios.get(url, { 
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(data);
    
    // 🔥 Dapatkan tanggal hari ini dalam format YYYY-MM-DD
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0]; // Format: 2026-09-05
    
    // 🔥 Waktu sekarang dalam WIB
    const nowWIB = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    const currentHour = nowWIB.getHours();
    const currentMinute = nowWIB.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    
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

      // 🔥 Split tanggal dan jam dari format "YYYY-MM-DD|HH:MM"
      let [tanggal, jam] = tanggalText.split("|").map(x => x.trim());
      if (!tanggal) return;

      // 🔥 Pengecekan yang lebih akurat: bandingkan tanggal saja (tanpa waktu)
      if (tanggal === todayStr) {
        found = { tanggal, jam, angka };
        return false; // Break loop setelah menemukan data hari ini
      }
    });

    // 🔥 Jika tidak ditemukan data untuk tanggal hari ini
    if (!found) {
      cache[kode] = {
        kode,
        pasaran: PASARAN[kode],
        status: "BELUM",
        pesan: "Data untuk tanggal hari ini belum tersedia",
        tanggalHariIni: todayStr,
        updated: new Date()
      };
      console.log(`⏳ ${kode} (${PASARAN[kode]}): BELUM ada data untuk ${todayStr}`);
      return;
    }

    // 🔥 Jika ditemukan data untuk tanggal hari ini
    const { tanggal, jam, angka } = found;
    
    let waktuLalu = "-";
    let diffMinutes = 0;
    let isMacauBelumNaik = false;

    if (jam) {
      const [h, m] = jam.split(":").map(Number);
      const resultMinutes = h * 60 + m;
      diffMinutes = currentTimeInMinutes - resultMinutes;
      if (diffMinutes < 0) diffMinutes += 1440;

      if (diffMinutes < 1) {
        waktuLalu = "baru saja";
      } else if (diffMinutes < 60) {
        waktuLalu = `${diffMinutes} menit lalu`;
      } else {
        const jamnya = Math.floor(diffMinutes / 60);
        const sisamenit = diffMinutes % 60;
        waktuLalu = sisamenit === 0
          ? `${jamnya} jam lalu`
          : `${jamnya} jam ${sisamenit} menit lalu`;
      }

      // 🔥 KHUSUS MACAU: Cek apakah sudah lebih dari 2 jam (120 menit)
      if (KODE_MACAU.includes(kode)) {
        if (diffMinutes > 120) {
          isMacauBelumNaik = true;
        }
      }
    }

    // 🔥 Tentukan status berdasarkan kondisi
    let status, pesan;
    
    if (isMacauBelumNaik) {
      // Khusus Macau: data ada tapi sudah lebih dari 2 jam
      status = "BELUM_NAIK";
      pesan = `Data ada sejak jam ${jam}, tapi sudah lebih dari 2 jam (${waktuLalu}). Menunggu angka baru.`;
    } else {
      // Normal: data sudah tersedia
      status = "SUDAH";
      pesan = `Data sudah tersedia sejak jam ${jam}`;
    }

    const newData = {
      kode,
      pasaran: PASARAN[kode],
      angka,
      tanggal,
      jam,
      status,
      pesan,
      selisihMenit: diffMinutes,
      waktuLalu,
      isMacauBelumNaik, // Flag khusus untuk Macau
      updated: new Date()
    };

    const old = cache[kode];
    cache[kode] = newData;

    // 🔥 Emit update jika ada perubahan angka atau status baru
    if (!old || old.angka !== newData.angka || old.status !== newData.status) {
      io.emit("update", newData);
      
      if (isMacauBelumNaik) {
        console.log(`⚠️ ${kode} (${PASARAN[kode]}): BELUM_NAIK - Angka: ${angka}, Jam: ${jam}, Selisih: ${diffMinutes} menit (${waktuLalu})`);
      } else {
        console.log(`✅ ${kode} (${PASARAN[kode]}): SUDAH - Angka: ${angka}, Jam: ${jam}, Waktu: ${waktuLalu}`);
      }
    }

  } catch (err) {
    console.error(`❌ Error scraping ${kode}:`, err.message);
    // 🔥 Tetap update cache dengan status error
    cache[kode] = {
      kode,
      pasaran: PASARAN[kode],
      status: "ERROR",
      pesan: `Gagal mengambil data: ${err.message}`,
      updated: new Date()
    };
  }
}

// 🔁 LOOP REALTIME - Interval lebih lama untuk Railway
setInterval(() => {
  console.log("🔄 Starting scrape cycle...");
  Object.keys(PASARAN).forEach(scrape);
}, 10000); // Ubah dari 2000 ke 10000 (10 detik) untuk mengurangi beban

// ==================== ROUTES ====================

// 🔥 ROOT ROUTE - WAJIB ADA untuk Railway
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

// 🔥 API ENDPOINTS
app.get("/api", (req, res) => {
  const { kode } = req.query;
  
  if (!kode) {
    return res.json({
      message: "Gunakan parameter ?kode=m17",
      availableCodes: Object.keys(PASARAN).slice(0, 10),
      totalCodes: Object.keys(PASARAN).length
    });
  }
  
  res.json(cache[kode] || { 
    error: "Kode tidak ditemukan", 
    kode,
    status: "BELUM_DICEK",
    pesan: "Data belum pernah dicek"
  });
});

// 🔥 Endpoint untuk list semua pasaran
app.get("/api/pasaran", (req, res) => {
  res.json({
    total: Object.keys(PASARAN).length,
    pasaran: PASARAN,
    macauCodes: KODE_MACAU
  });
});

// 🔥 Endpoint untuk semua data cache
app.get("/api/all", (req, res) => {
  res.json({
    total: Object.keys(cache).length,
    data: cache
  });
});

// 🔥 Health check endpoint (penting untuk Railway monitoring)
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cacheSize: Object.keys(cache).length,
    timestamp: new Date().toISOString()
  });
});

// SOCKET
io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);
  socket.emit("init", cache);
  
  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

// 🔥 ERROR HANDLER 404
app.use((req, res) => {
  res.status(404).json({ 
    error: "Route not found",
    message: `Cannot ${req.method} ${req.url}`,
    suggestion: "Try: GET /api?kode=m17"
  });
});

// 🔥 GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error("💥 Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

// START SERVER
server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Backend realtime aktif di port", PORT);
  console.log("📍 Test root: http://localhost:" + PORT + "/");
  console.log("📍 Test API: http://localhost:" + PORT + "/api?kode=m17");
  console.log("📍 Health check: http://localhost:" + PORT + "/health");
  console.log("📊 Total pasaran:", Object.keys(PASARAN).length);
  console.log("🎯 Kode Macau:", KODE_MACAU.join(", "));
});

// 🔥 Graceful shutdown untuk Railway
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
