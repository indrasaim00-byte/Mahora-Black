const { getTime } = global.utils;

const DEVELOPER_IDS = ["61583835186508", "61587142678804"];

module.exports = {
  config: {
    name: "autoinvite",
    version: "3.0",
    author: "Saint",
    category: "events"
  },

  onStart: async ({ api, event, usersData, message }) => {
    if (event.logMessageType !== "log:unsubscribe") return;

    const { threadID, logMessageData, author } = event;

    // الحصول على ID الشخص — يدعم حقلَي المغادرة والإزالة
    const leftID = String(
      logMessageData.leftParticipantFbId ||
      logMessageData.removedParticipantFbId ||
      ""
    );

    if (!leftID) return;

    // لا تُعد البوت نفسه أو المطوّرين
    if (leftID === String(api.getCurrentUserID())) return;
    if (DEVELOPER_IDS.includes(leftID)) return;

    // تحديد: هل غادر بنفسه أم أُزيل بواسطة شخص آخر؟
    const wasRemoved = String(author) !== leftID;

    let userName;
    try {
      userName = await usersData.getName(leftID);
    } catch (_) {
      userName = "عضو";
    }

    // إذا أُزيل بواسطة شخص آخر → انتظر 2 ثانية قبل إعادة الإضافة
    // لأن فيسبوك يحتاج وقتاً لمعالجة الإزالة قبل قبول طلب الإضافة
    const delay = wasRemoved ? 2000 : 300;

    await new Promise(r => setTimeout(r, delay));

    try {
      await api.addUserToGroup(leftID, threadID);
      await message.send({
        body: wasRemoved
          ? `〔⊘〕 يا....!! @${userName}\n◈ ↞ الإزالة ممنوعة〔!〕\n\n◆ تمت إعادة إضافتك مجدداً\n━━━━━━━━━\n◈ 𝗕⃪𝗹𝗮𝗰⃪𝗸 : 𝗠⃪𝗮⃪𝗵⃪𝗼𝗿𝗮⃪\n━━━━━━━━━━`
          : `〔⊘〕 يا....!! @${userName}\n◈ ↞ الخروج ممنوع〔!〕\n\n◆ تمت إعادة إضافتك مجدداً\n━━━━━━━━━\n◈ 𝗕⃪𝗹𝗮𝗰⃪𝗸 : 𝗠⃪𝗮⃪𝗵⃪𝗼𝗿𝗮⃪\n━━━━━━━━━━`,
        mentions: [{ tag: `@${userName}`, id: leftID }]
      });
    } catch (_) {
      // إذا فشلت الإضافة للمرة الأولى عند الإزالة → حاول مرة ثانية بعد 3 ثوانٍ
      if (wasRemoved) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          await api.addUserToGroup(leftID, threadID);
          await message.send({
            body: `〔⊘〕 @${userName}\n◆ تمت إعادة إضافتك بعد محاولتين\n━━━━━━━━━━`,
            mentions: [{ tag: `@${userName}`, id: leftID }]
          });
        } catch (_) {
          message.send("هه واقيل بلوكاني 🤙");
        }
      } else {
        message.send("هه واقيل بلوكاني 🤙");
      }
    }
  }
};
