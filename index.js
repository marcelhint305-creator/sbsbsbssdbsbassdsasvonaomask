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

let cache = {};

// 🔄 SCRAPE FINAL dengan timeout
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
    const todayStr = new Date().toISOString().split("T")[0];
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

      let [tanggal, jam] = tanggalText.split("|").map(x => x.trim());
      if (!tanggal) return;

      if (tanggal === todayStr) {
        found = { tanggal, jam, angka };
        return false;
      }
    });

    if (!found) {
      cache[kode] = {
        kode,
        pasaran: PASARAN[kode],
        angka: "",
        tanggal: null,
        jam: null,
        status: "MENUNGGU",
        waktuLalu: "-",
        updated: new Date()
      };
      return;
    }

    const { tanggal, jam, angka } = found;
    const now = new Date();
    const nowWIB = new Date(now.getTime() + (7 * 60 * 60 * 1000));

    let waktuLalu = "-";
    let diffMinutes = 0;

    if (jam) {
      const [h, m] = jam.split(":").map(Number);
      const resultMinutes = h * 60 + m;
      const nowMinutes = nowWIB.getHours() * 60 + nowWIB.getMinutes();
      diffMinutes = nowMinutes - resultMinutes;
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
    }

    const newData = {
      kode,
      pasaran: PASARAN[kode],
      angka,
      tanggal,
      jam,
      status: "SUDAH",
      selisihMenit: diffMinutes,
      waktuLalu,
      updated: new Date()
    };

    const old = cache[kode];
    cache[kode] = newData;

    if (!old || old.angka !== newData.angka) {
      io.emit("update", newData);
      console.log("🔥 UPDATE:", kode, angka);
    }

  } catch (err) {
    console.error(`❌ Error scraping ${kode}:`, err.message);
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
  
  res.json(cache[kode] || { error: "Kode tidak ditemukan", kode });
});

// 🔥 Endpoint untuk list semua pasaran
app.get("/api/pasaran", (req, res) => {
  res.json({
    total: Object.keys(PASARAN).length,
    pasaran: PASARAN
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
