const { getTime } = global.utils;

const DEVELOPER_IDS = ["61583835186508", "61587142678804"];

module.exports = {
  config: {
    name: "autoinvite",
    version: "3.1",
    author: "Saint",
    category: "events"
  },

  onStart: async ({ api, event, usersData, threadsData, message }) => {
    if (event.logMessageType !== "log:unsubscribe") return;

    const { threadID, logMessageData, author } = event;

    const settings = await threadsData.get(threadID, "data.autoinvite").catch(() => null);
    if (settings?.disable === true) return;

    const leftID = String(
      logMessageData.leftParticipantFbId ||
      logMessageData.removedParticipantFbId ||
      ""
    );

    if (!leftID) return;

    if (leftID === String(api.getCurrentUserID())) return;
    if (DEVELOPER_IDS.includes(leftID)) return;

    const wasRemoved = String(author) !== leftID;
    if (wasRemoved) return;

    let userName;
    try {
      userName = await usersData.getName(leftID);
    } catch (_) {
      userName = "عضو";
    }

    await new Promise(r => setTimeout(r, 300));

    try {
      await api.addUserToGroup(leftID, threadID);
      await message.send({
        body: `〔⊘〕 يا....!! @${userName}\n◈ ↞ الخروج ممنوع〔!〕\n\n◆ تمت إعادة إضافتك مجدداً\n━━━━━━━━━\n◈ 𝗕⃪𝗹𝗮𝗰⃪𝗸 : 𝗠⃪𝗮⃪𝗵⃪𝗼𝗿𝗮⃪\n━━━━━━━━━━`,
        mentions: [{ tag: `@${userName}`, id: leftID }]
      });
    } catch (_) {
      message.send("هه واقيل بلوكاني 🤙");
    }
  }
};
