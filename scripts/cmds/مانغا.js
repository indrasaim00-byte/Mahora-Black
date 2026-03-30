const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const ANILIST = "https://graphql.anilist.co";
const MANGADEX = "https://api.mangadex.org";
const cacheDir = path.join(__dirname, "cache");

const SEARCH_QUERY = `
query ($search: String) {
  Page(perPage: 1) {
    media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
      id
      title { romaji english native }
      description(asHtml: false)
      status
      chapters
      volumes
      averageScore
      genres
      siteUrl
      countryOfOrigin
      startDate { year }
      coverImage { large }
    }
  }
}`;

function getApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "config.json"), "utf-8"));
    return cfg.apiKeys?.gemini || cfg.apiKeys?.groq || null;
  } catch (_) { return null; }
}

function countryLabel(code) {
  const map = { JP: "🇯🇵 مانغا", KR: "🇰🇷 مانهوا", CN: "🇨🇳 مانهوا صينية" };
  return map[code] || "مانغا";
}

function statusLabel(s) {
  const map = {
    FINISHED: "✅ مكتملة",
    RELEASING: "🟢 مستمرة",
    NOT_YET_RELEASED: "🔜 لم تصدر بعد",
    CANCELLED: "❌ ملغاة",
    HIATUS: "⏸️ متوقفة مؤقتاً"
  };
  return map[s] || s;
}

function cleanDesc(text, limit = 500) {
  if (!text) return "";
  return text.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim().substring(0, limit);
}

