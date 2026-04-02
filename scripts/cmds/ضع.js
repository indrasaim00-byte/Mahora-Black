module.exports = {
  config: {
    name: "ضع",
    aliases: ["da3"],
    version: "2.1",
    author: "Saint",
    countDown: 5,
    role: 0,
    shortDescription: "ضع كنية لكل أعضاء المجموعة مع حماية",
    category: "box chat",
    guide: "{pn} [النص] | {pn} off"
  },

  onStart: async function ({ args, event, api, usersData, threadsData, message }) {
    const { threadID } = event;
    const text = args.join(" ").trim();
    if (!text) return;

    const botID = api.getCurrentUserID();
    const adminBot = global.BlackBot.config.adminBot || [];

    if (text === "off") {
      await threadsData.set(threadID, {}, "data.da3Lock");
      return message.reply("◈ تم إيقاف قفل الكنيات");
    }

    const threadInfo = await api.getThreadInfo(threadID);
    const targets = threadInfo.participantIDs.filter(uid => uid !== botID && !adminBot.includes(uid));

    if (!targets.length) return message.reply("◈ لا يوجد أعضاء لتغيير كنياتهم");

    const nicknames = {};
    const BATCH = 1;
    const DELAY_BETWEEN = 4000;
    const DELAY_IN_BATCH = 0;
    let done = 0;

    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH);
      const promises = batch.map(async (uid, idx) => {
        if (idx > 0) await new Promise(r => setTimeout(r, DELAY_IN_BATCH * idx));
        try {
          let name = text;
          if (/\{userName\}/gi.test(name)) name = name.replace(/\{userName\}/gi, await usersData.getName(uid).catch(() => uid));
          if (/\{userID\}/gi.test(name)) name = name.replace(/\{userID\}/gi, uid);
          await api.changeNickname(name, threadID, uid);
          nicknames[uid] = name;
          done++;
        } catch (e) {}
      });
      await Promise.all(promises);
      if (i + BATCH < targets.length) await new Promise(r => setTimeout(r, DELAY_BETWEEN));
    }

    await threadsData.set(threadID, { enable: true, nickname: text, nicknames }, "data.da3Lock");
    message.reply(`◈ تم تغيير ${done}/${targets.length} كنية بنجاح`);
  },

  onEvent: async function ({ api, event, threadsData }) {
    const { threadID, author, logMessageType, logMessageData } = event;
    if (logMessageType !== "log:user-nickname") return;

    const lock = await threadsData.get(threadID, "data.da3Lock");
    if (!lock?.enable) return;

    const botID = api.getCurrentUserID();
    const adminBot = global.BlackBot.config.adminBot || [];

    if (author === botID || adminBot.includes(author)) return;

    const { participant_id } = logMessageData;
    const restoreNickname = lock.nicknames?.[participant_id] ?? lock.nickname ?? "";

    try {
      await api.changeNickname(restoreNickname, threadID, participant_id);
    } catch (e) {}
  }
};
