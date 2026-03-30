const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const ANILIST = "https://graphql.anilist.co";
const MANGADEX = "https://api.mangadex.org";
const cacheDir = path.join(__dirname, "cache");
const MAX_PER_MSG = 10;

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
    return filePath;
  } catch (_) { return null; }
}

async function searchMangaDex(title) {
  try {
    const res = await axios.get(`${MANGADEX}/manga`, {
      params: { title, limit: 1 },
      timeout: 10000
    });
    return res.data?.data?.[0]?.id || null;
  } catch (_) { return null; }
}

async function searchMangaDexAccurate(titles) {
  for (const t of titles) {
    if (!t) continue;
    try {
      const res = await axios.get(`${MANGADEX}/manga`, {
        params: { title: t, limit: 5 },
        timeout: 10000
      });
      const results = res.data?.data || [];
      const tLow = t.toLowerCase();
      const exact = results.find(m => {
        const attrs = m.attributes;
        const allTitles = [
          ...(attrs.title ? Object.values(attrs.title) : []),
          ...(attrs.altTitles || []).flatMap(obj => Object.values(obj))
        ].map(s => s?.toLowerCase());
        return allTitles.some(at => at === tLow || at?.includes(tLow) || tLow.includes(at));
      });
      if (exact) return exact.id;
      if (results[0]) return results[0].id;
    } catch (_) {}
  }
  return null;
}

async function getAniListTitle(query) {
  try {
    const res = await axios.post(ANILIST, {
      query: SEARCH_QUERY,
      variables: { search: query }
    }, { headers: { "Content-Type": "application/json" }, timeout: 12000 });
    const m = res.data?.data?.Page?.media?.[0];
    if (!m) return null;
    return { english: m.title.english, romaji: m.title.romaji, native: m.title.native };
  } catch (_) { return null; }
}

async function getAvailableChapters(mdId, lang) {
  const all = [];
  let offset = 0;
  const limit = 100;
  try {
    while (true) {
      const params = { manga: mdId, "order[chapter]": "desc", limit, offset };
      if (lang) params["translatedLanguage[]"] = lang;
      const res = await axios.get(`${MANGADEX}/chapter`, { params, timeout: 12000 });
      const data = res.data?.data || [];
      all.push(...data);
      if (data.length < limit || all.length >= res.data?.total) break;
      offset += limit;
    }
  } catch (_) {}
  return all;
}

async function getAllChaptersMultiLang(mdId) {
  const arChapters = await getAvailableChapters(mdId, "ar");
  const arNums = new Set(arChapters.map(c => c.attributes?.chapter).filter(Boolean).map(n => String(parseFloat(n))));

  const enChapters = await getAvailableChapters(mdId, "en");
  const enOnly = enChapters.filter(c => {
    const ch = c.attributes?.chapter;
    return ch && !arNums.has(String(parseFloat(ch)));
  });

  return { arChapters, enOnly, arNums };
}

async function findChapter(mdId, chapterNum) {
  const langPriority = ["ar", "en"];
  for (const lang of langPriority) {
    try {
      const res = await axios.get(`${MANGADEX}/chapter`, {
        params: { manga: mdId, chapter: chapterNum, "translatedLanguage[]": lang, "order[chapter]": "asc", limit: 20 },
        timeout: 10000
      });
      const chapters = (res.data?.data || []).filter(c => {
        const ch = c.attributes?.chapter;
        return ch && String(parseFloat(ch)) === String(parseFloat(chapterNum));
      });
      if (chapters.length) return chapters[0];
    } catch (_) {}
  }
  try {
    const res = await axios.get(`${MANGADEX}/chapter`, {
      params: { manga: mdId, chapter: chapterNum, "order[chapter]": "asc", limit: 20 },
      timeout: 10000
    });
    const chapters = (res.data?.data || []).filter(c => {
      const ch = c.attributes?.chapter;
      return ch && String(parseFloat(ch)) === String(parseFloat(chapterNum));
    });
    if (chapters.length) return chapters[0];
  } catch (_) {}
  return null;
}

async function getChapterPages(chapterId) {
  try {
    const res = await axios.get(`${MANGADEX}/at-home/server/${chapterId}`, { timeout: 10000 });
    const base = res.data?.baseUrl;
    const hash = res.data?.chapter?.hash;
    const pages = res.data?.chapter?.dataSaver || res.data?.chapter?.data || [];
    if (!base || !hash || !pages.length) return [];
    return pages.map(f => `${base}/data-saver/${hash}/${f}`);
  } catch (_) { return []; }
}

function sendMsg(message, body) {
  return new Promise(resolve => message.reply(body, (err, info) => resolve(info?.messageID || null)));
}