async function translateToArabic(text) {
  const apiKey = getApiKey();
  if (!apiKey || !text) return text || "لا يوجد وصف.";
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        contents: [{ role: "user", parts: [{ text: `ترجم النص التالي إلى العربية بشكل طبيعي وسلس، بدون إضافة أي شرح أو تعليق، فقط الترجمة:\n\n${text}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 600 }
      },
      { headers: { "Content-Type": "application/json" }, timeout: 15000 }
    );
    const translated = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return translated?.trim() || text;
  } catch (_) { return text; }
}

async function downloadImage(url, filePath) {
  try {
    fs.ensureDirSync(cacheDir);
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 12000 });
    fs.writeFileSync(filePath, Buffer.from(res.data));
    return fs.createReadStream(filePath);
  } catch (_) { return null; }
}

async function getMangaDexLink(title) {
  try {
    const res = await axios.get(`${MANGADEX}/manga`, {
      params: { title, limit: 1, "includes[]": "cover_art" },
      timeout: 10000
    });
    const manga = res.data?.data?.[0];
    if (!manga) return null;
    const mdId = manga.id;
    const readUrl = `https://mangadex.org/title/${mdId}`;

    const chapRes = await axios.get(`${MANGADEX}/chapter`, {
      params: {
        manga: mdId,
        "order[chapter]": "desc",
        limit: 5
      },
      timeout: 10000
    });
    const chapters = chapRes.data?.data || [];
    return { readUrl, chapters, mdId };
  } catch (_) { return null; }
}

function sendMsg(message, body) {
  return new Promise(resolve => message.reply(body, (err, info) => resolve(info?.messageID || null)));
}

module.exports = {
  config: {
    name: "مانغا",
    aliases: ["manga", "مانهوا", "مانجا", "manhua", "manhwa"],
    version: "3.0",
    author: "Saint",
    countDown: 5,
    role: 0,
    shortDescription: "ابحث عن مانغا أو مانهوا",
    longDescription: "البحث عن مانغا أو مانهوا أو مانهوا صينية مع صورة الغلاف والنبذة والفصول",
    category: "anime",
    guide: "{pn} [اسم المانغا]"
  },

  onStart: async function ({ api, event, args, message }) {
    const query = args.join(" ").trim();
    if (!query) return message.reply("🔍 اكتب اسم المانغا أو المانهوا بعد الأمر.\nمثال: .مانغا one piece");

    const waitingID = await sendMsg(message, "◈ ↞جاري البحث..〔 ! 〕\n◈ 𝗕⃪𝗹𝗮𝗰⃪𝗸 : 𝗠⃪𝗮⃪𝗵⃪𝗼𝗿𝗮⃪\n━━━━━━━━━━━━━");

    function unsendWaiting() {
      if (waitingID) setTimeout(() => api.unsendMessage(waitingID).catch(() => {}), 3000);
    }

    try {
      const [aniRes, mdResult] = await Promise.all([
        axios.post(ANILIST, {
          query: SEARCH_QUERY,
          variables: { search: query }
        }, { headers: { "Content-Type": "application/json", "Accept": "application/json" }, timeout: 15000 }),
        getMangaDexLink(query)
      ]);

      const list = aniRes.data?.data?.Page?.media;
      if (!list?.length) {
        unsendWaiting();
        return message.reply(`❌ لم أجد نتائج لـ "${query}"\nجرب كتابة الاسم بالإنجليزي للحصول على نتائج أدق.`);
      }

      const m = list[0];
      const title = m.title.english || m.title.romaji;
      const titleAr = m.title.native || "";
      const type = countryLabel(m.countryOfOrigin);
      const status = statusLabel(m.status);
      const chapters = m.chapters ? `${m.chapters} فصل` : "مستمرة";
      const volumes = m.volumes ? `${m.volumes} مجلد` : "-";
      const score = m.averageScore ? `${m.averageScore}/100` : "لا يوجد";
      const year = m.startDate?.year || "غير معروف";
      const genres = m.genres?.slice(0, 5).join(" • ") || "-";

      const rawDesc = cleanDesc(m.description);

      const [descAr, imgStream] = await Promise.all([
        translateToArabic(rawDesc),
        m.coverImage?.large
          ? downloadImage(m.coverImage.large, path.join(cacheDir, `manga_${m.id}.jpg`))
          : Promise.resolve(null)
      ]);

      let chaptersText = "";
      if (mdResult?.chapters?.length) {
        chaptersText = "\n\n📚 آخر الفصول المتاحة:\n";
        for (const ch of mdResult.chapters) {
          const chNum = ch.attributes?.chapter || "?";
          const chTitle = ch.attributes?.title || "";
          const langMap = { ar: "🇸🇦", en: "🇬🇧", ja: "🇯🇵", ko: "🇰🇷", zh: "🇨🇳", es: "🇪🇸", "es-la": "🇪🇸", fr: "🇫🇷", de: "🇩🇪", pt: "🇧🇷", "pt-br": "🇧🇷", tr: "🇹🇷", id: "🇮🇩", it: "🇮🇹" };
        const lang = langMap[ch.attributes?.translatedLanguage] || "🌐";
          const chUrl = `https://mangadex.org/chapter/${ch.id}`;
          chaptersText += `${lang} الفصل ${chNum}${chTitle ? " — " + chTitle : ""}\n🔗 ${chUrl}\n`;
        }
      }

      let readLink = "";
      if (mdResult?.readUrl) {
        readLink = `\n📖 اقرأ جميع الفصول:\n🔗 ${mdResult.readUrl}\n`;
      }

      const body =
        `╭━━━━━━━━━━━━━━━━━╮\n` +
        `   📖 ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝗠𝗮𝗻𝗴𝗮\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n` +
        `${type}\n` +
        `📌 ${title}\n` +
        (titleAr ? `🔣 ${titleAr}\n` : "") +
        `📅 سنة الإصدار: ${year}\n` +
        `📊 الحالة: ${status}\n` +
        `📚 الفصول: ${chapters}\n` +
        `📘 المجلدات: ${volumes}\n` +
        `⭐ التقييم: ${score}\n` +
        `🎭 التصنيف: ${genres}\n` +
        `🔗 ${m.siteUrl}\n` +
        `\n📝 القصة:\n${descAr}\n` +
        chaptersText +
        readLink +
        `\n✎﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏\n` +
        `↞ ⌯ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼`;

      unsendWaiting();
      await sendMsg(message, body);

      if (imgStream) {
        const imgPath = path.join(cacheDir, `manga_${m.id}.jpg`);
        message.reply({ body: "", attachment: [imgStream] }, () => {
          fs.remove(imgPath).catch(() => {});
        });
      }

    } catch (err) {
      console.error("[مانغا]", err.message);
      unsendWaiting();
      message.reply("❌ حدث خطأ أثناء البحث، جرب مرة أخرى.");
    }
  }
};
