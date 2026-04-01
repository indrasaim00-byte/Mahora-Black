const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const path = require("path");

const ANILIST = "https://graphql.anilist.co";
const MANGADEX = "https://api.mangadex.org";
const cacheDir = path.join(__dirname, "cache");
const MAX_PER_MSG = 10;

// المواقع العربية التي تعمل فعلاً
const ARABIC_SITES = [
  { name: "3عشق", base: "https://3asq.org" },
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
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

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

async function dlImage(url, fp) {
  try {
    fs.ensureDirSync(path.dirname(fp));
    const r = await axios.get(url.trim(), { responseType: "arraybuffer", timeout: 15000, headers: { "User-Agent": UA } });
    if (!(r.headers["content-type"] || "").includes("image")) return null;
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

/* ─── AniList ─── */
async function aniSearch(query) {
  try {
    const r = await axios.post(ANILIST, { query: ANILIST_QUERY, variables: { search: query } },
      { headers: { "Content-Type": "application/json" }, timeout: 12000 });
    return r.data?.data?.Page?.media?.[0] || null;
  } catch (e) { console.error("[مانغا] AniList:", e.message); return null; }
}

/* ─── WordPress-manga scraper (3asq.org) ─── */
// يجلب كل النتائج من البحث وليس أول نتيجة فقط
async function wpSearch(base, query) {
  try {
    const r = await axios.get(`${base}/?s=${encodeURIComponent(query)}&post_type=wp-manga`,
      { timeout: 9000, headers: { "User-Agent": UA } });
    const $ = cheerio.load(r.data);
    const results = [];
    $(".post-title a, h3.h4 a, .manga-title a").each(function (_, el) {
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
    const r = await axios.post(`${base}/manga/${slug}/ajax/chapters/`, null, {
      timeout: 9000,
      headers: { "User-Agent": UA, "Referer": `${base}/manga/${slug}/`, "X-Requested-With": "XMLHttpRequest" }
    });
    const $ = cheerio.load(r.data);
    const chapters = [];
    $("li a").each(function (_, el) {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (!href.includes("/manga/")) return;
      const numMatch = text.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) chapters.push({ num: parseFloat(numMatch[1]), url: href });
    });
    return chapters.sort((a, b) => a.num - b.num);
  } catch (_) { return []; }
}

async function wpPages(chapterUrl) {
  try {
    const r = await axios.get(chapterUrl, { timeout: 10000, headers: { "User-Agent": UA } });
    const $ = cheerio.load(r.data);
    const pages = [];
    $(".reading-content img, .wp-manga-chapter-img, img[data-src]").each(function (_, el) {
      const src = ($(el).attr("data-src") || $(el).attr("data-lazy-src") || $(el).attr("src") || "").trim();
      if (src && src.startsWith("http") && !src.includes("placeholder") && !src.includes("logo")) pages.push(src);
    });
    return [...new Set(pages)];
  } catch (_) { return []; }
}

/* البحث عبر كل المواقع العربية — يجرب كل النتائج وليس أول واحدة */
async function findArabicChapter(searchNames, chapterNum) {
  const target = parseFloat(chapterNum);
  for (const site of ARABIC_SITES) {
    for (const name of searchNames) {
      const results = await wpSearch(site.base, name);
      if (!results.length) continue;
      // جرب كل النتائج وليس أول واحدة
      for (const res of results.slice(0, 4)) {
        try {
          const chapters = await wpChapters(site.base, res.slug);
          const found = chapters.find(c => Math.abs(c.num - target) < 0.01);
          if (!found) continue;
          const pages = await wpPages(found.url);
          if (pages.length) {
            console.log(`[مانغا] ✓ ${site.name}/${res.slug} فصل ${chapterNum}: ${pages.length} صفحة`);
            return { pages, source: site.name, title: res.title };
          }
        } catch (_) {}
      }
    }
  }
  return null;
}

/* جلب قائمة الفصول المتاحة عربياً */
async function getArabicInfo(searchNames) {
  for (const site of ARABIC_SITES) {
    for (const name of searchNames) {
      const results = await wpSearch(site.base, name);
      for (const res of results.slice(0, 3)) {
        const chapters = await wpChapters(site.base, res.slug);
        if (chapters.length) {
          const nums = chapters.map(c => c.num);
          return { nums, source: site.name, title: res.title };
        }
      }
    }
  }
  return null;
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

// جلب أي ترجمة متاحة للفصل (عربي → إنجليزي → أي لغة)
async function mdChapter(mdId, chNum) {
  const langPriority = ["ar", "en"];
  for (const lang of langPriority) {
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
  // آخر محاولة: أي لغة
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
    const files = r.data?.chapter?.dataSaver || r.data?.chapter?.data || [];
    if (!base || !hash || !files.length) return [];
    const folder = r.data?.chapter?.dataSaver ? "data-saver" : "data";
    return files.map(f => `${base}/${folder}/${hash}/${f}`);
  } catch (_) { return []; }
}

// جلب قائمة الفصول من MangaDex (عربي أولاً ثم إنجليزي)
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
    version: "8.0",
    author: "Saint",
    countDown: 5,
    role: 0,
    shortDescription: "ابحث عن مانغا أو اقرأ فصولها",
    longDescription: "معلومات من AniList + فصول عربية من 3asq.org + MangaDex احتياطياً",
    category: "anime",
    guide: "{pn} [اسم المانغا]\n{pn} [اسم المانغا] فصل [رقم]"
  },

  onStart: async function ({ api, event, args }) {
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
  let availableRange = "";

  /* 1️⃣ البحث في المواقع العربية أولاً */
  const arResult = await findArabicChapter(searchNames, chapterNum);
  if (arResult) {
    pages = arResult.pages;
    source = arResult.source;
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
        chTitle = result.chapter.attributes?.title || "";
        const lm = { ar: "🇸🇦 عربي", en: "🇬🇧 إنجليزي", ja: "🇯🇵 ياباني", ko: "🇰🇷 كوري", zh: "🇨🇳 صيني", fr: "🇫🇷 فرنسي" };
        langLabel = lm[result.lang] || result.lang;
      } else {
        // جلب النطاق المتاح لتوجيه المستخدم
        const mdList = await mdChapterList(mdManga.id).catch(() => null);
        if (mdList?.nums?.length) {
          const flag = mdList.lang === "ar" ? "عربي" : "إنجليزي";
          availableRange = `\n📊 المتاح على MangaDex (${flag}): فصل ${mdList.nums[0]} → فصل ${mdList.nums[mdList.nums.length - 1]}`;
        }
      }
    }
  }

  /* جلب النطاق العربي المتاح للرسالة */
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
    return send(api, threadID, "❌ فشل تحميل الصفحات، جرب مرة أخرى.");
  }

  for (let i = 0; i < valid.length; i += MAX_PER_MSG) {
    const chunk = valid.slice(i, i + MAX_PER_MSG);
    const range = `${i + 1}-${Math.min(i + MAX_PER_MSG, valid.length)}`;
    const isLast = i + MAX_PER_MSG >= valid.length;
    await new Promise(resolve => {
      api.sendMessage({
        body: isLast ? `📄 ${range} من ${valid.length}\n✎﹏﹏﹏﹏﹏﹏﹏﹏\n↞ ⌯ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼` : `📄 الصفحات ${range} من ${valid.length}`,
        attachment: chunk.map(p => fs.createReadStream(p))
      }, threadID, () => resolve());
    });
    if (!isLast) await new Promise(r => setTimeout(r, 1500));
  }

  fs.remove(tmpDir).catch(() => {});
}
