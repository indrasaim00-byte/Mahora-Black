const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const path = require("path");

const ANILIST = "https://graphql.anilist.co";
const MANGADEX = "https://api.mangadex.org";
const cacheDir = path.join(__dirname, "cache");
const MAX_PER_MSG = 10;

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
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BASE_HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "ar,en-US;q=0.7,en;q=0.3",
  "Referer": "https://google.com/"
};

function countryLabel(c) {
  return ({ JP: "🇯🇵 مانغا", KR: "🇰🇷 مانهوا", CN: "🇨🇳 مانهوا صينية" })[c] || "مانغا";
}
function statusLabel(s) {
  return ({ FINISHED: "✅ مكتملة", RELEASING: "🟢 مستمرة", NOT_YET_RELEASED: "🔜 لم تصدر بعد", CANCELLED: "❌ ملغاة", HIATUS: "⏸️ متوقفة مؤقتاً" })[s] || s;
}
function cleanDesc(t, n = 500) {
  return (t || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
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

async function dlImage(url, fp, referer) {
  try {
    fs.ensureDirSync(path.dirname(fp));
    const headers = referer
      ? { ...BASE_HEADERS, Referer: referer }
      : BASE_HEADERS;
    const r = await axios.get(url.trim(), { responseType: "arraybuffer", timeout: 20000, headers });
    const ct = r.headers["content-type"] || "";
    if (!ct.includes("image") && !ct.includes("octet-stream")) return null;
    fs.writeFileSync(fp, Buffer.from(r.data));
    return fp;
  } catch (_) { return null; }
}

async function send(api, threadID, body, attachment) {
  return new Promise(resolve => {
    try { api.sendMessage(attachment ? { body, attachment } : { body }, threadID, (err, info) => resolve(info?.messageID || null)); }
    catch (e) { console.error("[مانغا] send error:", e.message); resolve(null); }
  });
}

/* ═══════════════════════════════════════════════
   SITE 1: despair-manga.net (ديسبر مانجا)
   - Has 500+ Arabic-translated manga incl. Lookism ch1-587
   - Chapters embedded in HTML via .eplister ul li[data-num]
   - Images in ts_reader.run({...}) JavaScript object
   ═══════════════════════════════════════════════ */

async function despairSearch(query) {
  try {
    const r = await axios.get(
      `https://despair-manga.net/?s=${encodeURIComponent(query)}&post_type=wp-manga`,
      { timeout: 9000, headers: BASE_HEADERS }
    );
    const $ = cheerio.load(r.data);
    const results = [];
    $("a[href*='despair-manga.net/manga/']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const match = href.match(/despair-manga\.net\/manga\/([^/?#]+)/);
      if (match && !results.find(r => r.slug === match[1])) {
        results.push({ slug: match[1], title: $(el).text().trim() || match[1], base: "https://despair-manga.net" });
      }
    });
    return results;
  } catch (_) { return []; }
}

async function despairChapters(slug) {
  try {
    const r = await axios.get(
      `https://despair-manga.net/manga/${slug}/`,
      { timeout: 9000, headers: BASE_HEADERS }
    );
    const $ = cheerio.load(r.data);
    const chapters = [];
    $(".eplister ul li").each((_, el) => {
      const num = $(el).attr("data-num");
      const link = $(el).find("a").attr("href");
      if (num && link) chapters.push({ num: parseFloat(num), url: link });
    });
    return chapters.sort((a, b) => a.num - b.num);
  } catch (_) { return []; }
}

async function despairPages(chapterUrl) {
  try {
    const r = await axios.get(chapterUrl, {
      timeout: 12000,
      headers: { ...BASE_HEADERS, Referer: "https://despair-manga.net/" }
    });
    // Extract ts_reader.run({...}) data
    const match = r.data.match(/ts_reader\.run\((\{[\s\S]*?\})\)/);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    const base = "https://despair-manga.net";
    const source = data.sources?.[0];
    if (!source?.images?.length) return [];
    return source.images.map(img => img.startsWith("http") ? img : base + img);
  } catch (_) { return []; }
}

/* ═══════════════════════════════════════════════
   SITE 2: 3asq.org (ثلاثة عشق)
   - WordPress-manga structure
   - Has Arabic chapters (typically 131+ for Lookism)
   ═══════════════════════════════════════════════ */

async function asqSearch(query) {
  try {
    const r = await axios.get(
      `https://3asq.org/?s=${encodeURIComponent(query)}&post_type=wp-manga`,
      { timeout: 9000, headers: BASE_HEADERS }
    );
    const $ = cheerio.load(r.data);
    const results = [];
    $(".post-title a, h3.h4 a, .manga-title a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const title = $(el).text().trim();
      const match = href.match(/\/manga\/([^/?#]+)/);
      if (match && title) results.push({ slug: match[1], title, base: "https://3asq.org" });
    });
    return results;
  } catch (_) { return []; }
}

async function asqChapters(slug) {
  try {
    const r = await axios.post(
      `https://3asq.org/manga/${slug}/ajax/chapters/`,
      null,
      { timeout: 9000, headers: { ...BASE_HEADERS, Referer: `https://3asq.org/manga/${slug}/`, "X-Requested-With": "XMLHttpRequest" } }
    );
    const $ = cheerio.load(r.data);
    const chapters = [];
    $("li a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (!href.includes("/manga/")) return;
      const numMatch = text.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) chapters.push({ num: parseFloat(numMatch[1]), url: href });
    });
    return chapters.sort((a, b) => a.num - b.num);
  } catch (_) { return []; }
}

async function asqPages(chapterUrl) {
  try {
    const r = await axios.get(chapterUrl, { timeout: 10000, headers: BASE_HEADERS });
    const $ = cheerio.load(r.data);
    const pages = [];
    $(".reading-content img, .wp-manga-chapter-img, img[data-src]").each((_, el) => {
      const src = ($(el).attr("data-src") || $(el).attr("data-lazy-src") || $(el).attr("src") || "").trim();
      if (src && src.startsWith("http") && !src.includes("placeholder") && !src.includes("logo")) pages.push(src);
    });
    return [...new Set(pages)];
  } catch (_) { return []; }
}

/* ─── Universal search & chapter fetcher ─── */

// البحث عن فصل معين عبر كل المصادر
async function findArabicChapter(searchNames, chapterNum) {
  const target = parseFloat(chapterNum);

  // 1️⃣ despair-manga.net أولاً (يبدأ من فصل 1)
  for (const name of searchNames) {
    const results = await despairSearch(name);
    for (const res of results.slice(0, 3)) {
      try {
        const chapters = await despairChapters(res.slug);
        const found = chapters.find(c => Math.abs(c.num - target) < 0.01);
        if (!found) continue;
        const pages = await despairPages(found.url);
        if (pages.length) {
          console.log(`[مانغا] ✓ ديسبر/${res.slug} فصل ${chapterNum}: ${pages.length} صفحة`);
          return { pages, source: "ديسبر مانجا", title: res.title, referer: found.url };
        }
      } catch (_) {}
    }
  }

  // 2️⃣ 3asq.org احتياطياً
  for (const name of searchNames) {
    const results = await asqSearch(name);
    for (const res of results.slice(0, 4)) {
      try {
        const chapters = await asqChapters(res.slug);
        const found = chapters.find(c => Math.abs(c.num - target) < 0.01);
        if (!found) continue;
        const pages = await asqPages(found.url);
        if (pages.length) {
          console.log(`[مانغا] ✓ 3asq/${res.slug} فصل ${chapterNum}: ${pages.length} صفحة`);
          return { pages, source: "3عشق", title: res.title, referer: found.url };
        }
      } catch (_) {}
    }
  }

  return null;
}

// جلب قائمة الفصول المتاحة (للعرض في رسالة الخطأ)
async function getArabicInfo(searchNames) {
  // despair-manga.net
  for (const name of searchNames) {
    const results = await despairSearch(name);
    for (const res of results.slice(0, 2)) {
      const chapters = await despairChapters(res.slug);
      if (chapters.length) {
        const nums = chapters.map(c => c.num);
        return { nums, source: "ديسبر مانجا", title: res.title };
      }
    }
  }
  // 3asq.org
  for (const name of searchNames) {
    const results = await asqSearch(name);
    for (const res of results.slice(0, 3)) {
      const chapters = await asqChapters(res.slug);
      if (chapters.length) {
        const nums = chapters.map(c => c.num);
        return { nums, source: "3عشق", title: res.title };
      }
    }
  }
  return null;
}

/* ─── AniList ─── */
async function aniSearch(query) {
  try {
    const r = await axios.post(ANILIST, { query: ANILIST_QUERY, variables: { search: query } },
      { headers: { "Content-Type": "application/json" }, timeout: 12000 });
    return r.data?.data?.Page?.media?.[0] || null;
  } catch (e) { console.error("[مانغا] AniList:", e.message); return null; }
}

/* ─── MangaDex ─── */
async function mdSearch(title) {
  try {
    const r = await axios.get(`${MANGADEX}/manga`, { params: { title, limit: 10 }, timeout: 10000 });
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
  try {
    const r = await axios.get(`${MANGADEX}/chapter`, {
      params: { manga: mdId, chapter: String(chNum), limit: 10 },
      timeout: 10000
    });
    const found = (r.data?.data || []).find(c =>
      Math.abs(parseFloat(c.attributes?.chapter) - parseFloat(chNum)) < 0.01
    );
    if (found) return { chapter: found, lang: found.attributes?.translatedLanguage || "?" };
  } catch (_) {}
  return null;
}

async function mdPages(chapterId) {
  try {
    const r = await axios.get(`${MANGADEX}/at-home/server/${chapterId}`, { timeout: 10000 });
    const base = r.data?.baseUrl, hash = r.data?.chapter?.hash;
    // استخدم الجودة الكاملة (data) وليس المضغوطة (dataSaver)
    const files = r.data?.chapter?.data || r.data?.chapter?.dataSaver || [];
    if (!base || !hash || !files.length) return [];
    const folder = r.data?.chapter?.data?.length ? "data" : "data-saver";
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
    version: "9.0",
    author: "Saint",
    countDown: 5,
    role: 0,
    shortDescription: "ابحث عن مانغا أو اقرأ فصولها",
    longDescription: "معلومات من AniList + فصول عربية من ديسبر مانجا و 3asq + MangaDex احتياطياً",
    category: "anime",
    guide: "{pn} [اسم المانغا]\n{pn} [اسم المانغا] فصل [رقم]"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID } = event;
    const input = args.join(" ").trim();

    if (!input) return api.sendMessage(
      "🔍 اكتب اسم المانغا بعد الأمر.\n" +
      "مثال: .مانغا lookism\n" +
      "لقراءة فصل: .مانغا lookism فصل 1",
      threadID
    );

    const chMatch =
      input.match(/^(.+?)\s+(?:ال)?فصل\s+(\d+(?:\.\d+)?)$/i) ||
      input.match(/^(.+?)\s+ch(?:apter)?\s*(\d+(?:\.\d+)?)$/i);

    const isChapter = !!chMatch;
    const query = chMatch ? chMatch[1].trim() : input;
    const chapterNum = chMatch ? chMatch[2] : null;

    console.log(`[مانغا] "${query}"${isChapter ? ` فصل ${chapterNum}` : ""}`);

    const waitID = await send(api, threadID, "◈ ↞جاري البحث..〔 ! 〕\n◈ 𝗕⃪𝗹𝗮𝗰⃪𝗸 : 𝗠⃪𝗮⃪𝗵⃪𝗼𝗿𝗮⃪\n━━━━━━━━━━━━━");
    const unsend = () => { if (waitID) api.unsendMessage(waitID, () => {}); };

    try {
      if (isChapter) await handleChapter(api, threadID, query, chapterNum, unsend);
      else await handleInfo(api, threadID, query, unsend);
    } catch (err) {
      console.error("[مانغا] خطأ:", err.message);
      unsend();
      await send(api, threadID, "❌ حدث خطأ أثناء البحث، جرب مرة أخرى.");
    }
  }
};

/* ─── info ─── */
async function handleInfo(api, threadID, query, unsend) {
  const m = await aniSearch(query);
  if (!m) {
    unsend();
    return send(api, threadID, `❌ لم أجد نتائج لـ "${query}"\nجرب كتابة الاسم بالإنجليزي.`);
  }

  const title = m.title.english || m.title.romaji || query;
  const searchNames = [...new Set([title, m.title.romaji, m.title.english, query].filter(Boolean))];

  const [arInfo, mdManga] = await Promise.all([
    getArabicInfo(searchNames),
    mdSearch(title || query).catch(() => null)
  ]);

  let chaptersText = "";
  if (arInfo) {
    const { nums, source } = arInfo;
    const first = nums[0], last = nums[nums.length - 1];
    chaptersText = `\n\n📚 فصول عربية — ${source} (${nums.length} فصل):\n`;
    chaptersText += `من فصل ${first} إلى فصل ${last}\n`;
    chaptersText += nums.slice(0, 40).join(" • ");
    if (nums.length > 40) chaptersText += ` ...`;
    chaptersText += `\n\n💡 لقراءة فصل:\n.مانغا ${query} فصل [رقم]`;
  } else if (mdManga) {
    const mdList = await mdChapterList(mdManga.id).catch(() => null);
    if (mdList?.nums?.length) {
      const flag = mdList.lang === "ar" ? "🇸🇦 عربي" : "🇬🇧 إنجليزي";
      const first = mdList.nums[0], last = mdList.nums[mdList.nums.length - 1];
      chaptersText = `\n\n📚 فصول ${flag} — MangaDex (${mdList.nums.length} فصل):\n`;
      chaptersText += `من فصل ${first} إلى فصل ${last}\n`;
      chaptersText += mdList.nums.slice(0, 40).join(" • ");
      if (mdList.nums.length > 40) chaptersText += ` ...`;
      chaptersText += `\n\n💡 لقراءة فصل:\n.مانغا ${query} فصل [رقم]`;
    } else {
      chaptersText = "\n\n⚠️ لا توجد فصول متاحة.";
    }
  } else {
    chaptersText = "\n\n⚠️ لا توجد فصول متاحة.";
  }

  const [descAr, coverPath] = await Promise.all([
    translateAr(cleanDesc(m.description)),
    m.coverImage?.large ? dlImage(m.coverImage.large, path.join(cacheDir, `manga_${m.id}.jpg`)) : null
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
    `\n📝 القصة:\n${descAr}` +
    chaptersText +
    `\n\n✎﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏\n` +
    `↞ ⌯ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼`;

  unsend();
  await send(api, threadID, body);
  if (coverPath) api.sendMessage({ body: "", attachment: [fs.createReadStream(coverPath)] }, threadID, () => fs.remove(coverPath).catch(() => {}));
}

/* ─── chapter ─── */
async function handleChapter(api, threadID, query, chapterNum, unsend) {
  const aniManga = await aniSearch(query);
  const searchNames = [...new Set([
    aniManga?.title?.english, aniManga?.title?.romaji, query
  ].filter(Boolean))];
  const mangaTitle = aniManga?.title?.english || aniManga?.title?.romaji || query;

  let pages = [], source = "", chTitle = "", langLabel = "🇸🇦 عربي";
  let availableRange = "", imgReferer = null;

  /* 1️⃣ المصادر العربية (despair-manga أولاً ثم 3asq) */
  const arResult = await findArabicChapter(searchNames, chapterNum);
  if (arResult) {
    pages = arResult.pages;
    source = arResult.source;
    imgReferer = arResult.referer || null;
  }

  /* 2️⃣ MangaDex احتياطياً */
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
        imgReferer = "https://mangadex.org/";
        chTitle = result.chapter.attributes?.title || "";
        const lm = { ar: "🇸🇦 عربي", en: "🇬🇧 إنجليزي", ja: "🇯🇵 ياباني", ko: "🇰🇷 كوري", zh: "🇨🇳 صيني", fr: "🇫🇷 فرنسي" };
        langLabel = lm[result.lang] || result.lang;
      } else {
        const mdList = await mdChapterList(mdManga.id).catch(() => null);
        if (mdList?.nums?.length) {
          const flag = mdList.lang === "ar" ? "عربي" : "إنجليزي";
          availableRange = `\n📊 المتاح على MangaDex (${flag}): فصل ${mdList.nums[0]} → فصل ${mdList.nums[mdList.nums.length - 1]}`;
        }
      }
    }
  }

  /* جلب النطاق المتاح لرسالة الخطأ */
  if (!pages.length) {
    const arInfo = await getArabicInfo(searchNames);
    if (arInfo) {
      availableRange += `\n📊 المتاح عربياً (${arInfo.source}): فصل ${arInfo.nums[0]} → فصل ${arInfo.nums[arInfo.nums.length - 1]}`;
    }
  }

  if (!pages.length) {
    unsend();
    return send(api, threadID,
      `❌ الفصل ${chapterNum} غير متاح لـ "${mangaTitle}".\n` +
      (availableRange || "\n⚠️ لا توجد فصول متاحة في أي مصدر.") +
      `\n\n💡 اكتب: .مانغا ${query}\nلرؤية الفصول المتاحة.`
    );
  }

  unsend();
  await send(api, threadID,
    `╭━━━━━━━━━━━━━━━━━╮\n` +
    `   📖 ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝗠𝗮𝗻𝗚𝗮\n` +
    `╰━━━━━━━━━━━━━━━━━╯\n\n` +
    `📌 ${mangaTitle}\n` +
    `📄 الفصل ${chapterNum}${chTitle ? " — " + chTitle : ""}\n` +
    `🌐 اللغة: ${langLabel}\n` +
    `🌍 المصدر: ${source}\n` +
    `📑 عدد الصفحات: ${pages.length}\n\n⏬ جاري تحميل وإرسال الصفحات...`
  );

  const tmpDir = path.join(cacheDir, `ch_${Date.now()}`);
  fs.ensureDirSync(tmpDir);

  // تنزيل 8 صور بالتوازي لأقصى سرعة مع الحفاظ على الجودة
  const DOWNLOAD_BATCH = 8;
  const downloaded = [];
  for (let i = 0; i < pages.length; i += DOWNLOAD_BATCH) {
    const batch = pages.slice(i, i + DOWNLOAD_BATCH);
    const results = await Promise.all(batch.map((url, j) => {
      const u = url.toLowerCase();
      const ext = u.includes(".webp") ? "webp" : u.includes(".png") ? "png" : u.includes(".gif") ? "gif" : "jpg";
      return dlImage(url, path.join(tmpDir, `page_${String(i + j + 1).padStart(3, "0")}.${ext}`), imgReferer);
    }));
    downloaded.push(...results);
  }

  const valid = downloaded.filter(Boolean);
  if (!valid.length) {
    fs.remove(tmpDir).catch(() => {});
    return send(api, threadID, "❌ فشل تحميل الصفحات، جرب مرة أخرى.");
  }

  for (let i = 0; i < valid.length; i += MAX_PER_MSG) {
    const chunk = valid.slice(i, i + MAX_PER_MSG);
    const range = `${i + 1}-${Math.min(i + MAX_PER_MSG, valid.length)}`;
    const isLast = i + MAX_PER_MSG >= valid.length;
    await new Promise(resolve => {
      api.sendMessage({
        body: isLast
          ? `📄 ${range} من ${valid.length}\n✎﹏﹏﹏﹏﹏﹏﹏﹏\n↞ ⌯ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼`
          : `📄 الصفحات ${range} من ${valid.length}`,
        attachment: chunk.map(p => fs.createReadStream(p))
      }, threadID, () => resolve());
    });
    if (!isLast) await new Promise(r => setTimeout(r, 1500));
  }

  fs.remove(tmpDir).catch(() => {});
}
