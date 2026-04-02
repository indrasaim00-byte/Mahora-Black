const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const path = require("path");

const ANILIST = "https://graphql.anilist.co";
const MANGADEX = "https://api.mangadex.org";
const cacheDir = path.join(__dirname, "cache");

try {
  fs.ensureDirSync(cacheDir);
  const old = fs.readdirSync(cacheDir).filter(f => /^cover_/.test(f));
  old.forEach(f => { try { fs.removeSync(path.join(cacheDir, f)); } catch (_) {} });
} catch (_) {}

/* ─── AniList queries ─── */
const SEARCH_QUERY = `
query ($search: String) {
  Page(perPage: 6) {
    media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
      id
      title { romaji english native }
      status chapters averageScore countryOfOrigin startDate { year }
      coverImage { large }
      genres
    }
  }
}`;

const INFO_QUERY = `
query ($id: Int) {
  Media(id: $id, type: MANGA) {
    id title { romaji english native }
    description(asHtml: false)
    status chapters volumes averageScore genres siteUrl
    countryOfOrigin startDate { year } coverImage { large }
  }
}`;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const BASE_HEADERS = { "User-Agent": UA, "Accept-Language": "ar,en-US;q=0.7,en;q=0.3", "Referer": "https://google.com/" };

function countryLabel(c) {
  return ({ JP: "🇯🇵 مانغا", KR: "🇰🇷 مانهوا", CN: "🇨🇳 مانهوا صينية" })[c] || "📖 مانغا";
}
function statusLabel(s) {
  return ({ FINISHED: "✅ مكتملة", RELEASING: "🟢 مستمرة", NOT_YET_RELEASED: "🔜 لم تصدر", CANCELLED: "❌ ملغاة", HIATUS: "⏸️ متوقفة" })[s] || s;
}
function cleanDesc(t, n = 500) {
  return (t || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
}

function getGeminiKey() {
  try { return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || null; } catch (_) { return null; }
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
  const cleanUrl = url.trim();
  fs.ensureDirSync(path.dirname(fp));
  const referers = ["https://anilist.co/", "https://google.com/", "https://cdn.anilist.co/"];
  for (const ref of referers) {
    try {
      const r = await axios.get(cleanUrl, {
        responseType: "arraybuffer", timeout: 20000,
        headers: { ...BASE_HEADERS, Referer: ref, Accept: "image/*,*/*;q=0.8" }
      });
      const ct = r.headers["content-type"] || "";
      if ((!ct.includes("image") && !ct.includes("octet-stream")) || (r.data?.byteLength || 0) < 1000) continue;
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

/* ─── AniList search (returns up to 6 results) ─── */
async function aniSearchMulti(query) {
  try {
    const r = await axios.post(ANILIST, { query: SEARCH_QUERY, variables: { search: query } },
      { headers: { "Content-Type": "application/json" }, timeout: 12000 });
    return r.data?.data?.Page?.media || [];
  } catch (_) { return []; }
}

async function aniGetById(id) {
  try {
    const r = await axios.post(ANILIST, { query: INFO_QUERY, variables: { id } },
      { headers: { "Content-Type": "application/json" }, timeout: 12000 });
    return r.data?.data?.Media || null;
  } catch (_) { return null; }
}

/* ─── MangaDex search for pick list ─── */
async function mdSearchMulti(query) {
  try {
    const r = await axios.get(`${MANGADEX}/manga`, {
      params: { title: query, limit: 10, "includes[]": ["cover_art"], "order[relevance]": "desc" },
      timeout: 10000
    });
    return (r.data?.data || []).map(m => {
      const titles = m.attributes.title || {};
      const altTitles = (m.attributes.altTitles || []).flatMap(o => Object.values(o));
      const english = titles.en || altTitles.find(t => t) || Object.values(titles)[0] || "؟";
      const romaji = titles.ja_ro || titles["ja-ro"] || null;
      const native = titles.ja || titles.ko || titles.zh || null;
      const origin = m.attributes.originalLanguage || "jp";
      const countryMap = { jp: "JP", ko: "KR", zh: "CN", "zh-hk": "CN" };
      return {
        id: null,
        mdId: m.id,
        title: { english, romaji, native },
        status: (m.attributes.status || "").toUpperCase(),
        chapters: m.attributes.lastChapter || null,
        averageScore: null,
        countryOfOrigin: countryMap[origin] || "JP",
        startDate: { year: m.attributes.year || null },
        coverImage: { large: null },
        genres: (m.attributes.tags || []).map(t => t.attributes?.name?.en).filter(Boolean).slice(0, 4),
        source: "MangaDex"
      };
    });
  } catch (_) { return []; }
}

/* ─── Combined search: AniList + MangaDex, scored by relevance ─── */
async function combinedSearch(query) {
  const qLow = query.toLowerCase().trim();

  function scoreResult(m) {
    const titles = [m.title.english, m.title.romaji, m.title.native]
      .filter(Boolean).map(t => t.toLowerCase().trim());
    if (titles.some(t => t === qLow)) return 100;
    if (titles.some(t => t.startsWith(qLow) || qLow.startsWith(t))) return 80;
    if (titles.some(t => t.includes(qLow))) return 60;
    return 0;
  }

  const [aniResults, mdResults] = await Promise.all([
    aniSearchMulti(query),
    mdSearchMulti(query)
  ]);

  // score all results
  const scored = [
    ...aniResults.map(m => ({ ...m, _score: scoreResult(m), _src: "anilist" })),
    ...mdResults.map(m => ({ ...m, _score: scoreResult(m), _src: "mangadex" }))
  ];

  // deduplicate: if AniList and MangaDex both have same title, prefer AniList
  const seen = new Set();
  const deduped = [];
  for (const m of scored.sort((a, b) => b._score - a._score || (b.averageScore || 0) - (a.averageScore || 0))) {
    const key = (m.title.english || m.title.romaji || "").toLowerCase().trim();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    deduped.push(m);
    if (deduped.length >= 8) break;
  }

  return deduped;
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
    return (r.data?.data || []).find(c => Math.abs(parseFloat(c.attributes?.chapter) - parseFloat(chNum)) < 0.01) || null;
  } catch (_) { return null; }
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
    const r = await axios.get(`${MANGADEX}/manga/${mdId}/aggregate`, { params: { "translatedLanguage[]": lang }, timeout: 10000 });
    const nums = [];
    for (const vol of Object.values(r.data?.volumes || {}))
      for (const ch of Object.values(vol.chapters || {}))
        if (ch.chapter && ch.chapter !== "none") nums.push(parseFloat(ch.chapter));
    return nums.sort((a, b) => a - b);
  } catch (_) { return []; }
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
    const r = await axios.get(chapterUrl, { timeout: 12000, headers: { ...BASE_HEADERS, Referer: "https://3asq.org/" } });
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
      const src = ($(el).attr("data-src") || $(el).attr("data-lazy-src") || $(el).attr("data-original") || $(el).attr("src") || "").trim();
      if (src && src.startsWith("http") && !src.includes("placeholder") && !src.includes("logo") && !src.includes("data:")) pages.push(src);
    });
    return [...new Set(pages)];
  } catch (_) { return []; }
}

