const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const path = require("path");

const ANILIST = "https://graphql.anilist.co";
const MANGADEX = "https://api.mangadex.org";
const cacheDir = path.join(__dirname, "cache");
const MAX_PER_MSG = 10;

const ARABIC_SITES = [
  { name: "مانجا ليك",   base: "https://mangalek.com"   },
  { name: "3عشق",        base: "https://3asq.org"        },
  { name: "مانجا فريك", base: "https://mangafreeak.net" },
];

const ANILIST_QUERY = `
query ($search: String) {
  Page(perPage: 1) {
    media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
      id title { romaji english native }
      description(asHtml: false)
      status chapters volumes averageScore genres siteUrl
      countryOfOrigin startDate { year } coverImage { large }
    }
  }
}`;

/* ─── helpers ─── */
function countryLabel(c) {
  return ({ JP: "🇯🇵 مانغا", KR: "🇰🇷 مانهوا", CN: "🇨🇳 مانهوا صينية" })[c] || "مانغا";
}
function statusLabel(s) {
  return ({ FINISHED: "✅ مكتملة", RELEASING: "🟢 مستمرة", NOT_YET_RELEASED: "🔜 لم تصدر بعد", CANCELLED: "❌ ملغاة", HIATUS: "⏸️ متوقفة مؤقتاً" })[s] || s;
}
function cleanDesc(t, n = 500) {
  return (t || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function get(url, opts = {}) {
  return axios.get(url, { timeout: 8000, headers: { "User-Agent": UA }, ...opts });
}
function post(url, data, opts = {}) {
  return axios.post(url, data, { timeout: 8000, headers: { "User-Agent": UA }, ...opts });
}

function getGeminiKey() {
  try { return process.env.GEMINI_API_KEY || JSON.parse(fs.readFileSync(path.join(process.cwd(), "config.json"), "utf-8")).apiKeys?.gemini || null; }
  catch (_) { return process.env.GEMINI_API_KEY || null; }
}

async function translateAr(text) {
  const key = getGeminiKey();
  if (!key || !text) return text || "لا يوجد وصف.";
  try {
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      { contents: [{ role: "user", parts: [{ text: `ترجم هذا النص إلى العربية فقط بدون شرح:\n\n${text}` }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 600 } },
      { headers: { "Content-Type": "application/json" }, timeout: 15000 }
    );
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
  } catch (_) { return text; }
}

async function dlImage(url, fp) {
  try {
    fs.ensureDirSync(path.dirname(fp));
    const r = await axios.get(url.trim(), { responseType: "arraybuffer", timeout: 15000, headers: { "User-Agent": UA } });
    const ct = r.headers["content-type"] || "";
    if (!ct.includes("image") && !ct.includes("octet")) return null;
    fs.writeFileSync(fp, Buffer.from(r.data));
    return fp;
  } catch (_) { return null; }
}

/* إرسال رسالة بشكل موثوق */
async function reply(api, threadID, body, attachment) {
  const msg = attachment ? { body, attachment } : { body };
  return new Promise(resolve => {
    try {
      api.sendMessage(msg, threadID, (err, info) => resolve(info?.messageID || null));
    } catch (e) {
      console.error("[مانغا] reply error:", e.message);
      resolve(null);
    }
  });
}

/* ─── AniList ─── */
async function aniSearch(query) {
  try {
    const r = await axios.post(ANILIST, { query: ANILIST_QUERY, variables: { search: query } },
      { headers: { "Content-Type": "application/json" }, timeout: 12000 });
    return r.data?.data?.Page?.media?.[0] || null;
  } catch (e) {
    console.error("[مانغا] AniList error:", e.message);
    return null;
  }
}

/* ─── WordPress-manga scraper ─── */
async function wpSearch(base, query) {
  try {
    const r = await get(`${base}/?s=${encodeURIComponent(query)}&post_type=wp-manga`);
    const $ = cheerio.load(r.data);
    const results = [];
    $(".post-title a, h3.h4 a, .manga-title a, .item-thumb a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const title = $(el).text().trim();
      const match = href.match(/\/manga\/([^/?#]+)/);
      if (match && title) results.push({ slug: match[1], title, base });
    });
    return results;
  } catch (_) { return []; }
}

async function wpChapters(base, slug) {
  try {
    const r = await post(`${base}/manga/${slug}/ajax/chapters/`, null,
      { headers: { "Referer": `${base}/manga/${slug}/`, "X-Requested-With": "XMLHttpRequest" } });
    const $ = cheerio.load(r.data);
    const chapters = [];
    $("li.wp-manga-chapter a, li a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (!href.includes("/manga/")) return;
      const numMatch = text.match(/(\d+(?:\.\d+)?)/);
      const urlMatch = href.match(/\/manga\/[^/]+\/([^/?#]+)/);
      if (urlMatch) {
        const num = numMatch ? parseFloat(numMatch[1]) : parseFloat(urlMatch[1]);
        if (!isNaN(num)) chapters.push({ num, url: href });
      }
    });
    return chapters;
  } catch (_) { return []; }
}

async function wpPages(chapterUrl) {
  try {
    const r = await get(chapterUrl);
    const $ = cheerio.load(r.data);
    const pages = [];
    $(".reading-content img, .wp-manga-chapter-img, img[data-src]").each((_, el) => {
      const src = ($(el).attr("data-src") || $(el).attr("data-lazy-src") || $(el).attr("src") || "").trim();
      if (src && src.startsWith("http") && !src.includes("placeholder") && !src.includes("logo")) pages.push(src);
    });
    return [...new Set(pages)];
  } catch (_) { return []; }
}

async function findArabicChapter(searchNames, chapterNum) {
  for (const site of ARABIC_SITES) {
    for (const name of searchNames) {
      try {
        const results = await wpSearch(site.base, name);
        if (!results.length) continue;
        const { slug, title } = results[0];
        const chapters = await wpChapters(site.base, slug);
        const target = parseFloat(chapterNum);
        const found = chapters.find(c => Math.abs(c.num - target) < 0.01);
        if (!found) continue;
        const pages = await wpPages(found.url);
        if (pages.length) {
          console.log(`[مانغا] وجد فصل ${chapterNum} في ${site.name}: ${pages.length} صفحة`);
          return { pages, source: site.name, title };
        }
      } catch (e) {
        console.error(`[مانغا] ${site.name} error:`, e.message);
      }
    }
  }
  return null;
}

async function getArabicChapterList(searchNames) {
  for (const site of ARABIC_SITES) {
    for (const name of searchNames) {
      try {
        const results = await wpSearch(site.base, name);
        if (!results.length) continue;
        const { slug, title } = results[0];
        const chapters = await wpChapters(site.base, slug);
        if (!chapters.length) continue;
        const nums = [...new Set(chapters.map(c => c.num))].sort((a, b) => a - b);
        console.log(`[مانغا] وجد ${nums.length} فصل عربي في ${site.name}`);
        return { nums, source: site.name, title };
      } catch (_) {}
    }
  }
  return null;
}

/* ─── MangaDex ─── */
async function mdSearch(title) {
  try {
    const r = await axios.get(`${MANGADEX}/manga`, { params: { title, limit: 5 }, timeout: 10000 });
    const results = r.data?.data || [];
    const tLow = title.toLowerCase();
    return results.find(m => {
      const all = [
        ...Object.values(m.attributes.title || {}),
        ...(m.attributes.altTitles || []).flatMap(o => Object.values(o))
      ].map(s => s?.toLowerCase?.());
      return all.some(at => at && (at === tLow || at.includes(tLow) || tLow.includes(at)));
    }) || results[0] || null;
  } catch (_) { return null; }
}

async function mdChapter(mdId, chNum) {
  for (const lang of ["ar", "en"]) {
    try {
      const r = await axios.get(`${MANGADEX}/chapter`, {
        params: { manga: mdId, chapter: String(chNum), "translatedLanguage[]": lang, limit: 10 },
        timeout: 10000
      });
      const found = (r.data?.data || []).find(c =>
        Math.abs(parseFloat(c.attributes?.chapter) - parseFloat(chNum)) < 0.01
      );
      if (found) return { chapter: found, lang };
    } catch (_) {}
  }
  return null;
}

async function mdPages(chapterId) {
  try {
    const r = await axios.get(`${MANGADEX}/at-home/server/${chapterId}`, { timeout: 10000 });
    const base = r.data?.baseUrl, hash = r.data?.chapter?.hash;
    const files = r.data?.chapter?.dataSaver || r.data?.chapter?.data || [];
    if (!base || !hash || !files.length) return [];
    const folder = r.data?.chapter?.dataSaver ? "data-saver" : "data";
    return files.map(f => `${base}/${folder}/${hash}/${f}`);
  } catch (_) { return []; }
}

async function mdChapterList(mdId) {
  for (const lang of ["ar", "en"]) {
    try {
      const r = await axios.get(`${MANGADEX}/manga/${mdId}/aggregate`,
        { params: { "translatedLanguage[]": lang }, timeout: 10000 });
      const nums = [];
      for (const vol of Object.values(r.data?.volumes || {}))
        for (const ch of Object.values(vol.chapters || {}))
          if (ch.chapter && ch.chapter !== "none") nums.push(parseFloat(ch.chapter));
      if (nums.length) return { nums: nums.sort((a, b) => a - b), lang };
    } catch (_) {}
  }
  return null;
}

/* ─── module ─── */
module.exports = {
  config: {
    name: "مانغا",
    aliases: ["manga", "مانهوا", "مانجا", "manhua", "manhwa"],
    version: "7.1",
    author: "Saint",
    countDown: 5,
    role: 0,
    shortDescription: "ابحث عن مانغا أو اقرأ فصولها بالعربي",
    longDescription: "يجلب المعلومات من AniList والفصول العربية من مواقع متعددة",
    category: "anime",
    guide: "{pn} [اسم المانغا]\n{pn} [اسم المانغا] فصل [رقم]"
  },

  onStart: async function ({ api, event, args, message }) {
    const { threadID } = event;
    const input = args.join(" ").trim();

    if (!input) return api.sendMessage(
      "🔍 اكتب اسم المانغا بعد الأمر.\n" +
      "مثال: .مانغا one piece\n" +
      "لقراءة فصل: .مانغا one piece فصل 1",
      threadID
    );

    const chMatch =
      input.match(/^(.+?)\s+(?:ال)?فصل\s+(\d+(?:\.\d+)?)$/i) ||
      input.match(/^(.+?)\s+ch(?:apter)?\s*(\d+(?:\.\d+)?)$/i);

    const isChapter = !!chMatch;
    const query = chMatch ? chMatch[1].trim() : input;
    const chapterNum = chMatch ? chMatch[2] : null;

    console.log(`[مانغا] بحث: "${query}"${isChapter ? ` فصل ${chapterNum}` : ""}`);

    const waitID = await reply(api, threadID, "◈ ↞جاري البحث..〔 ! 〕\n◈ 𝗕⃪𝗹𝗮𝗰⃪𝗸 : 𝗠⃪𝗮⃪𝗵⃪𝗼𝗿𝗮⃪\n━━━━━━━━━━━━━");
    const unsend = () => {
      if (waitID) api.unsendMessage(waitID, () => {}).catch?.(() => {});
    };

    try {
      if (isChapter) {
        await handleChapter(api, threadID, query, chapterNum, unsend);
      } else {
        await handleInfo(api, threadID, query, unsend);
      }
    } catch (err) {
      console.error("[مانغا] خطأ عام:", err.message);
      unsend();
      await reply(api, threadID, "❌ حدث خطأ أثناء البحث، جرب مرة أخرى.");
    }
  }
};

/* ─── info ─── */
async function handleInfo(api, threadID, query, unsend) {
  const m = await aniSearch(query);

  if (!m) {
    unsend();
    return reply(api, threadID,
      `❌ لم أجد نتائج لـ "${query}"\n` +
      `• جرب كتابة الاسم بالإنجليزي\n` +
      `• مثال: .مانغا one piece`
    );
  }

  const title = m.title.english || m.title.romaji || query;
  const searchNames = [...new Set([title, m.title.romaji, m.title.english, query].filter(Boolean))];

  const [arResult, mdManga] = await Promise.all([
    getArabicChapterList(searchNames),
    mdSearch(title || query).catch(() => null)
  ]);

  let chaptersText = "";
  if (arResult) {
    const { nums, source } = arResult;
    chaptersText = `\n\n📚 فصول عربية — ${source} (${nums.length}):\n`;
    chaptersText += nums.slice(0, 40).join(" • ");
    if (nums.length > 40) chaptersText += ` ... حتى ${nums[nums.length - 1]}`;
    chaptersText += `\n\n💡 لقراءة فصل:\n.مانغا ${query} فصل [رقم]`;
  } else if (mdManga) {
    const mdList = await mdChapterList(mdManga.id).catch(() => null);
    if (mdList?.nums?.length) {
      const flag = mdList.lang === "ar" ? "🇸🇦 عربي" : "🇬🇧 إنجليزي";
      chaptersText = `\n\n📚 فصول ${flag} — MangaDex (${mdList.nums.length}):\n`;
      chaptersText += mdList.nums.slice(0, 40).join(" • ");
      if (mdList.nums.length > 40) chaptersText += ` ... حتى ${mdList.nums[mdList.nums.length - 1]}`;
      chaptersText += `\n\n💡 لقراءة فصل:\n.مانغا ${query} فصل [رقم]`;
    } else {
      chaptersText = "\n\n⚠️ لا توجد فصول متاحة حالياً.";
    }
  } else {
    chaptersText = "\n\n⚠️ لا توجد فصول متاحة حالياً.";
  }

  const rawDesc = cleanDesc(m.description);
  const [descAr, coverPath] = await Promise.all([
    translateAr(rawDesc),
    m.coverImage?.large ? dlImage(m.coverImage.large, path.join(cacheDir, `manga_${m.id}.jpg`)) : Promise.resolve(null)
  ]);

  const body =
    `╭━━━━━━━━━━━━━━━━━╮\n` +
    `   📖 ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝗠𝗮𝗻𝗴𝗮\n` +
    `╰━━━━━━━━━━━━━━━━━╯\n\n` +
    `${countryLabel(m.countryOfOrigin)}\n` +
    `📌 ${title}\n` +
    (m.title.native ? `🔣 ${m.title.native}\n` : "") +
    `📅 سنة الإصدار: ${m.startDate?.year || "غير معروف"}\n` +
    `📊 الحالة: ${statusLabel(m.status)}\n` +
    `📚 الفصول: ${m.chapters ? m.chapters + " فصل" : "مستمرة"}\n` +
    `📘 المجلدات: ${m.volumes ? m.volumes + " مجلد" : "-"}\n` +
    `⭐ التقييم: ${m.averageScore ? m.averageScore + "/100" : "لا يوجد"}\n` +
    `🎭 التصنيف: ${m.genres?.slice(0, 5).join(" • ") || "-"}\n` +
    `\n📝 القصة:\n${descAr}\n` +
    chaptersText +
    `\n\n✎﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏\n` +
    `↞ ⌯ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼`;

  unsend();
  await reply(api, threadID, body);

  if (coverPath) {
    api.sendMessage({ body: "", attachment: [fs.createReadStream(coverPath)] }, threadID,
      () => fs.remove(coverPath).catch(() => {}));
  }
}

/* ─── chapter ─── */
async function handleChapter(api, threadID, query, chapterNum, unsend) {
  const aniManga = await aniSearch(query);
  const searchNames = [...new Set([
    aniManga?.title?.english,
    aniManga?.title?.romaji,
    query
  ].filter(Boolean))];

  const mangaTitle = aniManga?.title?.english || aniManga?.title?.romaji || query;
  let pages = [], source = "", chTitle = "", langLabel = "🇸🇦 عربي";

  /* 1️⃣ مواقع عربية */
  const arResult = await findArabicChapter(searchNames, chapterNum);
  if (arResult) {
    pages = arResult.pages;
    source = arResult.source;
    chTitle = "";
  }

  /* 2️⃣ MangaDex */
  if (!pages.length) {
    let mdManga = null;
    for (const name of searchNames) {
      mdManga = await mdSearch(name).catch(() => null);
      if (mdManga) break;
    }
    if (mdManga) {
      const result = await mdChapter(mdManga.id, chapterNum);
      if (result) {
        pages = await mdPages(result.chapter.id);
        source = "MangaDex";
        chTitle = result.chapter.attributes?.title || "";
        const lm = { ar: "🇸🇦 عربي", en: "🇬🇧 إنجليزي", ja: "🇯🇵 ياباني", ko: "🇰🇷 كوري", zh: "🇨🇳 صيني" };
        langLabel = lm[result.lang] || result.lang;
      }
    }
  }

  if (!pages.length) {
    unsend();
    return reply(api, threadID,
      `❌ الفصل ${chapterNum} غير متاح لـ "${mangaTitle}".\n` +
      `🔍 تم البحث في: ${ARABIC_SITES.map(s => s.name).join(" + ")} + MangaDex\n\n` +
      `💡 اكتب: .مانغا ${query}\nلرؤية الفصول المتاحة.`
    );
  }

  unsend();
  await reply(api, threadID,
    `╭━━━━━━━━━━━━━━━━━╮\n` +
    `   📖 ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝗠𝗮𝗻𝗴𝗮\n` +
    `╰━━━━━━━━━━━━━━━━━╯\n\n` +
    `📌 ${mangaTitle}\n` +
    `📄 الفصل ${chapterNum}${chTitle ? " — " + chTitle : ""}\n` +
    `🌐 اللغة: ${langLabel}\n` +
    `🌍 المصدر: ${source}\n` +
    `📑 عدد الصفحات: ${pages.length}\n\n⏬ جاري إرسال الصفحات...`
  );

  const tmpDir = path.join(cacheDir, `ch_${Date.now()}`);
  fs.ensureDirSync(tmpDir);

  const downloaded = [];
  for (let i = 0; i < pages.length; i += 5) {
    const batch = pages.slice(i, i + 5);
    const results = await Promise.all(batch.map((url, j) => {
      const ext = url.toLowerCase().includes(".webp") ? "webp" : "jpg";
      return dlImage(url, path.join(tmpDir, `page_${String(i + j + 1).padStart(3, "0")}.${ext}`));
    }));
    downloaded.push(...results);
  }

  const valid = downloaded.filter(Boolean);
  if (!valid.length) {
    fs.remove(tmpDir).catch(() => {});
    return reply(api, threadID, "❌ فشل تحميل الصفحات، جرب مرة أخرى.");
  }

  for (let i = 0; i < valid.length; i += MAX_PER_MSG) {
    const chunk = valid.slice(i, i + MAX_PER_MSG);
    const range = `${i + 1}-${Math.min(i + MAX_PER_MSG, valid.length)}`;
    const isLast = i + MAX_PER_MSG >= valid.length;
    await new Promise(resolve => {
      api.sendMessage({
        body: isLast
          ? `📄 الصفحات ${range} من ${valid.length}\n✎﹏﹏﹏﹏﹏﹏﹏﹏\n↞ ⌯ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼`
          : `📄 الصفحات ${range} من ${valid.length}`,
        attachment: chunk.map(p => fs.createReadStream(p))
      }, threadID, () => resolve());
    });
    if (!isLast) await new Promise(r => setTimeout(r, 1500));
  }

  fs.remove(tmpDir).catch(() => {});
}
