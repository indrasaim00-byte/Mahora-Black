module.exports = {
  config: {
    name: "نيم",
    version: "3.1",
    author: "edit",
    role: 1,
    shortDescription: "تغيير اسم المجموعة",
    category: "group",
    guide: "{pn} [الاسم الجديد]",
    countDown: 3
  },

  onStart: async ({ api, event, args, message }) => {
    const { threadID } = event;

    if (!args[0]) {
      return message.reply("📝 اكتب الاسم الجديد بعد الأمر.\nمثال: .نيم اسم الجروب");
    }

    const newName = args.join(" ").trim();

    try {
      await api.setTitle(newName, threadID);
      await message.reply(`✅ تم تغيير اسم الجروب إلى:\n${newName}`);
    } catch (e) {
      await message.reply("❌ فشل تغيير الاسم. تأكد أن البوت لديه صلاحية في الجروب.");
    }
  }
};
