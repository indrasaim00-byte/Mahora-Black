const fs = require("fs-extra");

module.exports = {
  config: {
    name: "كنيتك",
    aliases: ["botnick", "setnick"],
    version: "1.0",
    author: "BlackBot",
    countDown: 5,
    role: 1,
    description: { ar: "تغيير كنية البوت للأبد (للادمن فقط)" },
    category: "إدارة البوت",
    guide: { ar: "{pn} <الكنية الجديدة>" }
  },

  onStart: async ({ api, event, args, message }) => {
    const newNick = args.join(" ").trim();

    if (!newNick)
      return message.reply("❌ اكتب الكنية الجديدة بعد الأمر.\nمثال: .كنيتك BlackBot V2");

    const botID = api.getCurrentUserID();
    const config = global.BlackBot.config;
    const oldNick = config.nickNameBot || "";

    // حفظ الكنية الجديدة في الكونفيغ
    config.nickNameBot = newNick;
    try {
      fs.writeFileSync(
        global.client.dirConfig,
        JSON.stringify(config, null, 2)
      );
    } catch (err) {
      return message.reply(`❌ فشل حفظ الكونفيغ: ${err.message}`);
    }

    // تطبيق الكنية على كل المجموعات في قاعدة البيانات
    const allThreads = (global.db?.allThreadData || [])
      .filter(t => t.isGroup !== false)
      .map(t => t.threadID);

    // طبّق في المجموعة الحالية فوراً
    try { await api.changeNickname(newNick, event.threadID, botID); } catch (_) {}

    // طبّق على الباقي بتأخير بسيط لتفادي rate-limit
    let done = 1;
    for (const tid of allThreads) {
      if (tid === event.threadID) continue;
      await new Promise(r => setTimeout(r, 400));
      try { await api.changeNickname(newNick, tid, botID); done++; } catch (_) {}
    }

    message.reply(
      `✅ تم تغيير كنية البوت للأبد!\n\n` +
      `📝 القديمة: ${oldNick || "بدون كنية"}\n` +
      `✨ الجديدة: ${newNick}\n` +
      `📊 طُبِّقت على ${done} مجموعة`
    );
  }
};