function sendAttachment(message, body, attachments) {
  return new Promise(resolve => message.reply({ body, attachment: attachments }, (err, info) => resolve(info?.messageID || null)));
}

module.exports = {
  config: {
    name: "مانغا",
    aliases: ["manga", "مانهوا", "مانجا", "manhua", "manhwa"],
    version: "4.0",
    author: "Saint",
    countDown: 5,
    role: 0,
    shortDescription: "ابحث عن مانغا أو مانهوا + اقرأ الفصول",
    longDescription: "البحث عن مانغا أو مانهوا مع صورة الغلاف والنبذة، وقراءة الفصول كصور داخل الكروب",
    category: "anime",
    guide: "{pn} [اسم المانغا]\n{pn} [اسم المانغا] فصل [رقم]"
  },

  onStart: async function ({ api, event, args, message }) {
    const input = args.join(" ").trim();
    if (!input) return message.reply("🔍 اكتب اسم المانغا بعد الأمر.\nمثال: .مانغا one piece\nلقراءة فصل: .مانغا one piece فصل 1");

    const epMatch = input.match(/(.+?)\s+(?:ال)?فصل\s+(\d+)/i) || input.match(/(.+?)\s+ch(?:apter)?\s+(\d+)/i) || input.match(/(.+?)\s+(\d+)$/i);
    const isChapter = !!epMatch;
    const query = epMatch ? epMatch[1].trim() : input;
    const chapterNum = epMatch ? epMatch[2] : null;

    const waitingID = await sendMsg(message, "◈ ↞جاري البحث..〔 ! 〕\n◈ 𝗕⃪𝗹𝗮𝗰⃪𝗸 : 𝗠⃪𝗮⃪𝗵⃪𝗼𝗿𝗮⃪\n━━━━━━━━━━━━━");

    function unsendWaiting() {
      if (waitingID) setTimeout(() => api.unsendMessage(waitingID).catch(() => {}), 2000);
    }

    try {
      if (isChapter) {
        await handleChapterRequest(message, api, query, chapterNum, unsendWaiting);
      } else {
        await handleInfoRequest(message, api, query, unsendWaiting);
      }
    } catch (err) {
      console.error("[مانغا]", err.message);
      unsendWaiting();
      message.reply("❌ حدث خطأ أثناء البحث، جرب مرة أخرى.");
    }
  }
};

