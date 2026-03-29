const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const CATEGORIES = {
  "انمي": "أنمي (Anime) من أي نوع",
  "مانغا": "مانغا (Manga)",
  "مانجا": "مانغا (Manga)",
  "مانهوا": "مانهوا كورية (Manhwa)",
  "انميات": "أنمي عشوائي",
  "لايت نوفل": "لايت نوفل (Light Novel)"
};

const DEFAULT_TYPES = [
  "أنمي أكشن", "أنمي رومانسي", "أنمي خيال", "أنمي رعب", "أنمي كوميدي",
  "أنمي نفسي", "أنمي مغامرات", "أنمي رياضي", "مانغا شونين", "مانغا سينين",
  "مانهوا كورية", "أنمي إيسيكاي", "أنمي شريحة حياة"
];

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
  const prompt = `أنت خبير أنمي ومانغا ومانهوا. ابحث عن "${name}" وأعطني معلومات عنه.
إذا لم تجد العمل بالضبط، ابحث عن أقرب نتيجة.
أعطني الرد بهذا الشكل بالضبط بدون أي إضافات:
TITLE_EN: (الاسم بالإنجليزية أو الرومانجي)
TITLE_AR: (الاسم بالعربية)
TITLE_JP: (الاسم بالياباني إذا موجود، أو بالكوري للمانهوا)
TYPE: (أنمي | مانغا | مانهوا | لايت نوفل)
YEAR: (سنة الإصدار)
GENRE: (الأنواع بالعربية)
RATING: (التقييم من 10)
EPISODES: (عدد الحلقات للأنمي أو عدد الفصول للمانغا/مانهوا)
STATUS: (مكتمل | مستمر | متوقف)
STUDIO: (الاستوديو المنتج إذا أنمي)
DESCRIPTION: (وصف مختصر بالعربية في 3-4 أسطر بدون حرق أحداث)`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 600,
        thinkingConfig: { thinkingBudget: 0 }
      }
    },
    { headers: { "Content-Type": "application/json" }, timeout: 20000 }
  );

  return response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
}

async function getRecommendation(apiKey, type) {
  const prompt = `أنت خبير أنمي ومانغا ومانهوا. اقترح ${type} واحد فقط عشوائي وممتاز.
أعطني الرد بهذا الشكل بالضبط بدون أي إضافات:
TITLE_EN: (الاسم بالإنجليزية أو الرومانجي)
TITLE_AR: (الاسم بالعربية)
TITLE_JP: (الاسم بالياباني إذا موجود، أو بالكوري للمانهوا)
TYPE: (أنمي | مانغا | مانهوا | لايت نوفل)
YEAR: (سنة الإصدار)
GENRE: (الأنواع بالعربية)
RATING: (التقييم من 10)
EPISODES: (عدد الحلقات للأنمي أو عدد الفصول للمانغا/مانهوا)
STATUS: (مكتمل | مستمر | متوقف)
STUDIO: (الاستوديو المنتج إذا أنمي)
DESCRIPTION: (وصف مختصر بالعربية في 3-4 أسطر بدون حرق أحداث)

مهم: لا تكرر نفس الاقتراحات. نوّع بين الأعمال المشهورة وغير المشهورة، القديمة والجديدة.`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 1.2,
        maxOutputTokens: 600,
        thinkingConfig: { thinkingBudget: 0 }
      }
    },
    { headers: { "Content-Type": "application/json" }, timeout: 20000 }
  );

  return response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
}

function parseResponse(text) {
  const get = (key) => {
    const match = text.match(new RegExp(`${key}:\\s*(.+?)(?:\\n|$)`, "i"));
    return match ? match[1].trim() : "";
  };
  return {
    titleEn: get("TITLE_EN"),
    titleAr: get("TITLE_AR"),
    titleJp: get("TITLE_JP"),
    type: get("TYPE"),
    year: get("YEAR"),
    genre: get("GENRE"),
    rating: get("RATING"),
    episodes: get("EPISODES"),
    status: get("STATUS"),
    studio: get("STUDIO"),
    description: get("DESCRIPTION")
  };
}

