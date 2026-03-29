const { config } = global.BlackBot;

module.exports = {
	config: {
		name: "رسالة",
		aliases: ["dm", "msg"],
		version: "1.0",
		author: "BlackBot",
		countDown: 5,
		role: 2,
		description: {
			vi: "Gửi tin nhắn riêng cho người dùng",
			en: "Send a DM to a user via the bot",
			ar: "إرسال رسالة خاصة لشخص عبر البوت"
		},
		category: "admin",
		guide: {
			vi: "{pn} <uid> <nội dung>\n{pn} <nội dung> (reply tin nhắn)",
			en: "{pn} <uid> <message>\n{pn} <message> (reply to someone's message)",
			ar: "{pn} <ID> <النص>\nأو رد على رسالة شخص: {pn} <النص>"
		}
	},

	langs: {
		ar: {
			noPermission: "⛔ | هذا الأمر للأدمن فقط.",
			noInput: "⚠️ | استخدم:\n• رد على رسالة شخص + .رسالة <النص>\n• .رسالة <ID> <النص>",
			sending: "⏳ | جاري إرسال الرسالة...",
			sent: "✅ | تم إرسال الرسالة بنجاح إلى المستخدم %1",
			failed: "❌ | فشل إرسال الرسالة: %1",
			invalidID: "⚠️ | الـ ID غير صالح، يجب أن يكون رقم."
		}
	},

	onStart: async function ({ api, event, args, getLang }) {
		const adminIDs = config.adminBot || [];
		if (!adminIDs.includes(event.senderID)) {
			return api.sendMessage(getLang("noPermission"), event.threadID, event.messageID);
		}

		let targetID, messageText;

		if (event.messageReply) {
			targetID = event.messageReply.senderID;
			messageText = args.join(" ");
		} else {
			if (args.length < 2) {
				return api.sendMessage(getLang("noInput"), event.threadID, event.messageID);
			}
			targetID = args[0];
			messageText = args.slice(1).join(" ");
		}

		if (!targetID || !/^\d+$/.test(targetID)) {
			return api.sendMessage(getLang("invalidID"), event.threadID, event.messageID);
		}

		if (!messageText || !messageText.trim()) {
			return api.sendMessage(getLang("noInput"), event.threadID, event.messageID);
		}

		api.sendMessage(getLang("sending"), event.threadID, event.messageID);

		try {
			await new Promise((resolve, reject) => {
				api.sendMessage(messageText, targetID, (err) => {
					if (err) reject(err);
					else resolve();
				});
			});
			api.sendMessage(getLang("sent", targetID), event.threadID);
		} catch (err) {
			api.sendMessage(getLang("failed", err.message || String(err)), event.threadID);
		}
	}
};
