module.exports = {
  config: {
    name: "اضافة-تلقائية",
    aliases: ["autoinvite", "اضافه-تلقائيه"],
    version: "1.0",
    author: "Saint",
    countDown: 3,
    role: 1,
    shortDescription: "تفعيل/إيقاف الإضافة التلقائية للأعضاء",
    category: "box chat",
    guide: "{pn} on | {pn} off"
  },

  onStart: async function ({ args, event, threadsData, message }) {
    const { threadID } = event;
    const action = (args[0] || "").toLowerCase();

    if (action === "off" || action === "إيقاف") {
      await threadsData.set(threadID, { disable: true }, "data.autoinvite");
      return message.reply("◈ تم إيقاف الإضافة التلقائية في هذه المجموعة");
    }

    if (action === "on" || action === "تفعيل") {
      await threadsData.set(threadID, { disable: false }, "data.autoinvite");
      return message.reply("◈ تم تفعيل الإضافة التلقائية في هذه المجموعة");
    }

    const settings = await threadsData.get(threadID, "data.autoinvite").catch(() => null);
    const isActive = !settings?.disable;
    return message.reply(`◈ الإضافة التلقائية: ${isActive ? "مفعّلة ✅" : "متوقفة ❌"}\n◈ استخدم: .اضافة-تلقائية on/off`);
  }
};