async function searchCover(titleEn, type) {
  const searchType = (type || "").includes("مانغا") ? "manga" : "anime";

  try {
    const res = await axios.get(`https://api.jikan.moe/v4/${searchType}?q=${encodeURIComponent(titleEn)}&limit=1`, { timeout: 8000 });
    if (res.data?.data?.[0]?.images?.jpg?.large_image_url) {
      return res.data.data[0].images.jpg.large_image_url;
    }
  } catch (_) {}

  if (searchType === "manga") {
    try {
      const res2 = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(titleEn)}&limit=1`, { timeout: 8000 });
      if (res2.data?.data?.[0]?.images?.jpg?.large_image_url) {
        return res2.data.data[0].images.jpg.large_image_url;
      }
    } catch (_) {}
  }

  try {
    const tmdbSearch = await axios.get(`https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(titleEn)}&language=ar&api_key=b1db4fa0ee292ffae9e042ef9d0469ca`, { timeout: 8000 });
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
    const filePath = path.join(cacheDir, `anime_cover_${Date.now()}.jpg`);
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    fs.writeFileSync(filePath, Buffer.from(res.data));
    return fs.createReadStream(filePath);
  } catch (_) {
    return null;
  }
}

function getTypeEmoji(type) {
  if ((type || "").includes("مانغا") || (type || "").includes("manga")) return "📖";
  if ((type || "").includes("مانهوا") || (type || "").includes("manhwa")) return "📚";
  if ((type || "").includes("لايت") || (type || "").includes("novel")) return "📕";
  return "🎌";
}

module.exports = {
  config: {
    name: "انميات",
    aliases: ["انمي", "مانغا", "مانجا", "مانهوا", "anime", "manga", "manhwa", "لايت-نوفل"],
    version: "1.0.0",
    author: "BlackBot",
    shortDescription: "اقتراح انميات ومانغا",
    longDescription: "يقترح عليك أنمي أو مانغا أو مانهوا مع الوصف وصورة الغلاف، أو ابحث عن عمل معين",
    category: "ترفيه",
    guide: "{pn} [انمي | مانغا | مانهوا]\n{pn} بحث [اسم الأنمي أو المانغا]",
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
      if (!query) return message.reply("⚠️ اكتب اسم الأنمي أو المانغا\nمثال: .انميات Attack on Titan");

      message.reply(`╭─────────────────╮\n     ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝕬𝗻⃪𝗶⃪𝗺⃪𝗲⃪\n╰─────────────────╯\n🔍 جاري البحث عن "${query}"...`);

      try {
        const rawText = await searchByName(apiKey, query);
        if (!rawText) return message.reply("❌ ما لقيت نتائج، تأكد من الاسم وجرب مرة أخرى");

        const rec = parseResponse(rawText);
        if (!rec.titleEn && !rec.titleAr) return message.reply("❌ ما لقيت نتائج، تأكد من الاسم وجرب مرة أخرى");

        const emoji = getTypeEmoji(rec.type);

        let body = `╭━━━━━━━━━━━━━━━━╮\n`;
        body += `   🔍 ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝕬𝗻⃪𝗶⃪𝗺⃪𝗲⃪\n`;
        body += `╰━━━━━━━━━━━━━━━━╯\n\n`;
        body += `${emoji} الاسم: ${rec.titleAr}\n`;
        body += `🔤 بالإنجليزية: ${rec.titleEn}\n`;
        if (rec.titleJp) body += `🔣 بالأصلي: ${rec.titleJp}\n`;
        body += `📂 النوع: ${rec.type}\n`;
        body += `📅 السنة: ${rec.year}\n`;
        body += `🎭 التصنيف: ${rec.genre}\n`;
        body += `⭐ التقييم: ${rec.rating}/10\n`;
        if (rec.episodes) body += `📺 الحلقات/الفصول: ${rec.episodes}\n`;
        if (rec.status) body += `📡 الحالة: ${rec.status}\n`;
        if (rec.studio) body += `🏢 الاستوديو: ${rec.studio}\n`;
        body += `\n📝 القصة:\n${rec.description}\n`;
        body += `\n✎﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏`;
        body += `\n↞ ⌯ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼`;

        const coverUrl = await searchCover(rec.titleEn, rec.type);
        let attachment = null;
        if (coverUrl) attachment = await downloadImage(coverUrl);

        if (attachment) {
          message.reply({ body, attachment: [attachment] });
        } else {
          message.reply(body);
        }
      } catch (err) {
        console.error("[انميات بحث] Error:", err.message);
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

    message.reply(`╭─────────────────╮\n     ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝕬𝗻⃪𝗶⃪𝗺⃪𝗲⃪\n╰─────────────────╯\n🎌 جاري البحث عن اقتراح...`);

    try {
      const rawText = await getRecommendation(apiKey, type);
      if (!rawText) return message.reply("❌ ما قدرت نلقى اقتراح، جرب مرة أخرى");

      const rec = parseResponse(rawText);
      if (!rec.titleEn && !rec.titleAr) return message.reply("❌ ما قدرت نلقى اقتراح، جرب مرة أخرى");

      const emoji = getTypeEmoji(rec.type);

      let body = `╭━━━━━━━━━━━━━━━━╮\n`;
      body += `   ${emoji} ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝕬𝗻⃪𝗶⃪𝗺⃪𝗲⃪\n`;
      body += `╰━━━━━━━━━━━━━━━━╯\n\n`;
      body += `${emoji} الاسم: ${rec.titleAr}\n`;
      body += `🔤 بالإنجليزية: ${rec.titleEn}\n`;
      if (rec.titleJp) body += `🔣 بالأصلي: ${rec.titleJp}\n`;
      body += `📂 النوع: ${rec.type}\n`;
      body += `📅 السنة: ${rec.year}\n`;
      body += `🎭 التصنيف: ${rec.genre}\n`;
      body += `⭐ التقييم: ${rec.rating}/10\n`;
      if (rec.episodes) body += `📺 الحلقات/الفصول: ${rec.episodes}\n`;
      if (rec.status) body += `📡 الحالة: ${rec.status}\n`;
      if (rec.studio) body += `🏢 الاستوديو: ${rec.studio}\n`;
      body += `\n📝 القصة:\n${rec.description}\n`;
      body += `\n✎﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏`;
      body += `\n↞ ⌯ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼`;
      body += `\n💡 أرسل .انميات للمزيد من الاقتراحات`;

      const coverUrl = await searchCover(rec.titleEn, rec.type);
      let attachment = null;
      if (coverUrl) attachment = await downloadImage(coverUrl);

      if (attachment) {
        message.reply({ body, attachment: [attachment] });
      } else {
        message.reply(body);
      }

    } catch (err) {
      console.error("[انميات] Error:", err.message);
      message.reply("❌ حدث خطأ أثناء البحث، جرب مرة أخرى");
    }
  }
};
