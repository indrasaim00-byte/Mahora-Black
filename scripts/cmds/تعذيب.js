const fs = require("fs-extra");
const path = require("path");

const GIF_PATH = path.join(__dirname, "../events/assets/ta3zib.gif");
const ROUNDS = 10;
const DELAY = 1500;

module.exports = {
  config: {
    name: "تعذيب",
    aliases: ["ازعاج", "torture"],
    version: "3.0",
    author: "سايم",
    countDown: 60,
    role: 1,
    shortDescription: "تعذيب شخص بالطرد والإعادة 🦵",
    category: "fun",
    guide: "رد على رسالة شخص أو: {pn} @شخص",
  },

  onStart: async function ({ api, event }) {
    const { threadID, messageID, mentions, messageReply } = event;

    const adminBot = global.BlackBot?.config?.adminBot || [];

    let targetID = null;
    let targetName = null;

    const mentionedIDs = Object.keys(mentions || {});
    if (mentionedIDs.length > 0) {
      targetID = mentionedIDs[0];
      targetName = mentions[targetID];
    } else if (messageReply?.senderID) {
      targetID = messageReply.senderID;
      targetName = messageReply.senderName || `@${targetID}`;
    } else {
      return api.sendMessage(
        "⚠️ رد على رسالة شخص أو منشنه!",
        threadID,
        messageID
      );
    }

    if (adminBot.includes(targetID)) {
      return api.sendMessage(
        "هه متروحش تقود هذا يعذبنا نا ونت 😂",
        threadID,
        messageID
      );
    }

    const botID = api.getCurrentUserID();
    const threadInfo = await api.getThreadInfo(threadID).catch(() => null);
    const botIsAdmin = threadInfo?.adminIDs?.some(a => a.uid === botID);

    if (!botIsAdmin) {
      return api.sendMessage(
        "⚠️ خلّ البوت ادمن أول عشان يقدر يعذّب!",
        threadID,
        messageID
      );
    }

    try {
      const gifStream = fs.createReadStream(GIF_PATH);
      await api.sendMessage(
        {
          body: `روح تشريد 🦵`,
          attachment: gifStream,
          mentions: targetName ? [{ tag: targetName, id: targetID }] : [],
        },
        threadID
      );
    } catch (err) {
      await api.sendMessage(`روح تشريد 🦵 ${targetName || ""}`, threadID);
    }

    await new Promise(r => setTimeout(r, 1000));

    for (let i = 1; i <= ROUNDS; i++) {
      try {
        await api.removeUserFromGroup(targetID, threadID);
      } catch (e) {}

      await new Promise(r => setTimeout(r, DELAY));

      try {
        await api.addUserToGroup(targetID, threadID);
      } catch (e) {}

      await new Promise(r => setTimeout(r, DELAY));
    }
  },
};
