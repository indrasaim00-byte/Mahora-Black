const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const path = require("path");

const ANILIST = "https://graphql.anilist.co";
const MANGADEX = "https://api.mangadex.org";
const cacheDir = path.join(__dirname, "cache");

// تنظيف ملفات الغلاف القديمة عند التشغيل
try {
  fs.ensureDirSync(cacheDir);
  const oldCovers = fs.readdirSync(cacheDir).filter(f => /^(manga_|cover_)\d/.test(f) && f.endsWith(".jpg"));
  oldCovers.forEach(f => fs.removeSync(path.join(cacheDir, f)));
} catch (_) {}

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
  const cleanUrl = url.trim();
  fs.ensureDirSync(path.dirname(fp));

  const attempts = [
    referer ? referer : null,
    "https://3asq.org/",
    "https://despair-manga.net/",
    "https://google.com/"
  ].filter(Boolean);

  for (const ref of attempts) {
    try {
      const headers = {
        ...BASE_HEADERS,
        "Referer": ref,
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site"
      };
      const r = await axios.get(cleanUrl, { responseType: "arraybuffer", timeout: 25000, headers });
      const ct = r.headers["content-type"] || "";
      const size = r.data?.byteLength || 0;
      if ((!ct.includes("image") && !ct.includes("octet-stream")) || size < 1000) continue;
      fs.writeFileSync(fp, Buffer.from(r.data));
      return fp;
    } catch (_) {}
  }
  return null;
}

async function send(api, threadID, body, attachment) {
  return new Promise(resolve => {
    try { api.sendMessage(attachment ? { body, attachment } : { body }, threadID, (err, info) => resolve(info?.messageID || null)); }
    catch (e) { resolve(null); }
  });
}

/* ─── despair-manga.net ─── */
async function despairSearch(query) {
  try {
    const r = await axios.get(`https://despair-manga.net/?s=${encodeURIComponent(query)}&post_type=wp-manga`, { timeout: 9000, headers: BASE_HEADERS });
    const $ = cheerio.load(r.data);
    const results = [];
    $("a[href*='despair-manga.net/manga/']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const match = href.match(/despair-manga\.net\/manga\/([^/?#]+)/);
      if (match && !results.find(r => r.slug === match[1]))
        results.push({ slug: match[1], title: $(el).text().trim() || match[1] });
    });
    return results;
  } catch (_) { return []; }
}

async function despairChapters(slug) {
  try {
    const r = await axios.get(`https://despair-manga.net/manga/${slug}/`, { timeout: 9000, headers: BASE_HEADERS });
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
    const r = await axios.get(chapterUrl, { timeout: 12000, headers: { ...BASE_HEADERS, Referer: "https://despair-manga.net/" } });
    const match = r.data.match(/ts_reader\.run\((\{[\s\S]*?\})\)/);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    const source = data.sources?.[0];
    if (!source?.images?.length) return [];
    return source.images.map(img => img.startsWith("http") ? img : "https://despair-manga.net" + img);
  } catch (_) { return []; }
}

