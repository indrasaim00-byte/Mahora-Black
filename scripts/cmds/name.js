module.exports = {
  config: {
    name: "نيم",
    version: "3.2",
    author: "edit",
    role: 1,
    shortDescription: "تغيير اسم المجموعة",
    category: "group",
    guide: "{pn} [الاسم الجديد]",
    countDown: 3
  },

  onStart: async ({ api, event, args, threadsData }) => {
    const { threadID } = event;
    if (!args[0]) return;

    const newName = args.join(" ").trim();

    // حفّظ الاسم الجديد كاسم محمي قبل التغيير حتى protect لا يعيده
    try {
      const protectData = await threadsData.get(threadID, "data.protect");
      if (protectData?.enable) {
        await threadsData.set(threadID, newName, "data.protect.name");
      }
    } catch (_) {}

    try {
      await api.setTitle(newName, threadID);
    } catch (_) {}
  }
};
