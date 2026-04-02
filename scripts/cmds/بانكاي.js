const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const BANKAI_LINES = [
  "باَنْكَاي... 💀 الصورة الأخيرة تنكشف — والنهاية واحدة",
  "⚔️ باَنْكَاي — لا رجعة بعد هذا",
  "🩸 البانكاي انطلق... العالم وقف والوقت تجمّد",
  "☠️ باَنْكَاي — القوة التي لا يُرى معها أمل",
  "🖤 الحجاب اتكسر... باَنْكَاي — المرحلة الأخيرة",
  "⚡ باَنْكَاي! — الأرض ترتجف والسماء تتصدّع",
  "🔱 باَنْكَاي — هذا مش هجوم، هذا حكم",
];

const ATTACK_LINES = [
  "💢 الضربة وصلت — ما في مكان يتخبأ فيه",
  "🔥 النار ابتلعته — ما بقى منه إلا الذكرى",
  "💀 الظلام غطّاه — هذا هو المصير",
  "⚔️ السيف قطع — ولا صوت بعده",
  "🩸 ما قدرش يدافع — البانكاي أكبر منه",
];

module.exports = {
  config: {
    name: "بانكاي",
    aliases: ["bankai"],
    version: "1.0",
    author: "سايم",
    countDown: 8,
    role: 0,
    shortDescription: "أطلق البانكاي على شخص",
    category: "fun",
    guide: "رد على رسالة شخص أو: {pn} @شخص",
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID, mentions, messageReply, senderID } = event;

    let targetID = null;
    let targetName = null;

    const mentionedIDs = Object.keys(mentions || {});
    if (mentionedIDs.length > 0) {
      targetID = mentionedIDs[0];
      targetName = mentions[targetID];
    } else if (messageReply?.senderID) {
      targetID = messageReply.senderID;
      targetName = messageReply.senderName || `ID:${targetID}`;
    } else {
      return api.sendMessage(
        "⚠️ رد على رسالة شخص أو منشنه لتطلق عليه البانكاي!",
        threadID,
        messageID
      );
    }

    if (targetID === senderID) {
      return api.sendMessage("😂 تطلق بانكاي على نفسك؟ قود يولد", threadID, messageID);
    }

    const bankai = BANKAI_LINES[Math.floor(Math.random() * BANKAI_LINES.length)];
    const attack = ATTACK_LINES[Math.floor(Math.random() * ATTACK_LINES.length)];

    const msg = {
      body: `${bankai}\n\n🎯 الهدف: ${targetName}\n${attack}`,
      mentions: [{ tag: targetName, id: targetID }],
    };

    await api.sendMessage(msg, threadID);
  },
};
