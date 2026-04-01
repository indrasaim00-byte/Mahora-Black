const { getTime } = global.utils;

module.exports = {
  config: {
    name: "autoinvite",
    version: "2.6",
    author: "Saint",
    category: "events"
  },

  onStart: async ({ api, event, usersData, message }) => {
    if (event.logMessageType !== "log:unsubscribe") return;

    const { threadID, logMessageData } = event;
    const leftID = String(logMessageData.leftParticipantFbId || "");

    if (!leftID) return;

    let userName;
    try {
      userName = await usersData.getName(leftID);
    } catch (_) {
      userName = "عضو";
    }

    try {
      await api.addUserToGroup(leftID, threadID);
      await message.send({
        body: `〔⊘〕 يا....!! @${userName}\n◈ ↞ الخروج ممنوع〔!〕\n\n◆ تمت إعادة إضافتك مجدداً\n━━━━━━━━━\n◈ 𝗕⃪𝗹𝗮𝗰⃪𝗸 : 𝗠⃪𝗮⃪𝗵⃪𝗼𝗿𝗮⃪\n━━━━━━━━━━`,
        mentions: [{ tag: `@${userName}`, id: leftID }]
      });
    } catch (err) {
      message.send("〔!〕 عذراً، لم أتمكن من إعادة إضافة المستخدم. ربما تم حظر الإضافة.");
    }
  }
};