/* ─── Title similarity scorer ─── */
function titleSimilarity(q, t) {
  if (!q || !t) return 0;
  const a = q.toLowerCase().trim();
  const b = t.toLowerCase().trim();
  if (a === b) return 1.0;
  if (b.startsWith(a) || a.startsWith(b)) return 0.8;
  if (b.includes(a) || a.includes(b)) return 0.6;
  const aWords = a.split(/[\s\-_]+/).filter(w => w.length > 2);
  const bWords = b.split(/[\s\-_]+/).filter(w => w.length > 2);
  if (!aWords.length || !bWords.length) return 0;
  const overlap = aWords.filter(w => bWords.some(bw => bw.includes(w) || w.includes(bw))).length;
  if (overlap > 0) return 0.3 + Math.min(overlap / Math.max(aWords.length, bWords.length), 1) * 0.25;
  return 0;
}

function rankByTitle(searchNames, results) {
  return results
    .map(res => ({ ...res, _sim: Math.max(...searchNames.map(n => titleSimilarity(n, res.title))) }))
    .filter(r => r._sim >= 0.3)
    .sort((a, b) => b._sim - a._sim);
}

/* ─── Arabic chapter fetcher ─── */
async function fetchArabicChapter(searchNames, chapterNum, mdId) {
  const target = parseFloat(chapterNum);
  // despair-manga — ranked by title similarity
  for (const name of searchNames) {
    const raw = await despairSearch(name);
    const ranked = rankByTitle(searchNames, raw);
    for (const res of ranked.slice(0, 3)) {
      try {
        const chapters = await despairChapters(res.slug);
        const found = chapters.find(c => Math.abs(c.num - target) < 0.01);
        if (!found) continue;
        const pages = await despairPages(found.url);
        if (pages.length) return { pages, source: "ديسبر مانجا", referer: found.url };
      } catch (_) {}
    }
  }
  // 3asq — ranked by title similarity
  for (const name of searchNames) {
    const raw = await asqSearch(name);
    const ranked = rankByTitle(searchNames, raw);
    for (const res of ranked.slice(0, 4)) {
      try {
        const chapters = await asqChapters(res.slug);
        const found = chapters.find(c => Math.abs(c.num - target) < 0.01);
        if (!found) continue;
        const pages = await asqPages(found.url);
        if (pages.length) return { pages, source: "3عشق", referer: found.url };
      } catch (_) {}
    }
  }
  // MangaDex Arabic — use mdId directly if available, else search
  const mdMangaId = mdId || await mdSearch(searchNames[0]).then(m => m?.id).catch(() => null);
  if (mdMangaId) {
    const ch = await mdChapter(mdMangaId, chapterNum, "ar");
    if (ch) {
      const pages = await mdPages(ch.id);
      if (pages.length) return { pages, source: "MangaDex 🇸🇦", referer: "https://mangadex.org/" };
    }
  }
  return null;
}