async function handleInfoRequest(message, api, query, unsendWaiting) {
  const [aniRes, mdId] = await Promise.all([
    axios.post(ANILIST, {
      query: SEARCH_QUERY,
      variables: { search: query }
    }, { headers: { "Content-Type": "application/json", "Accept": "application/json" }, timeout: 15000 }),
    searchMangaDex(query)
  ]);

  const list = aniRes.data?.data?.Page?.media;
  if (!list?.length) {
    unsendWaiting();
    return message.reply(`❌ لم أجد نتائج لـ "${query}"\nجرب كتابة الاسم بالإنجليزي.`);
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

  const chapterData = mdId ? await getAllChaptersMultiLang(mdId) : { arChapters: [], enOnly: [], arNums: new Set() };

  const [descAr, coverPath] = await Promise.all([
    translateToArabic(rawDesc),
    m.coverImage?.large
      ? downloadImage(m.coverImage.large, path.join(cacheDir, `manga_${m.id}.jpg`))
      : Promise.resolve(null)
  ]);

  let chaptersText = "";
  const arNums = [...new Set(chapterData.arChapters.map(c => c.attributes?.chapter).filter(Boolean).map(n => parseFloat(n)))].sort((a, b) => a - b);
  const enNums = [...new Set(chapterData.enOnly.map(c => c.attributes?.chapter).filter(Boolean).map(n => parseFloat(n)))].sort((a, b) => a - b);

  if (arNums.length || enNums.length) {
    chaptersText = "\n";
    if (arNums.length) {
      chaptersText += `\n📚 فصول بالعربي (${arNums.length}):\n`;
      chaptersText += arNums.map(n => `فصل ${n}`).join(" • ");
    }
    if (enNums.length) {
      chaptersText += `\n\n📗 فصول بالإنجليزي فقط (${enNums.length}):\n`;
      chaptersText += enNums.map(n => `فصل ${n}`).join(" • ");
    }
    chaptersText += `\n\n💡 لقراءة فصل اكتب:\n.مانغا ${query} فصل [رقم]`;
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
    `\n\n✎﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏\n` +
    `↞ ⌯ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼`;

  unsendWaiting();
  await sendMsg(message, body);

  if (coverPath) {
    message.reply({ body: "", attachment: [fs.createReadStream(coverPath)] }, () => {
      fs.remove(coverPath).catch(() => {});
    });
  }
}

async function handleChapterRequest(message, api, query, chapterNum, unsendWaiting) {
  const aniTitle = await getAniListTitle(query);
  const searchNames = aniTitle
    ? [aniTitle.english, aniTitle.romaji, aniTitle.native, query]
    : [query];
  const mdId = await searchMangaDexAccurate(searchNames);
  if (!mdId) {
    unsendWaiting();
    return message.reply(`❌ لم أجد "${query}" على MangaDex.\nجرب كتابة الاسم بالإنجليزي.`);
  }

  let mangaTitle = aniTitle?.english || aniTitle?.romaji || query;
  try {
    const mdInfo = await axios.get(`${MANGADEX}/manga/${mdId}`, { timeout: 10000 });
    const attrs = mdInfo.data?.data?.attributes;
    if (attrs) {
      mangaTitle = attrs.title?.en || attrs.title?.ja || attrs.title?.["ja-ro"]
        || Object.values(attrs.title || {})[0] || mangaTitle;
    }
  } catch (_) {}

  const chapter = await findChapter(mdId, chapterNum);
  if (!chapter) {
    unsendWaiting();
    return message.reply(`❌ الفصل ${chapterNum} غير متاح لـ "${mangaTitle}".\nجرب .مانغا ${query} لرؤية كل الفصول المتاحة.`);
  }

  const pages = await getChapterPages(chapter.id);
  if (!pages.length) {
    unsendWaiting();
    return message.reply(`❌ تعذر تحميل صفحات الفصل ${chapterNum}.`);
  }

  const langMap = { ar: "عربي", en: "إنجليزي", ja: "ياباني", ko: "كوري", zh: "صيني", "zh-hk": "صيني", es: "إسباني", "es-la": "إسباني", fr: "فرنسي", it: "إيطالي", pt: "برتغالي", "pt-br": "برتغالي", de: "ألماني", ru: "روسي", tr: "تركي", pl: "بولندي", th: "تايلندي", vi: "فيتنامي", id: "إندونيسي", ms: "ماليزي", hi: "هندي", uk: "أوكراني" };
  const langLabel = langMap[chapter.attributes?.translatedLanguage] || chapter.attributes?.translatedLanguage || "غير معروف";

  unsendWaiting();

  await sendMsg(message,
    `╭━━━━━━━━━━━━━━━━━╮\n` +
    `   📖 ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝗠𝗮𝗻𝗴𝗮\n` +
    `╰━━━━━━━━━━━━━━━━━╯\n\n` +
    `📌 ${mangaTitle}\n` +
    `📄 الفصل ${chapterNum}${chapter.attributes?.title ? " — " + chapter.attributes.title : ""}\n` +
    `🌐 اللغة: ${langLabel}\n` +
    `📑 عدد الصفحات: ${pages.length}\n` +
    `\n⏬ جاري إرسال الصفحات...`
  );

  const tmpPages = path.join(cacheDir, `ch_${Date.now()}`);
  fs.ensureDirSync(tmpPages);

  const downloadedPaths = [];
  const batchSize = 5;
  for (let i = 0; i < pages.length; i += batchSize) {
    const batch = pages.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((url, j) => {
        const idx = i + j;
        const filePath = path.join(tmpPages, `page_${String(idx + 1).padStart(3, "0")}.jpg`);
        return downloadImage(url, filePath);
      })
    );
    downloadedPaths.push(...results);
  }

  const validPaths = downloadedPaths.filter(Boolean);
  if (!validPaths.length) {
    fs.remove(tmpPages).catch(() => {});
    return message.reply("❌ فشل تحميل الصفحات، جرب مرة أخرى.");
  }

  for (let i = 0; i < validPaths.length; i += MAX_PER_MSG) {
    const chunk = validPaths.slice(i, i + MAX_PER_MSG);
    const streams = chunk.map(p => fs.createReadStream(p));
    const pageRange = `${i + 1}-${Math.min(i + MAX_PER_MSG, validPaths.length)}`;
    const isLast = i + MAX_PER_MSG >= validPaths.length;

    await new Promise(resolve => {
      message.reply({
        body: isLast
          ? `📄 الصفحات ${pageRange} من ${validPaths.length}\n✎﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏\n↞ ⌯ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼`
          : `📄 الصفحات ${pageRange} من ${validPaths.length}`,
        attachment: streams
      }, () => resolve());
    });

    if (!isLast) await new Promise(r => setTimeout(r, 1500));
  }

  fs.remove(tmpPages).catch(() => {});
}
