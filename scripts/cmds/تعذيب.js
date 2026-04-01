module.exports = {
  config: {
    name: "تعذيب",
    aliases: ["ازعاج", "spam", "torture"],
    version: "1.0",
    author: "سايم",
    countDown: 10,
    role: 0,
    shortDescription: "يعذب شخص بالمنشن المتكرر",
    longDescription: "يرسل منشنات متكررة لشخص معين في الغروب",
    category: "fun",
    guide: "{p}{n} @شخص [عدد 1-20]",
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID, mentions } = event;

    const mentionedIDs = Object.keys(mentions || {});
    if (mentionedIDs.length === 0) {
      return api.sendMessage(
        "⚠️ منشن الشخص اللي تبي تعذبه!\nمثال: .تعذيب @شخص 10",
        threadID,
        messageID
      );
    }

    const targetID = mentionedIDs[0];
    const targetName = mentions[targetID];

    const rawCount = parseInt(args.find(a => /^\d+$/.test(a))) || 5;
    const count = Math.min(Math.max(rawCount, 1), 20);

    const tortureLines = [
      "🔥 وين روح يا",
      "😈 ما تنجو منا يا",
      "☠️ العذاب جاك يا",
      "💀 ما راح تنام يا",
      "😂 تعبنا نحن ولا هو يا",
      "🩸 نهايتك يا",
      "⚡ صحصح يا",
      "🕷️ ترى نحن هنا يا",
      "👁️ عيننا عليك يا",
      "🎯 هدفنا يا",
    ];

    for (let i = 0; i < count; i++) {
      const line = tortureLines[i % tortureLines.length];
      const msg = {
        body: `${line} ${targetName} 😈 [${i + 1}/${count}]`,
        mentions: [{ tag: targetName, id: targetID }],
      };
      await api.sendMessage(msg, threadID);
      await new Promise(r => setTimeout(r, 800));
    }
  },
};
