const BOT_NICK = "𓆩⚝𓆪𝕭𝖑𝖆𝖈𝖐𓆩⚝𓆪";

const _restoring = new Set();

module.exports = {
  config: {
    name: "nicknameGuard",
    version: "1.0",
    author: "BlackBot",
    category: "events"
  },

  onStart: async ({ event, api }) => {
    if (event.logMessageType !== "log:user-nickname") return;

    const botID = api.getCurrentUserID();
    const { participant_id } = event.logMessageData || {};

    if (participant_id !== botID) return;

    const { threadID } = event;
    const key = `${threadID}_${botID}`;

    if (_restoring.has(key)) return;
    _restoring.add(key);

    setTimeout(async () => {
      try {
        await api.changeNickname(BOT_NICK, threadID, botID);
      } catch (_) {}
      _restoring.delete(key);
    }, 1000);
  }
};