async function fetchEnglishChapter(searchNames, chapterNum, mdId) {
  if (mdId) {
    // mdId known — use it exclusively, no name-based fallback
    const ch = await mdChapter(mdId, chapterNum, "en");
    if (ch) {
      const pages = await mdPages(ch.id);
      if (pages.length) return { pages, source: "MangaDex 🇬🇧", referer: "https://mangadex.org/", chTitle: ch.attributes?.title || "" };
    }
    return null;
  }
  // No mdId — search by name
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

async function getArabicInfo(searchNames) {
  for (const name of searchNames) {
    const raw = await despairSearch(name);
    const ranked = rankByTitle(searchNames, raw);
    for (const res of ranked.slice(0, 2)) {
      const chapters = await despairChapters(res.slug);
      if (chapters.length) return { nums: chapters.map(c => c.num), source: "ديسبر مانجا", title: res.title };
    }
  }
  for (const name of searchNames) {
    const raw = await asqSearch(name);
    const ranked = rankByTitle(searchNames, raw);
    for (const res of ranked.slice(0, 3)) {
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

  const BATCH = 8;
  const downloaded = [];
  for (let i = 0; i < pages.length; i += BATCH) {
    const batch = pages.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((url, j) => {
      const u = url.toLowerCase();
      const ext = u.includes(".webp") ? "webp" : u.includes(".png") ? "png" : u.includes(".gif") ? "gif" : "jpg";
      return dlImage(url, path.join(tmpDir, `page_${String(i + j + 1).padStart(3, "0")}.${ext}`));
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
        body: isLast ? `📄 ${i + 1} / ${valid.length}\n✎﹏﹏﹏﹏﹏﹏﹏﹏\n↞ ⌯ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼` : `📄 ${i + 1} / ${valid.length}`,
        attachment: fs.createReadStream(valid[i])
      }, threadID, () => resolve());
    });
    await new Promise(r => setTimeout(r, 800));
  }
  fs.remove(tmpDir).catch(() => {});
}

/* ─── Show full manga info ─── */
async function showMangaInfo(api, threadID, m, query) {
  const title = m.title.english || m.title.romaji || query;
  const searchNames = [...new Set([title, m.title.romaji, m.title.english, query].filter(Boolean))];

  const mdSearchPromise = m.mdId
    ? Promise.resolve({ id: m.mdId })
    : mdSearch(title || query).catch(() => null);

  const [arInfo, mdManga] = await Promise.all([
    getArabicInfo(searchNames),
    mdSearchPromise
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
    const [arNums, enNums] = await Promise.all([mdChapterList(mdManga.id, "ar"), mdChapterList(mdManga.id, "en")]);
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

  const descAr = await translateAr(cleanDesc(m.description));
  const coverTmp = path.join(cacheDir, `cover_${m.id}_${Date.now()}.jpg`);
  const coverPath = m.coverImage?.large ? await dlImage(m.coverImage.large, coverTmp) : null;

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

  await send(api, threadID, body);
  if (coverPath) api.sendMessage({ body: "", attachment: [fs.createReadStream(coverPath)] }, threadID, () => fs.remove(coverPath).catch(() => {}));
}

/* ─── Module ─── */
module.exports = {
  config: {
    name: "مانغا",
    aliases: ["manga", "مانهوا", "مانجا", "manhua", "manhwa"],
    version: "11.0",
    author: "سايم",
    countDown: 5,
    role: 0,
    shortDescription: "ابحث عن مانغا أو اقرأ فصولها",
    category: "anime",
    guide: "{pn} [اسم المانغا]\n{pn} [اسم المانغا] فصل [رقم]"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, senderID, messageID } = event;
    const input = args.join(" ").trim();

    if (!input) return api.sendMessage(
      "🔍 اكتب اسم المانغا بعد الأمر.\nمثال: .مانغا lookism\nلقراءة فصل: .مانغا lookism فصل 1",
      threadID
    );

    const chMatch =
      input.match(/^(.+?)\s+(?:ال)?فصل\s+(\d+(?:\.\d+)?)$/i) ||
      input.match(/^(.+?)\s+ch(?:apter)?\s*(\d+(?:\.\d+)?)$/i);

    const isChapter = !!chMatch;
    const query = chMatch ? chMatch[1].trim() : input;
    const chapterNum = chMatch ? chMatch[2] : null;

    const waitID = await send(api, threadID,
      `◈ ↞جاري البحث..〔 ! 〕\n◈ 𝗕⃪𝗹𝗮𝗰⃪𝗸 : 𝗠⃪𝗮⃪𝗵⃪𝗼𝗿𝗮⃪\n━━━━━━━━━━━━━`
    );

    const results = await combinedSearch(query);
    if (waitID) api.unsendMessage(waitID, () => {});

    if (!results.length) {
      return send(api, threadID, `❌ لم أجد نتائج لـ "${query}"\nجرب كتابة الاسم بالإنجليزي.`);
    }

    /* إذا كانت النتيجة الأولى تطابق تاماً → اعرضها مباشرة */
    const qLow = query.toLowerCase().trim();
    const exactMatch = results.find(m => {
      const titles = [m.title.english, m.title.romaji, m.title.native].filter(Boolean).map(t => t.toLowerCase().trim());
      return titles.some(t => t === qLow);
    });

    if (exactMatch) {
      if (isChapter) {
        const mangaTitle = exactMatch.title.english || exactMatch.title.romaji || query;
        const searchNames = [...new Set([exactMatch.title.english, exactMatch.title.romaji, query].filter(Boolean))];
        const mdId = exactMatch.mdId || null;
        return api.sendMessage(
          `╭━━━━━━━━━━━━━━━━━╮\n` +
          `   📖 ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝗠𝗮𝗻𝗚𝗮\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n` +
          `📌 ${mangaTitle}\n📄 الفصل ${chapterNum}\n\n` +
          `🌐 هل تريدها بالعربية أم الإنجليزية؟\n↩️ ردّ بـ: ar أو en`,
          threadID,
          (err, info) => {
            if (!info?.messageID) return;
            global.BlackBot.onReply.set(info.messageID, {
              commandName: this.config.name,
              type: "lang",
              author: senderID,
              query, chapterNum, searchNames, mangaTitle, mdId
            });
          }
        );
      }
      const fullM = exactMatch.id ? await aniGetById(exactMatch.id) : null;
      return showMangaInfo(api, threadID, fullM || exactMatch, query);
    }

    /* عرض قائمة اختيار — حد 8 نتائج */
    const limited = results.slice(0, 8);
    const lines = limited.map((m, i) => {
      const title = m.title.english || m.title.romaji || "؟";
      const native = m.title.native ? ` (${m.title.native})` : "";
      const year = m.startDate?.year ? ` | ${m.startDate.year}` : "";
      const score = m.averageScore ? ` | ⭐${m.averageScore}` : "";
      const srcTag = m._src === "mangadex" ? " [MD]" : "";
      const type = countryLabel(m.countryOfOrigin);
      return `${i + 1}. ${type} ${title}${native}${year}${score}${srcTag}`;
    });

    api.sendMessage(
      `╭━━━━━━━━━━━━━━━━━╮\n` +
      `   📖 ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝗠𝗮𝗻𝗚𝗮\n` +
      `╰━━━━━━━━━━━━━━━━━╯\n\n` +
      `🔍 نتائج البحث عن: "${query}"\n\n` +
      lines.join("\n") +
      `\n\n↩️ ردّ برقم للاختيار (1-${limited.length})`,
      threadID,
      (err, info) => {
        if (!info?.messageID) return;
        global.BlackBot.onReply.set(info.messageID, {
          commandName: this.config.name,
          type: "pick",
          author: senderID,
          query,
          isChapter,
          chapterNum,
          results: limited
        });
      }
    );
  },

  onReply: async function ({ api, event, Reply }) {
    if (event.senderID !== Reply.author) return;
    const { threadID } = event;
    const body = event.body.trim().toLowerCase().replace(/\s/g, "");

    // حذف الـ onReply الحالي بعد أول استخدام
    const replyMsgID = event.messageReply?.messageID;
    if (replyMsgID) global.BlackBot.onReply.delete(replyMsgID);

    /* ─── اختيار مانغا من القائمة ─── */
    if (Reply.type === "pick") {
      const { query, isChapter, chapterNum, results } = Reply;
      const num = parseInt(body);
      if (isNaN(num) || num < 1 || num > results.length) {
        return api.sendMessage(`❌ اكتب رقم من 1 إلى ${results.length}`, threadID);
      }
      const chosen = results[num - 1];
      const mangaTitle = chosen.title.english || chosen.title.romaji || query;
      const searchNames = [...new Set([chosen.title.english, chosen.title.romaji, query].filter(Boolean))];
      const mdId = chosen.mdId || null;

      if (isChapter) {
        return api.sendMessage(
          `📌 ${mangaTitle}\n📄 الفصل ${chapterNum}\n\n🌐 هل تريدها بالعربية أم الإنجليزية؟\n↩️ ردّ بـ: ar أو en`,
          threadID,
          (err, info) => {
            if (!info?.messageID) return;
            global.BlackBot.onReply.set(info.messageID, {
              commandName: this.config.name,
              type: "lang",
              author: Reply.author,
              query, chapterNum, searchNames, mangaTitle, mdId
            });
          }
        );
      }

      const waitID = await send(api, threadID, "⏳ جاري تحميل المعلومات...");
      const fullM = chosen.id ? await aniGetById(chosen.id) : null;
      if (waitID) api.unsendMessage(waitID, () => {});
      return showMangaInfo(api, threadID, fullM || chosen, query);
    }

    /* ─── اختيار لغة الفصل ─── */
    if (Reply.type === "lang") {
      const { query, chapterNum, searchNames, mangaTitle, mdId } = Reply;
      if (!["ar", "en"].includes(body)) {
        return api.sendMessage("❌ ردّ بـ ar للعربية أو en للإنجليزية.", threadID);
      }

      const loadID = await send(api, threadID,
        `⏳ جاري تحميل الفصل ${chapterNum} باللغة ${body === "ar" ? "🇸🇦 العربية" : "🇬🇧 الإنجليزية"}...`
      );

      let result = null;
      if (body === "ar") {
        result = await fetchArabicChapter(searchNames, chapterNum, mdId);
        if (loadID) api.unsendMessage(loadID, () => {});
        if (!result) return send(api, threadID, `❌ الفصل ${chapterNum} غير متاح بالعربية لـ "${mangaTitle}".\n💡 جرب: en`);
        await sendChapterPages(api, threadID, result.pages, result.referer, mangaTitle, chapterNum, result.source, "🇸🇦 عربي");
      } else {
        result = await fetchEnglishChapter(searchNames, chapterNum, mdId);
        if (loadID) api.unsendMessage(loadID, () => {});
        if (!result) return send(api, threadID, `❌ الفصل ${chapterNum} غير متاح بالإنجليزية لـ "${mangaTitle}".\n💡 جرب: ar`);
        await sendChapterPages(api, threadID, result.pages, result.referer, mangaTitle, chapterNum, result.source, "🇬🇧 إنجليزي", result.chTitle || "");
      }
    }
  }
};
