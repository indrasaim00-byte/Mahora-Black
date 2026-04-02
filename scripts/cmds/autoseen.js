const fs = require("fs-extra");
const path = __dirname + "/cache/autoseen.json";

if (!fs.existsSync(path)) {
  fs.writeFileSync(path, JSON.stringify({ status: true }, null, 2));
}

let _cache = null;
let _lastMarkRead = 0;
const MARK_READ_INTERVAL = 10000;

function getCache() {
  if (_cache === null) {
    try { _cache = JSON.parse(fs.readFileSync(path)); }
    catch { _cache = { status: true }; }
  }
  return _cache;
}

module.exports = {
  config: {
    name: "مشاهدة-تلقائية",
    aliases: ["autoseen"],
    version: "2.1",
    author: "Saint",
    countDown: 0,
    role: 0,
    shortDescription: "نظام المشاهدة التلقائية",
    longDescription: "البوت سيشاهد جميع الرسائل الجديدة تلقائياً.",
    category: "system",
    guide: {
      en: "{pn} on/off",
    },
  },

  onStart: async function ({ message, args }) {
    const data = getCache();
    if (!args[0]) {
      return message.reply(`◈ حالة المشاهدة التلقائية: ${data.status ? "〔✓〕 مفعّلة" : "〔✗〕 معطّلة"}`);
    }

    if (args[0].toLowerCase() === "on") {
      data.status = true;
      fs.writeFileSync(path, JSON.stringify(data, null, 2));
      return message.reply("〔✓〕 المشاهدة التلقائية مفعّلة الآن!");
    } else if (args[0].toLowerCase() === "off") {
      data.status = false;
      fs.writeFileSync(path, JSON.stringify(data, null, 2));
      return message.reply("〔✗〕 المشاهدة التلقائية معطّلة الآن!");
    } else {
      return message.reply("〔!〕 الاستخدام: autoseen on / off");
    }
  },

  onChat: async function ({ event, api }) {
    try {
      if (!getCache().status) return;
      const now = Date.now();
      if (now - _lastMarkRead < MARK_READ_INTERVAL) return;
      _lastMarkRead = now;
      api.markAsReadAll().catch(() => {});
    } catch (e) {}
  },
};
