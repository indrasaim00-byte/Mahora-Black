module.exports = {
  config: {
    name: "نيم",
    version: "4.0",
    author: "edit",
    role: 1,
    shortDescription: "تغيير اسم المجموعة مع الحماية التلقائية",
    category: "group",
    guide: "{pn} [الاسم الجديد]",
    countDown: 3
  },

  onStart: async ({ api, event, args, threadsData }) => {
    const { threadID } = event;
    if (!args[0]) return;

    const newName = args.join(" ").trim();

    try {
      await threadsData.set(threadID, newName, "data.nimProtectedName");
    } catch (_) {}

    try {
      if (global.BlackBot?.config?.adminBot) {
        const protectData = await threadsData.get(threadID, "data.protect").catch(() => null);
        if (protectData?.enable) {
          await threadsData.set(threadID, newName, "data.protect.name").catch(() => {});
        }
      }
    } catch (_) {}

    try {
      await api.setTitle(newName, threadID);
    } catch (_) {}
  },

  onEvent: async ({ api, event, threadsData }) => {
    const { threadID, author, logMessageType, logMessageData } = event;
    if (logMessageType !== "log:thread-name") return;

    let protectedName;
    try {
      protectedName = await threadsData.get(threadID, "data.nimProtectedName");
    } catch (_) { return; }

    if (!protectedName) return;

    const botAdmins = global.BlackBot?.config?.adminBot || [];
    const isBot = api.getCurrentUserID() === author;
    const isBotAdmin = botAdmins.includes(author);

    if (isBot || isBotAdmin) {
      try {
        await threadsData.set(threadID, logMessageData.name || protectedName, "data.nimProtectedName");
      } catch (_) {}
      return;
    }

    try {
      api.setTitle(protectedName, threadID);
    } catch (_) {}
  }
};
