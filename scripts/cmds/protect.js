module.exports = {
  config: {
    name: "حماية-المجموعة",
    aliases: ["protect"],
    version: "1.2",
    author: "Saint",
    role: 1,
    shortDescription: "Lock group name, nickname, theme, emoji",
    category: "group",
    guide: "{pn} on/off"
  },

  onStart: async ({ api, event, message, threadsData, args }) => {
    const { threadID } = event;

    if (!args[0]) return message.reply("⚠️ Usage: /protect on | /protect off");

    if (args[0] === "on") {
      const info = await api.getThreadInfo(threadID);

      const protectData = {
        enable: true,
        name: info.threadName || "",
        emoji: info.emoji || "",
        color: info.color || "",
        nickname: {}
      };

      // Safely handle members
      const members = info.members || [];
      members.forEach(u => {
        protectData.nickname[u.userID] = u.nickname || "";
      });

      await threadsData.set(threadID, protectData, "data.protect");

      return message.reply(
        "🛡 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗘𝗡𝗔𝗕𝗟𝗘𝗗\n✨ Name, Nickname, Theme & Emoji are now LOCKED!"
      );
    }

    if (args[0] === "off") {
      await threadsData.set(threadID, {}, "data.protect");
      return message.reply(
        "🔓 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗗𝗜𝗦𝗔𝗕𝗟𝗘𝗗\n💥 All locks are now OFF!"
      );
    }
  },

  onEvent: async ({ api, event, threadsData }) => {
    const { threadID, author, logMessageType, logMessageData } = event;
    const protectData = await threadsData.get(threadID, "data.protect");
    if (!protectData?.enable) return;

    const info = await api.getThreadInfo(threadID);
    const isAdmin = info.adminIDs.some(e => e.id === author);
    const isBot = api.getCurrentUserID() === author;
    const isBotAdmin = (global.BlackBot?.config?.adminBot || []).includes(author);

    // إذا كان Bot Admin غيّر الاسم عبر .نيم → حدّث الاسم المحمي ولا ترجعه
    if (isBotAdmin && logMessageType === "log:thread-name") {
      await threadsData.set(threadID, logMessageData.name || "", "data.protect.name");
      return;
    }

    if (!isAdmin && !isBot && !isBotAdmin) {
      // NAME
      if (logMessageType === "log:thread-name") {
        api.setTitle(protectData.name, threadID);
      }

      // EMOJI
      if (logMessageType === "log:thread-icon") {
        api.changeThreadEmoji(protectData.emoji, threadID);
      }

      // COLOR/THEME
      if (logMessageType === "log:thread-color") {
        api.changeThreadColor(protectData.color, threadID);
      }

      // NICKNAME
      if (logMessageType === "log:user-nickname") {
        const { participant_id } = logMessageData;
        api.changeNickname(
          protectData.nickname[participant_id] || "",
          threadID,
          participant_id
        );
      }
    }

    // ADMIN PROMOTION PROTECTION
    if (logMessageType === "log:thread-admins" && logMessageData.ADMIN_EVENT === "add_admin") {
      // Only block if the one who promoted is NOT a bot admin (developer)
      if (!isBotAdmin) {
        const targetID = logMessageData.TARGET_ID;
        try { await api.changeAdminStatus(threadID, author, false); } catch (_) {}
        try { await api.changeAdminStatus(threadID, targetID, false); } catch (_) {}
        api.sendMessage("مشي قاللكم سايم ممنوع تضيفو ادمن زيادة يولاد 9", threadID);
        return;
      }
    }

    // ADMIN changed → update saved data
    if (isAdmin) {
      if (logMessageType === "log:thread-name") {
        await threadsData.set(threadID, logMessageData.name || "", "data.protect.name");
      }
      if (logMessageType === "log:thread-icon") {
        await threadsData.set(threadID, logMessageData.thread_icon || "", "data.protect.emoji");
      }
      if (logMessageType === "log:thread-color") {
        await threadsData.set(threadID, logMessageData.theme_id || "", "data.protect.color");
      }
      if (logMessageType === "log:user-nickname") {
        const { participant_id, nickname } = logMessageData;
        await threadsData.set(
          threadID,
          nickname || "",
          `data.protect.nickname.${participant_id}`
        );
      }
    }
  }
};
