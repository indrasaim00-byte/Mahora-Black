const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const CATEGORIES = {
  "فلم": "فيلم سينمائي (أي نوع: أكشن، رعب، كوميديا، دراما، خيال علمي، إثارة...)",
  "مسلسل": "مسلسل تلفزيوني (أمريكي، بريطاني، تركي، عربي...)",
  "كيدراما": "مسلسل كوري (K-Drama)",
  "أفلام": "فيلم سينمائي عشوائي",
  "مسلسلات": "مسلسل تلفزيوني عشوائي"
};

const DEFAULT_TYPES = ["فيلم سينمائي", "مسلسل تلفزيوني", "مسلسل كوري K-Drama", "فيلم أنيميشن", "مسلسل تركي", "فيلم رعب", "مسلسل جريمة"];

async function callGeminiWithRetry(apiKey, contents, config, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        { contents, generationConfig: config },
        { headers: { "Content-Type": "application/json" }, timeout: 25000 }
      );
      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (err) {
      if (err.response?.status === 429 && i < retries) {
        const retryDelay = err.response?.data?.error?.details?.find(d => d.retryDelay)?.retryDelay;
        const waitSec = retryDelay ? parseInt(retryDelay) : 15;
        await new Promise(r => setTimeout(r, (waitSec + 2) * 1000));
        continue;
      }
      throw err;
    }
  }
}

function getApiKey() {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  try {
    const cfgPath = path.join(process.cwd(), "config.json");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    return cfg.apiKeys?.groq || cfg.apiKeys?.gemini || null;
  } catch (_) { return null; }
}

async function searchByName(apiKey, name) {
  const prompt = `أنت خبير أفلام ومسلسلات. ابحث عن "${name}" وأعطني معلومات عنه.
إذا لم تجد العمل بالضبط، ابحث عن أقرب نتيجة.
أعطني الرد بهذا الشكل بالضبط بدون أي إضافات:
TITLE_EN: (الاسم بالإنجليزية)
TITLE_AR: (الاسم بالعربية)
YEAR: (سنة الإصدار)
GENRE: (النوع بالعربية)
RATING: (التقييم من 10)
EPISODES: (عدد الحلقات إذا مسلسل، أو "فيلم" إذا فيلم)
DESCRIPTION: (وصف مختصر بالعربية في 3-4 أسطر بدون حرق أحداث)`;

  return callGeminiWithRetry(apiKey,
    [{ role: "user", parts: [{ text: prompt }] }],
    { temperature: 0.3, maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } }
  );
}

async function getRecommendation(apiKey, type) {
  const prompt = `أنت خبير أفلام ومسلسلات. اقترح ${type} واحد فقط عشوائي وممتاز (غير مشهور جداً أو مشهور).
أعطني الرد بهذا الشكل بالضبط بدون أي إضافات:
TITLE_EN: (الاسم بالإنجليزية)
TITLE_AR: (الاسم بالعربية)
YEAR: (سنة الإصدار)
GENRE: (النوع بالعربية)
RATING: (التقييم من 10)
EPISODES: (عدد الحلقات إذا مسلسل، أو "فيلم" إذا فيلم)
DESCRIPTION: (وصف مختصر بالعربية في 3 أسطر بدون حرق أحداث)

مهم: لا تكرر نفس الاقتراحات. اختر عمل مختلف في كل مرة. نوّع بين القديم والجديد.`;

  return callGeminiWithRetry(apiKey,
    [{ role: "user", parts: [{ text: prompt }] }],
    { temperature: 1.2, maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } }
  );
}

function parseResponse(text) {
  const get = (key) => {
    const match = text.match(new RegExp(`${key}:\\s*(.+?)(?:\\n|$)`, "i"));
    return match ? match[1].trim() : "";
  };
  return {
    titleEn: get("TITLE_EN"),
    titleAr: get("TITLE_AR"),
    year: get("YEAR"),
    genre: get("GENRE"),
    rating: get("RATING"),
    episodes: get("EPISODES"),
    description: get("DESCRIPTION")
  };
}

async function searchCover(title) {
  try {
    const res = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`, { timeout: 8000 });
    if (res.data?.data?.[0]?.images?.jpg?.large_image_url) {
      return res.data.data[0].images.jpg.large_image_url;
    }
  } catch (_) {}

  try {
    const omdbRes = await axios.get(`https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=4a3b711b`, { timeout: 8000 });
    if (omdbRes.data?.Poster && omdbRes.data.Poster !== "N/A") {
      return omdbRes.data.Poster;
    }
  } catch (_) {}

  try {
    const tmdbSearch = await axios.get(`https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(title)}&language=ar&api_key=b1db4fa0ee292ffae9e042ef9d0469ca`, { timeout: 8000 });
    const item = tmdbSearch.data?.results?.[0];
    if (item?.poster_path) {
      return `https://image.tmdb.org/t/p/w500${item.poster_path}`;
    }
  } catch (_) {}

  return null;
}

async function downloadImage(url) {
  try {
    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const filePath = path.join(cacheDir, `movie_cover_${Date.now()}.jpg`);
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    fs.writeFileSync(filePath, Buffer.from(res.data));
    return fs.createReadStream(filePath);
  } catch (_) {
    return null;
  }
}

