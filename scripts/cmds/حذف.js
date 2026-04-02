module.exports = {
  config: {
    name: "حذف",
    aliases: ["clearname", "removename"],
    version: "1.1",
    author: "Saint",
    countDown: 5,
    role: 0,
    shortDescription: "حذف كنيات جميع أعضاء المجموعة",
    category: "box chat",
    guide: "{pn} — يحذف كنيات جميع الأعضاء"
  },

  onStart: async function ({ event, api, threadsData, message }) {
    const { threadID } = event;
    const botID = api.getCurrentUserID();
    const adminBot = global.BlackBot.config.adminBot || [];

    const threadInfo = await api.getThreadInfo(threadID);
    const targets = threadInfo.participantIDs.filter(uid => uid !== botID && !adminBot.includes(uid));

    if (!targets.length) return message.reply("◈ لا يوجد أعضاء لحذف كنياتهم");

    const BATCH = 1;
    const DELAY_BETWEEN = 4000;
    const DELAY_IN_BATCH = 0;
    let done = 0;

    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH);
      const promises = batch.map(async (uid, idx) => {
        if (idx > 0) await new Promise(r => setTimeout(r, DELAY_IN_BATCH * idx));
        try {
          await api.changeNickname("", threadID, uid);
          done++;
        } catch (e) {}
      });
      await Promise.all(promises);
      if (i + BATCH < targets.length) await new Promise(r => setTimeout(r, DELAY_BETWEEN));
    }

    await threadsData.set(threadID, {}, "data.da3Lock");
    message.reply(`◈ تم حذف ${done}/${targets.length} كنية بنجاح`);
  }
};