/* ─── 3asq.org ─── */
async function asqSearch(query) {
  try {
    const r = await axios.get(`https://3asq.org/?s=${encodeURIComponent(query)}&post_type=wp-manga`, { timeout: 9000, headers: BASE_HEADERS });
    const $ = cheerio.load(r.data);
    const results = [];
    $(".post-title a, h3.h4 a, .manga-title a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const title = $(el).text().trim();
      const match = href.match(/\/manga\/([^/?#]+)/);
      if (match && title) results.push({ slug: match[1], title });
    });
    return results;
  } catch (_) { return []; }
}

async function asqChapters(slug) {
  try {
    const r = await axios.post(`https://3asq.org/manga/${slug}/ajax/chapters/`, null,
      { timeout: 9000, headers: { ...BASE_HEADERS, Referer: `https://3asq.org/manga/${slug}/`, "X-Requested-With": "XMLHttpRequest" } });
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
    const r = await axios.get(chapterUrl, {
      timeout: 12000,
      headers: { ...BASE_HEADERS, Referer: "https://3asq.org/" }
    });

    // try ts_reader.run first (same as despair)
    const tsMatch = r.data.match(/ts_reader\.run\((\{[\s\S]*?\})\)/);
    if (tsMatch) {
      try {
        const data = JSON.parse(tsMatch[1]);
        const imgs = data.sources?.[0]?.images || [];
        if (imgs.length) return imgs.map(i => i.startsWith("http") ? i : "https://3asq.org" + i);
      } catch (_) {}
    }

    const $ = cheerio.load(r.data);
    const pages = [];

    $(".reading-content img, .wp-manga-chapter-img, .page-break img, .chapter-content img, img[data-src], img[data-lazy-src]").each((_, el) => {
      const src = (
        $(el).attr("data-src") ||
        $(el).attr("data-lazy-src") ||
        $(el).attr("data-original") ||
        $(el).attr("data-url") ||
        $(el).attr("src") || ""
      ).trim();
      if (src && src.startsWith("http") && !src.includes("placeholder") && !src.includes("logo") && !src.includes("data:")) {
        pages.push(src);
      }
    });

    return [...new Set(pages)];
  } catch (_) { return []; }
}

/* ─── AniList ─── */
async function aniSearch(query) {
  try {
    const r = await axios.post(ANILIST, { query: ANILIST_QUERY, variables: { search: query } },
      { headers: { "Content-Type": "application/json" }, timeout: 12000 });
    return r.data?.data?.Page?.media?.[0] || null;
  } catch (_) { return null; }
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

async function mdChapter(mdId, chNum, lang = "en") {
  try {
    const r = await axios.get(`${MANGADEX}/chapter`, {
      params: { manga: mdId, chapter: String(chNum), "translatedLanguage[]": lang, limit: 10 },
      timeout: 10000
    });
    const found = (r.data?.data || []).find(c => Math.abs(parseFloat(c.attributes?.chapter) - parseFloat(chNum)) < 0.01);
    if (found) return found;
  } catch (_) {}
  return null;
}

async function mdPages(chapterId) {
  try {
    const r = await axios.get(`${MANGADEX}/at-home/server/${chapterId}`, { timeout: 10000 });
    const base = r.data?.baseUrl, hash = r.data?.chapter?.hash;
    const files = r.data?.chapter?.data || r.data?.chapter?.dataSaver || [];
    if (!base || !hash || !files.length) return [];
    const folder = r.data?.chapter?.data?.length ? "data" : "data-saver";
    return files.map(f => `${base}/${folder}/${hash}/${f}`);
  } catch (_) { return []; }
}

async function mdChapterList(mdId, lang = "en") {
  try {
    const r = await axios.get(`${MANGADEX}/manga/${mdId}/aggregate`,
      { params: { "translatedLanguage[]": lang }, timeout: 10000 });
    const nums = [];
    for (const vol of Object.values(r.data?.volumes || {}))
      for (const ch of Object.values(vol.chapters || {}))
        if (ch.chapter && ch.chapter !== "none") nums.push(parseFloat(ch.chapter));
    return nums.sort((a, b) => a - b);
  } catch (_) { return []; }
}

/* ─── Arabic chapter fetcher ─── */
async function fetchArabicChapter(searchNames, chapterNum) {
  const target = parseFloat(chapterNum);

  for (const name of searchNames) {
    const results = await despairSearch(name);
    for (const res of results.slice(0, 3)) {
      try {
        const chapters = await despairChapters(res.slug);
        const found = chapters.find(c => Math.abs(c.num - target) < 0.01);
        if (!found) continue;
        const pages = await despairPages(found.url);
        if (pages.length) return { pages, source: "ديسبر مانجا", referer: found.url };
      } catch (_) {}
    }
  }

  for (const name of searchNames) {
    const results = await asqSearch(name);
    for (const res of results.slice(0, 4)) {
      try {
        const chapters = await asqChapters(res.slug);
        const found = chapters.find(c => Math.abs(c.num - target) < 0.01);
        if (!found) continue;
        const pages = await asqPages(found.url);
        if (pages.length) return { pages, source: "3عشق", referer: found.url };
      } catch (_) {}
    }
  }

  // MangaDex Arabic fallback
  for (const name of searchNames) {
    const mdManga = await mdSearch(name).catch(() => null);
    if (!mdManga) continue;
    const ch = await mdChapter(mdManga.id, chapterNum, "ar");
    if (ch) {
      const pages = await mdPages(ch.id);
      if (pages.length) return { pages, source: "MangaDex 🇸🇦", referer: "https://mangadex.org/" };
    }
  }

  return null;
}

/* ─── English chapter fetcher ─── */
async function fetchEnglishChapter(searchNames, chapterNum) {
  for (const name of searchNames) {
    const mdManga = await mdSearch(name).catch(() => null);
    if (!mdManga) continue;
    const ch = await mdChapter(mdManga.id, chapterNum, "en");
    if (ch) {
      const pages = await mdPages(ch.id);
      if (pages.length) return { pages, source: "MangaDex 🇬🇧", referer: "https://mangadex.org/", chTitle: ch.attributes?.title || "" };
    }
  }
  return null;
}

/* ─── getArabicInfo (for info view) ─── */
async function getArabicInfo(searchNames) {
  for (const name of searchNames) {
    const results = await despairSearch(name);
    for (const res of results.slice(0, 2)) {
      const chapters = await despairChapters(res.slug);
      if (chapters.length) return { nums: chapters.map(c => c.num), source: "ديسبر مانجا", title: res.title };
    }
  }
  for (const name of searchNames) {
    const results = await asqSearch(name);
    for (const res of results.slice(0, 3)) {
      const chapters = await asqChapters(res.slug);
      if (chapters.length) return { nums: chapters.map(c => c.num), source: "3عشق", title: res.title };
    }
  }
  return null;
}

/* ─── Send chapter pages ─── */
async function sendChapterPages(api, threadID, pages, imgReferer, mangaTitle, chapterNum, source, langLabel, chTitle = "") {
  const tmpDir = path.join(cacheDir, `ch_${Date.now()}`);
  fs.ensureDirSync(tmpDir);

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

  for (let i = 0; i < valid.length; i++) {
    const isLast = i === valid.length - 1;
    await new Promise(resolve => {
      api.sendMessage({
        body: isLast
          ? `📄 ${i + 1} / ${valid.length}\n✎﹏﹏﹏﹏﹏﹏﹏﹏\n↞ ⌯ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼`
          : `📄 ${i + 1} / ${valid.length}`,
        attachment: fs.createReadStream(valid[i])
      }, threadID, () => resolve());
    });
    await new Promise(r => setTimeout(r, 800));
  }

  fs.remove(tmpDir).catch(() => {});
}

/* ─── module ─── */
module.exports = {
  config: {
    name: "مانغا",
    aliases: ["manga", "مانهوا", "مانجا", "manhua", "manhwa"],
    version: "10.0",
    author: "Saint",
    countDown: 5,
    role: 0,
    shortDescription: "ابحث عن مانغا أو اقرأ فصولها",
    longDescription: "معلومات من AniList + فصول عربية وإنجليزية من مصادر متعددة",
    category: "anime",
    guide: "{pn} [اسم المانغا]\n{pn} [اسم المانغا] فصل [رقم]"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, senderID, messageID } = event;
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

    if (isChapter) {
      const waitID = await send(api, threadID, "◈ ↞جاري البحث..〔 ! 〕\n◈ 𝗕⃪𝗹𝗮𝗰⃪𝗸 : 𝗠⃪𝗮⃪𝗵⃪𝗼𝗿𝗮⃪\n━━━━━━━━━━━━━");

      const aniManga = await aniSearch(query).catch(() => null);
      const searchNames = [...new Set([
        aniManga?.title?.english, aniManga?.title?.romaji, query
      ].filter(Boolean))];
      const mangaTitle = aniManga?.title?.english || aniManga?.title?.romaji || query;

      if (waitID) api.unsendMessage(waitID, () => {});

      api.sendMessage(
        `╭━━━━━━━━━━━━━━━━━╮\n` +
        `   📖 ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝗠𝗮𝗻𝗚𝗮\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n` +
        `📌 ${mangaTitle}\n` +
        `📄 الفصل ${chapterNum}\n\n` +
        `🌐 هل تريدها بالعربية أم الإنجليزية؟\n\n` +
        `↩️ ردّ بـ: ar أو en`,
        threadID,
        (err, info) => {
          if (!info?.messageID) return;
          global.BlackBot.onReply.set(info.messageID, {
            commandName: this.config.name,
            author: senderID,
            query,
            chapterNum,
            searchNames,
            mangaTitle
          });
        }
      );
      return;
    }

    const waitID = await send(api, threadID, "◈ ↞جاري البحث..〔 ! 〕\n◈ 𝗕⃪𝗹𝗮𝗰⃪𝗸 : 𝗠⃪𝗮⃪𝗵⃪𝗼𝗿𝗮⃪\n━━━━━━━━━━━━━");
    try {
      await handleInfo(api, threadID, query, () => { if (waitID) api.unsendMessage(waitID, () => {}); });
    } catch (_) {
      if (waitID) api.unsendMessage(waitID, () => {});
      await send(api, threadID, "❌ حدث خطأ أثناء البحث، جرب مرة أخرى.");
    }
  },

  onReply: async function ({ api, event, Reply }) {
    if (event.senderID !== Reply.author) return;

    const choice = event.body.trim().toLowerCase().replace(/\s/g, "");
    const { threadID } = event;
    const { query, chapterNum, searchNames, mangaTitle } = Reply;

    if (!["ar", "en"].includes(choice)) {
      return api.sendMessage("❌ ردّ بـ ar للعربية أو en للإنجليزية.", threadID);
    }

    const loadID = await send(api, threadID,
      `⏳ جاري تحميل الفصل ${chapterNum} باللغة ${choice === "ar" ? "🇸🇦 العربية" : "🇬🇧 الإنجليزية"}...`
    );

    let result = null;

    if (choice === "ar") {
      result = await fetchArabicChapter(searchNames, chapterNum);
      if (loadID) api.unsendMessage(loadID, () => {});
      if (!result) {
        return send(api, threadID,
          `❌ الفصل ${chapterNum} غير متاح بالعربية لـ "${mangaTitle}".\n` +
          `💡 جرب: .مانغا ${query} فصل ${chapterNum}\nثم اختر en`
        );
      }
      await sendChapterPages(api, threadID, result.pages, result.referer, mangaTitle, chapterNum, result.source, "🇸🇦 عربي");

    } else {
      result = await fetchEnglishChapter(searchNames, chapterNum);
      if (loadID) api.unsendMessage(loadID, () => {});
      if (!result) {
        return send(api, threadID,
          `❌ الفصل ${chapterNum} غير متاح بالإنجليزية لـ "${mangaTitle}".\n` +
          `💡 جرب: .مانغا ${query} فصل ${chapterNum}\nثم اختر ar`
        );
      }
      await sendChapterPages(api, threadID, result.pages, result.referer, mangaTitle, chapterNum, result.source, "🇬🇧 إنجليزي", result.chTitle || "");
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
    chaptersText = `\n\n📚 فصول عربية — ${source} (${nums.length} فصل):\n`;
    chaptersText += `من فصل ${nums[0]} إلى فصل ${nums[nums.length - 1]}\n`;
    chaptersText += nums.slice(0, 40).join(" • ");
    if (nums.length > 40) chaptersText += ` ...`;
    chaptersText += `\n\n💡 لقراءة فصل:\n.مانغا ${query} فصل [رقم]`;
  } else if (mdManga) {
    const [arNums, enNums] = await Promise.all([
      mdChapterList(mdManga.id, "ar"),
      mdChapterList(mdManga.id, "en")
    ]);
    const bestNums = arNums.length ? arNums : enNums;
    const flag = arNums.length ? "🇸🇦 عربي" : "🇬🇧 إنجليزي";
    if (bestNums.length) {
      chaptersText = `\n\n📚 فصول ${flag} — MangaDex (${bestNums.length} فصل):\n`;
      chaptersText += `من فصل ${bestNums[0]} إلى فصل ${bestNums[bestNums.length - 1]}\n`;
      chaptersText += bestNums.slice(0, 40).join(" • ");
      if (bestNums.length > 40) chaptersText += ` ...`;
      chaptersText += `\n\n💡 لقراءة فصل:\n.مانغا ${query} فصل [رقم]`;
    } else {
      chaptersText = "\n\n⚠️ لا توجد فصول متاحة.";
    }
  } else {
    chaptersText = "\n\n⚠️ لا توجد فصول متاحة.";
  }

  const coverTmp = path.join(cacheDir, `cover_${m.id}_${Date.now()}.jpg`);
  const [descAr, coverPath] = await Promise.all([
    translateAr(cleanDesc(m.description)),
    m.coverImage?.large ? dlImage(m.coverImage.large, coverTmp) : null
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
