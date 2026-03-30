const axios = require("axios");

const signatureText = "◈  ⌯ ⟅𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ 𖥻 ❦៹ .˖ִ.◈";

const reportReasons = [
  { label: "إساءة",                   type: "harassment" },
  { label: "دعارة",                    type: "prostitution" },
  { label: "مواد تنطوي على غرر جنسي", type: "nudity_sexual_content" },
  { label: "تهديد",                   type: "violence_threats" },
  { label: "صور استغلال جنسي",        type: "child_sexual_exploitation" }
];

async function sendReport(api, targetID, reportType) {
  try {
    await api.httpPost("https://www.facebook.com/ajax/report/social.php", {
      target_fbid:        targetID,
      report_reason_type: reportType,
      source:             "messenger",
      suspect_uid:        targetID,
      "tags[0]":          "MESSENGER"
    });
  } catch (e) {}

  try {
    await api.httpPost("https://www.facebook.com/api/graphql/", {
      av:                       api.getCurrentUserID(),
      fb_api_caller_class:      "RelayModern",
      fb_api_req_friendly_name: "XReportingFlowSendReportMutation",
      variables: JSON.stringify({
        input: {
          client_mutation_id:  Math.random().toString(36).slice(2),
          reporter_id:         api.getCurrentUserID(),
          reported_user_id:    targetID,
          report_type:         reportType.toUpperCase(),
          report_flow_type:    "PROFILE",
          source:              "MESSENGER"
        }
      }),
      server_timestamps: "true",
      doc_id: "6936557049735963"
    });
  } catch (e) {}
}

module.exports = {
  config: {
    name: "بلغ",
    aliases: ["report", "blg"],
    version: "1.0",
    author: "BlackBot",
    role: 2,
    shortDescription: "تبليغ عن مستخدم",
    category: "owner",
    countDown: 5,
    guide: "{pn}"
  },

  onStart: async function ({ api, event, commandName, args }) {
    const { threadID, messageID, senderID } = event;

    let targetID;

    if (event.messageReply) {
      targetID = event.messageReply.senderID;
    } else if (args[0] && /^\d+$/.test(args[0])) {
      targetID = args[0];
    } else {
      return api.sendMessage(
        `${signatureText}\n━━━━━━━━━━\n〔!〕 ارد على رسالة شخص أو أضف الآيدي`,
        threadID, null, messageID
      );
    }

    const askMsg =
      `${signatureText}\n` +
      `━━━━━━━━━━\n` +
      ` 〖 كم عدد البلاغات؟ 〗`;

    api.sendMessage(askMsg, threadID, (err, info) => {
      if (!info) return;
      global.BlackBot.onReply.set(info.messageID, {
        commandName,
        messageID: info.messageID,
        author: senderID,
        targetID,
        delete: () => global.BlackBot.onReply.delete(info.messageID)
      });
    }, messageID);
  },

  onReply: async function ({ api, event, Reply }) {
    if (event.senderID !== Reply.author) return;
    Reply.delete();

    const { targetID } = Reply;
    const count = parseInt((event.body || "").trim());

    if (isNaN(count) || count < 1 || count > 200) {
      return api.sendMessage(
        `${signatureText}\n━━━━━━━━━━\n〔✗〕 أدخل عدداً بين 1 و 200`,
        event.threadID
      );
    }

    for (let i = 0; i < count; i++) {
      for (const reason of reportReasons) {
        await sendReport(api, targetID, reason.type);
      }
    }

    return api.sendMessage(
      `${signatureText}\n━━━━━━━━━━\n  〖 ✦ تم ✦ 〗`,
      event.threadID
    );
  }
};
