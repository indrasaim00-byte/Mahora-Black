const { getTime } = global.utils;

module.exports = {
  config: {
    name: "autoinvite",
    version: "2.5",
    author: "Saint",
    category: "events"
  },

  onStart: async ({ api, event, usersData, message }) => {
    if (event.logMessageType !== "log:unsubscribe") return;

    const { threadID, logMessageData, author } = event;
    const leftID = logMessageData.leftParticipantFbId;

    if (leftID === author) {
      const userName = await usersData.getName(leftID);

      const form = {
        body: `〔⊘〕 يا....!! @${userName}
◈ ↞ الخروج ممنوع〔!〕

◆ تمت إعادة إضافتك مجدداً
━━━━━━━━━
◈ 𝗕⃪𝗹𝗮𝗰⃪𝗸 : 𝗠⃪𝗮⃪𝗵⃪𝗼𝗿𝗮⃪
━━━━━━━━━━`,
        mentions: [{ tag: `@${userName}`, id: leftID }]
      };

      try {
        await api.addUserToGroup(leftID, threadID);
        await message.send(form);
      } catch (err) {
        message.send("〔!〕 عذراً، لم أتمكن من إعادة إضافة المستخدم. ربما تم حظر الإضافة.");
      }
    }
  }
};