module.exports = {
  config: {
    name: "افلام",
    aliases: ["فلم", "مسلسل", "مسلسلات", "كيدراما", "movies", "series", "kdrama"],
    version: "1.0.0",
    author: "BlackBot",
    shortDescription: "اقتراح أفلام ومسلسلات",
    longDescription: "يقترح عليك فيلم أو مسلسل أو كيدراما مع الوصف وصورة الغلاف، أو ابحث عن عمل معين",
    category: "ترفيه",
    guide: "{pn} [فلم | مسلسل | كيدراما]\n{pn} بحث [اسم الفيلم أو المسلسل]",
    role: 0,
    coolDown: 8
  },

  onStart: async function({ api, message, args, event }) {
    const apiKey = getApiKey();
    if (!apiKey) return message.reply("⚠️ مفتاح API غير متوفر");

    const arg = (args[0] || "").trim();
    const fullQuery = args.join(" ").trim();

    if (arg && !CATEGORIES[arg]) {
      const query = ["بحث", "search", "ابحث"].includes(arg) ? args.slice(1).join(" ").trim() : fullQuery;
      if (!query) return message.reply("⚠️ اكتب اسم الفيلم أو المسلسل\nمثال: .افلام Breaking Bad");

      message.reply(`◈ ↞جاري البحث..〔 ! 〕\n◈ 𝗕⃪𝗹𝗮𝗰⃪𝗸 : 𝗠⃪𝗮⃪𝗵⃪𝗼𝗿𝗮⃪\n━━━━━━━━━━━━━`);

      try {
        const rawText = await searchByName(apiKey, query);
        if (!rawText) return message.reply("❌ ما لقيت نتائج، تأكد من الاسم وجرب مرة أخرى");

        const rec = parseResponse(rawText);
        if (!rec.titleEn && !rec.titleAr) return message.reply("❌ ما لقيت نتائج، تأكد من الاسم وجرب مرة أخرى");

        let body = `╭━━━━━━━━━━━━━━━━╮\n`;
        body += `   🔍 ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝕮𝗶⃪𝗻⃪𝗲⃪𝗺⃪𝗮⃪\n`;
        body += `╰━━━━━━━━━━━━━━━━╯\n\n`;
        body += `🎞️ الاسم: ${rec.titleAr}\n`;
        body += `🔤 بالإنجليزية: ${rec.titleEn}\n`;
        body += `📅 السنة: ${rec.year}\n`;
        body += `🎭 النوع: ${rec.genre}\n`;
        body += `⭐ التقييم: ${rec.rating}/10\n`;
        if (rec.episodes && rec.episodes !== "فيلم") {
          body += `📺 الحلقات: ${rec.episodes}\n`;
        }
        body += `\n📝 القصة:\n${rec.description}\n`;
        body += `\n✎﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏`;
        body += `\n↞ ⌯ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼`;

        const coverUrl = await searchCover(rec.titleEn);
        let attachment = null;
        if (coverUrl) attachment = await downloadImage(coverUrl);

        if (attachment) {
          message.reply({ body, attachment: [attachment] });
        } else {
          message.reply(body);
        }
      } catch (err) {
        console.error("[افلام بحث] Error:", err.message);
        message.reply("❌ حدث خطأ أثناء البحث، جرب مرة أخرى");
      }
      return;
    }

    let type;
    if (CATEGORIES[arg]) {
      type = CATEGORIES[arg];
    } else {
      type = DEFAULT_TYPES[Math.floor(Math.random() * DEFAULT_TYPES.length)];
    }

    message.reply(`◈ ↞جاري البحث..〔 ! 〕\n◈ 𝗕⃪𝗹𝗮𝗰⃪𝗸 : 𝗠⃪𝗮⃪𝗵⃪𝗼𝗿𝗮⃪\n━━━━━━━━━━━━━`);

    try {
      const rawText = await getRecommendation(apiKey, type);
      if (!rawText) return message.reply("❌ ما قدرت نلقى اقتراح، جرب مرة أخرى");

      const rec = parseResponse(rawText);
      if (!rec.titleEn && !rec.titleAr) return message.reply("❌ ما قدرت نلقى اقتراح، جرب مرة أخرى");

      let body = `╭━━━━━━━━━━━━━━━━╮\n`;
      body += `   🎬 ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝕮𝗶⃪𝗻⃪𝗲⃪𝗺⃪𝗮⃪\n`;
      body += `╰━━━━━━━━━━━━━━━━╯\n\n`;
      body += `🎞️ الاسم: ${rec.titleAr}\n`;
      body += `🔤 بالإنجليزية: ${rec.titleEn}\n`;
      body += `📅 السنة: ${rec.year}\n`;
      body += `🎭 النوع: ${rec.genre}\n`;
      body += `⭐ التقييم: ${rec.rating}/10\n`;
      if (rec.episodes && rec.episodes !== "فيلم") {
        body += `📺 الحلقات: ${rec.episodes}\n`;
      }
      body += `\n📝 القصة:\n${rec.description}\n`;
      body += `\n✎﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏`;
      body += `\n↞ ⌯ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼`;
      body += `\n💡 أرسل .افلام للمزيد من الاقتراحات`;

      const coverUrl = await searchCover(rec.titleEn);
      let attachment = null;
      if (coverUrl) attachment = await downloadImage(coverUrl);

      if (attachment) {
        message.reply({ body, attachment: [attachment] });
      } else {
        message.reply(body);
      }

    } catch (err) {
      console.error("[افلام] Error:", err.message);
      message.reply("❌ حدث خطأ أثناء البحث، جرب مرة أخرى");
    }
  }
};
