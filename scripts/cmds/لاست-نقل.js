async function getGroupsList(api) {
  let all = [];
  try { const r = await api.getThreadList(100, null, ["INBOX"]); all.push(...(r || []).filter(t => t.isGroup).map(g => ({ ...g, type: "active" }))); } catch (_) {}
  try { const r = await api.getThreadList(100, null, ["PENDING"]); all.push(...(r || []).filter(t => t.isGroup).map(g => ({ ...g, type: "pending" }))); } catch (_) {}
  try { const r = await api.getThreadList(100, null, ["OTHER"]); all.push(...(r || []).filter(t => t.isGroup).map(g => ({ ...g, type: "other" }))); } catch (_) {}
  all.sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0));
  return all;
}

module.exports = {
  config: {
    name: "لاست-نقل",
    aliases: ["last-move", "نقل-كروب"],
    version: "1.0",
    author: "Saint",
    role: 2,
    shortDescription: "نقل أعضاء الكروب الحالي إلى كروب آخر",
    category: "owner",
    guide: "{pn}",
    countDown: 15
  },

  onStart: async function ({ api, event, commandName }) {
    const { threadID, messageID, senderID } = event;
    const botID = String(api.getCurrentUserID());

    // جلب أعضاء الكروب الحالي
    let members = [];
    try {
      const info = await api.getThreadInfo(threadID);
      members = (info.participantIDs || []).map(String).filter(id => id !== botID);
    } catch (_) {}

    if (members.length === 0)
      return api.sendMessage("〔✗〕 لا يوجد أعضاء.", threadID, null, messageID);

    // جلب قائمة الكروبات (باستثناء الحالي)
    const allGroups = (await getGroupsList(api)).filter(g => String(g.threadID) !== String(threadID));

    if (allGroups.length === 0)
      return api.sendMessage("〔✗〕 لا توجد مجموعات أخرى.", threadID, null, messageID);

    // بناء الرسالة — قصيرة وبسيطة
    let msg = `〖 نقل الأعضاء 〗 (${members.length} عضو)\n━━━━━━━━━━\n`;
    allGroups.forEach((g, i) => {
      const tag = g.type === "active" ? "" : g.type === "pending" ? " ◦" : " ·";
      msg += `「${i + 1}」${g.name || "بدون اسم"}${tag}\n`;
    });
    msg += `━━━━━━━━━━\nأرسل الرقم للنقل`;

    api.sendMessage(msg, threadID, (err, info) => {
      if (!info) return;
      global.BlackBot.onReply.set(info.messageID, {
        commandName,
        messageID: info.messageID,
        author: senderID,
        allGroups,
        members,
        sourceThreadID: threadID,
        delete: () => global.BlackBot.onReply.delete(info.messageID)
      });
    }, messageID);
  },

  onReply: async function ({ api, event, Reply }) {
    if (event.senderID !== Reply.author) return;
    Reply.delete();

    const { allGroups, members, sourceThreadID } = Reply;
    const num = parseInt((event.body || "").trim());

    if (isNaN(num) || num < 1 || num > allGroups.length)
      return api.sendMessage("〔✗〕 رقم غير صالح.", event.threadID);

    const target = allGroups[num - 1];
    const botID = String(api.getCurrentUserID());

    // إبلاغ بالبدء
    await api.sendMessage(
      `〖 جاري النقل 〗\n━━━━━━━━━━\n◆ الهدف: ${target.name || "بدون اسم"}\n◆ الأعضاء: ${members.length}`,
      event.threadID
    );

    let ok = 0, fail = 0;
    for (const uid of members) {
      if (uid === botID) continue;
      try {
        await api.addUserToGroup(uid, target.threadID);
        ok++;
      } catch (_) {
        fail++;
      }
      await new Promise(r => setTimeout(r, 600));
    }

    api.sendMessage(
      `〖 اكتمل النقل 〗\n━━━━━━━━━━\n✓ نجح: ${ok}\n✗ فشل: ${fail}`,
      event.threadID
    );
  }
};
