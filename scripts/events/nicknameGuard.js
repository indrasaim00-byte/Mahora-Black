const _restoring = new Set();

function getBotNick() {
  return global.BlackBot?.config?.nickNameBot || "𓆩⚝𓆪𝕭𝖑𝖆𝖈𝖐𓆩⚝𓆪";
}

module.exports = {
  config: {
    name: "nicknameGuard",
    version: "1.1",
    author: "BlackBot",
    category: "events"
  },

  onStart: async ({ event, api }) => {
    if (event.logMessageType !== "log:user-nickname") return;

    const botID = api.getCurrentUserID();
    const { participant_id, nickname } = event.logMessageData || {};

    if (participant_id !== botID) return;

    const { threadID } = event;
    const correctNick = getBotNick();

    // إذا كان التغيير جاء من أمر كنيتك نفسه (القيمة نفسها) لا تتدخل
    if (nickname === correctNick) return;

    const key = `${threadID}_${botID}`;
    if (_restoring.has(key)) return;
    _restoring.add(key);

    setTimeout(async () => {
      try {
        await api.changeNickname(correctNick, threadID, botID);
      } catch (_) {}
      _restoring.delete(key);
    }, 1000);
  }
};
