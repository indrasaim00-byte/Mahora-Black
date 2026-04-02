const fs = require("fs-extra");
const path = require("path");

const GIF_PATH = path.join(__dirname, "../events/assets/ta3zib.gif");

module.exports = {
  config: {
    name: "طرد",
    aliases: ["كيك", "kick"],
    version: "2.0",
    author: "سايم",
    countDown: 5,
    role: 1,
    shortDescription: "طرد عضو من الغروب",
    category: "owner",
    guide: "رد على رسالة شخص أو: {pn} @شخص",
  },

  onStart: async function ({ api, event }) {
    const { threadID, messageID, mentions, messageReply } = event;

    const adminBot = global.BlackBot?.config?.adminBot || [];

    const adminIDs = await api.getThreadInfo(threadID)
      .then(info => (info.adminIDs || []).map(a => a.uid))
      .catch(() => []);

    if (!adminIDs.includes(api.getCurrentUserID())) {
      return api.sendMessage(
        "⚠️ خلّ البوت ادمن أول عشان يقدر يطرد!",
        threadID,
        messageID
      );
    }

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
        "⚠️ منشن الشخص أو رد على رسالته!",
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

    try {
      await api.removeUserFromGroup(targetID, threadID);
    } catch (e) {
      return api.sendMessage(
        "⚠️ ما قدرت أطرده، تأكد إن البوت ادمن في الغروب!",
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
      api.sendMessage(`روح تشريد 🦵 ${targetName || ""}`, threadID);
    }
  },
};
