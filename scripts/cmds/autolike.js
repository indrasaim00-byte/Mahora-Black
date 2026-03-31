const INTERVAL_MS = 15 * 60 * 1000;
const INTERVAL_KEY = "__autoStickerInterval__";

const STICKERS = [
  { id: "369239263222822", name: "لايك أزرق 👍" },
  { id: "767334466685784", name: "لايك كبير 👍" },
  { id: "369239383222810", name: "قلب ❤️" },
  { id: "369239373222811", name: "ضحكة 😂" },
  { id: "369239393222809", name: "حزين 😢" },
  { id: "369239403222808", name: "واو 😮" },
  { id: "369239413222807", name: "غاضب 😠" },
  { id: "1017763961606848", name: "تنين أصفر 🐲" },
  { id: "209813102439779",  name: "قطة كيوت 🐱" },
  { id: "370372270030591",  name: "بطة صفراء 🐥" },
  { id: "144885035559685",  name: "ستيكر بوشين 🐱" },
  { id: "227457145004322",  name: "نجمة ✨" },
  { id: "746200589102182",  name: "قلب ورد 🌹" },
  { id: "166642960419408",  name: "سحابة ☁️" },
  { id: "460999070611086",  name: "بريق 💫" },
  { id: "964788693571609",  name: "ملاك 😇" },
];

module.exports = {
  config: {
    name: "autolike",
    version: "2.0",
    author: "سايم",
    role: 2,
    shortDescription: "إرسال ملصق عشوائي لمجموعة عشوائية كل 15 دقيقة",
    category: "admin",
    guide: "{pn} on | off",
    countDown: 5
  },

  onStart: async ({ api, args, message }) => {
    const sub = (args[0] || "").toLowerCase();

    if (sub === "off") {
      if (global[INTERVAL_KEY]) {
        clearInterval(global[INTERVAL_KEY]);
        global[INTERVAL_KEY] = null;
        return message.reply("⏹️ تم إيقاف الملصق التلقائي.");
      }
      return message.reply("⚠️ الملصق التلقائي مو شغّال أصلاً.");
    }

    if (sub === "on" || !sub) {
      if (global[INTERVAL_KEY]) {
        return message.reply("✅ الملصق التلقائي شغّال بالفعل.\nكل 15 دقيقة يُرسل ملصق لمجموعة عشوائية.");
      }
      startAutoSticker(api);
      return message.reply(
        `✅ تم تفعيل الملصق التلقائي!\n` +
        `📦 عدد الملصقات: ${STICKERS.length}\n` +
        `⏱️ كل 15 دقيقة → مجموعة عشوائية\n` +
        `\nلإيقافه: .autolike off`
      );
    }

    return message.reply("الاستخدام:\n.autolike on — تشغيل\n.autolike off — إيقاف");
  }
};

function getRandomGroup() {
  try {
    const all = global.db?.allThreadData || [];
    const groups = all.filter(t => {
      if (!t || !t.threadID) return false;
      return String(t.threadID).length >= 15;
    });
    if (!groups.length) return null;
    return groups[Math.floor(Math.random() * groups.length)];
  } catch (_) {
    return null;
  }
}

function getRandomSticker() {
  return STICKERS[Math.floor(Math.random() * STICKERS.length)];
}

function startAutoSticker(api) {
  const tick = async () => {
    try {
      const group = getRandomGroup();
      if (!group) {
        console.log("[autolike] ⚠️ لا توجد مجموعات محفوظة بعد.");
        return;
      }
      const sticker = getRandomSticker();
      await api.sendMessage({ sticker: sticker.id }, group.threadID);
      console.log(`[autolike] ✅ ${sticker.name} → ${group.threadName || group.threadID}`);
    } catch (err) {
      console.error("[autolike] ❌ خطأ:", err.message);
    }
  };

  tick();
  global[INTERVAL_KEY] = setInterval(tick, INTERVAL_MS);
}
