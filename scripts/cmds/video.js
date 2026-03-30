const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const ytSearch = require("yt-search");

const tmpDir = path.join(__dirname, "tmp");

const INVIDIOUS = [
  "https://inv.nadeko.net",
  "https://invidious.privacydev.net",
  "https://iv.datura.network"
];

function sendMsg(message, body) {
  return new Promise(resolve => message.reply(body, (err, info) => resolve(info?.messageID || null)));
}

function formatViews(n) {
  if (!n) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

async function getStreamUrl(videoId) {
  for (const instance of INVIDIOUS) {
    try {
      const res = await axios.get(`${instance}/api/v1/videos/${videoId}`, { timeout: 12000 });
      const streams = res.data?.formatStreams;
      if (streams?.length) {
        const best = streams.find(s => s.qualityLabel === "360p") || streams[streams.length - 1];
        return { url: best.url, quality: best.qualityLabel || "360p" };
      }
    } catch (_) {}
  }
  return null;
}

async function downloadVideo(streamUrl, fileName) {
  fs.ensureDirSync(tmpDir);
  const tmpPath = path.join(tmpDir, fileName);
  try {
    const head = await axios.head(streamUrl, { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } });
    const size = parseInt(head.headers["content-length"] || "0");
    if (size > 60 * 1024 * 1024) return { path: null, tooLarge: true };
  } catch (_) {}
  const res = await axios.get(streamUrl, { responseType: "stream", timeout: 120000, headers: { "User-Agent": "Mozilla/5.0" } });
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(tmpPath);
    res.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
  return { path: tmpPath, tooLarge: false };
}

module.exports = {
  config: {
    name: "فيديو",
    aliases: ["v", "video", "دونلواد", "يوتيوب", "yt"],
    version: "2.0",
    author: "Saint",
    countDown: 8,
    role: 0,
    shortDescription: "بحث وتحميل فيديو من يوتيوب",
    longDescription: "ابحث عن فيديو أو أغنية من يوتيوب بالاسم وسيتم تحميله وإرساله مباشرة",
    category: "media",
    guide: "{pn} [اسم الفيديو أو الأغنية]"
  },

  onStart: async function ({ api, event, args, message }) {
    const query = args.join(" ").trim();
    if (!query) return message.reply("🔍 اكتب اسم الفيديو أو الأغنية بعد الأمر.\nمثال: .فيديو despacito\nمثال: .فيديو اغنية حزينة");

    const waitingID = await sendMsg(message, "◈ ↞جاري البحث..〔 ! 〕\n◈ 𝗕⃪𝗹𝗮𝗰⃪𝗸 : 𝗠⃪𝗮⃪𝗵⃪𝗼𝗿𝗮⃪\n━━━━━━━━━━━━━");

    function unsendWaiting() {
      if (waitingID) api.unsendMessage(waitingID).catch(() => {});
    }

    try {
      const results = await ytSearch(query);
      if (!results?.videos?.length) {
        unsendWaiting();
        return message.reply(`❌ لم أجد نتائج لـ "${query}"\nجرب كتابة اسم آخر.`);
      }

      const video = results.videos[0];
      const videoId = video.videoId;

      unsendWaiting();

      const dlMsgID = await sendMsg(message,
        `⏬ جاري تنزيل الفيديو...\n` +
        `🎬 ${video.title}\n` +
        `📺 ${video.author.name}\n` +
        `⏱ ${video.timestamp} • 👁 ${formatViews(video.views)}`
      );

      const stream = await getStreamUrl(videoId);

      if (!stream?.url) {
        if (dlMsgID) api.unsendMessage(dlMsgID).catch(() => {});
        return message.reply({
          body: `❌ تعذر تنزيل الفيديو.\n🔗 يمكنك مشاهدته مباشرة:\nhttps://youtu.be/${videoId}`
        });
      }

      const fileName = `yt_${Date.now()}.mp4`;
      const result = await downloadVideo(stream.url, fileName);

      if (dlMsgID) api.unsendMessage(dlMsgID).catch(() => {});

      if (result.tooLarge) {
        return message.reply({
          body: `⚠️ حجم الفيديو أكبر من 60MB.\n🔗 يمكنك مشاهدته مباشرة:\nhttps://youtu.be/${videoId}`
        });
      }

      if (!result.path) {
        return message.reply({
          body: `❌ فشل تنزيل الفيديو.\n🔗 يمكنك مشاهدته مباشرة:\nhttps://youtu.be/${videoId}`
        });
      }

      const body =
        `╭━━━━━━━━━━━━━━━━━╮\n` +
        `   🎬 ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝗩𝗶𝗱𝗲𝗼\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n` +
        `📌 ${video.title}\n` +
        `📺 القناة: ${video.author.name}\n` +
        `⏱ المدة: ${video.timestamp}\n` +
        `👁 المشاهدات: ${formatViews(video.views)}\n` +
        `📊 الجودة: ${stream.quality}\n` +
        `🔗 https://youtu.be/${videoId}\n` +
        `\n✎﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏\n` +
        `↞ ⌯ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼`;

      message.reply({ body, attachment: fs.createReadStream(result.path) }, () => {
        fs.remove(result.path).catch(() => {});
      });

    } catch (err) {
      console.error("[فيديو]", err.message);
      unsendWaiting();
      message.reply("❌ حدث خطأ أثناء البحث أو التحميل، جرب مرة أخرى.");
    }
  }
};
