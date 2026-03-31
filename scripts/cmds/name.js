const pendingReverts = new Map();
const lastRevertTime = new Map();
const isReverting = new Map();

const DEBOUNCE_MS = 1200;
const MIN_INTERVAL_MS = 4000;
const MAX_RETRIES = 5;
const TITLE_TIMEOUT_MS = 10000;

function setTitle(api, name, threadID) {
  return Promise.race([
    api.setTitle(name, threadID),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("setTitle timeout")), TITLE_TIMEOUT_MS)
    )
  ]);
}

async function revertWithRetry(api, name, threadID) {
  if (isReverting.get(threadID)) return;
  isReverting.set(threadID, true);

  try {
    const now = Date.now();
    const last = lastRevertTime.get(threadID) || 0;
    const wait = Math.max(0, MIN_INTERVAL_MS - (now - last));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await setTitle(api, name, threadID);
        lastRevertTime.set(threadID, Date.now());
        break;
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, attempt * 3000));
        }
      }
    }
  } finally {
    isReverting.set(threadID, false);
  }
}

module.exports = {
  config: {
    name: "نيم",
    version: "5.2",
    author: "edit",
    role: 1,
    shortDescription: "تغيير اسم المجموعة مع حماية صارمة",
    category: "group",
    guide: "{pn} [الاسم الجديد]",
    countDown: 3
  },

  onStart: async ({ api, event, args, threadsData, message }) => {
    const { threadID } = event;
    if (!args[0]) return message.reply("⚠️ اكتب الاسم الجديد بعد الأمر.");

    const newName = args.join(" ").trim();

    try { await threadsData.set(threadID, newName, "data.nimProtectedName"); } catch (_) {}
    try {
      const protectData = await threadsData.get(threadID, "data.protect").catch(() => null);
      if (protectData?.enable) {
        await threadsData.set(threadID, newName, "data.protect.name").catch(() => {});
      }
    } catch (_) {}

    let done = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await setTitle(api, newName, threadID);
        done = true;
        break;
      } catch (_) {
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000));
      }
    }

    if (done) {
      message.reply(`✅ تم تغيير الاسم إلى:\n${newName}`);
    } else {
      message.reply("❌ فشل تغيير الاسم. تأكد أن البوت أدمن في المجموعة.");
    }
  },

  onEvent: async ({ api, event, threadsData }) => {
    try {
      const { threadID, author, logMessageType, logMessageData } = event;
      if (logMessageType !== "log:thread-name") return;

      let protectedName;
      try {
        protectedName = await threadsData.get(threadID, "data.nimProtectedName");
      } catch (_) { return; }

      if (!protectedName) return;

      const botAdmins = global.BlackBot?.config?.adminBot || [];
      const isBot = String(api.getCurrentUserID()) === String(author);
      const isBotAdmin = botAdmins.includes(String(author));

      if (isBot) return;

      if (isBotAdmin) {
        const newSavedName = logMessageData?.name;
        if (newSavedName) {
          try {
            await threadsData.set(threadID, newSavedName, "data.nimProtectedName");
          } catch (_) {}
        }
        return;
      }

      if (pendingReverts.has(threadID)) {
        clearTimeout(pendingReverts.get(threadID));
      }

      const handle = setTimeout(async () => {
        pendingReverts.delete(threadID);
        let currentProtected;
        try {
          currentProtected = await threadsData.get(threadID, "data.nimProtectedName");
        } catch (_) {
          currentProtected = protectedName;
        }
        if (!currentProtected) return;
        await revertWithRetry(api, currentProtected, threadID);
      }, DEBOUNCE_MS);

      pendingReverts.set(threadID, handle);

    } catch (_) {}
  }
};
