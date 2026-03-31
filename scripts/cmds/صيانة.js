module.exports = {
  config: {
    name: "صيانة",
    aliases: ["maintenance", "report"],
    version: "1.1",
    author: "edit",
    role: 0,
    shortDescription: "إرسال مشكلة أو طلب للمطوّر مباشرة",
    category: "utility",
    guide: "{pn} [المشكلة أو الطلب]",
    countDown: 10
  },

  onStart: async ({ api, event, args, message, usersData }) => {
    const { threadID, senderID, messageID } = event;
    const adminBots = global.BlackBot.config.adminBot || [];
    const DEVELOPER_ID = adminBots[0];

    if (!DEVELOPER_ID) {
      return message.reply("❌ لا يوجد مطوّر مُعيَّن في الإعدادات.");
    }

    if (!args[0]) {
      return message.reply("⚙️ اكتب مشكلتك أو طلبك بعد الأمر.\nمثال: .صيانة الأمر X لا يعمل");
    }

    const text = args.join(" ").trim();

    let senderName = senderID;
    try {
      senderName = await usersData.getName(senderID);
    } catch (_) {}

    let threadName = threadID;
    try {
      const tInfo = await api.getThreadInfo(threadID);
      threadName = tInfo.threadName || threadID;
    } catch (_) {}

    const forwardMsg =
      `┌──『 🔧 صيانة / طلب 』\n` +
      `│ 👤 من: ${senderName}\n` +
      `│ 🆔 ID: ${senderID}\n` +
      `│ 💬 الجروب: ${threadName}\n` +
      `│ 🗂️ Thread: ${threadID}\n` +
      `└──────────────────\n\n` +
      `📝 ${text}\n\n` +
      `↩️ رد على هذه الرسالة لإرسال ردك للجروب مباشرة.`;

    api.sendMessage(forwardMsg, DEVELOPER_ID, (err, info) => {
      if (err || !info) {
        return api.sendMessage("❌ فشل إرسال المشكلة للمطوّر. حاول لاحقاً.", threadID, null, messageID);
      }

      global.BlackBot.onReply.set(info.messageID, {
        commandName: "صيانة",
        messageID: info.messageID,
        originalThreadID: threadID,
        originalSenderID: senderID,
        originalMessageID: messageID,
        senderName,
        delete: () => global.BlackBot.onReply.delete(info.messageID)
      });

      api.sendMessage("✅ تم إرسال مشكلتك للمطوّر، انتظر الرد.", threadID, null, messageID);
    });
  },

  onReply: async ({ api, event, Reply }) => {
    const { senderID, body } = event;
    const adminBots = global.BlackBot.config.adminBot || [];

    if (!adminBots.includes(senderID)) return;

    const originalThreadID = Reply.originalThreadID;
    const originalMessageID = Reply.originalMessageID;

    if (!originalThreadID) return;

    const replyText = (body || "").trim();
    if (!replyText) return;

    const outMsg = `🔧 رد المطوّر:\n\n${replyText}`;

    api.sendMessage(outMsg, originalThreadID, null, originalMessageID);

    Reply.delete();
  }
};
