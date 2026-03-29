module.exports = {
  config: {
    name: "autoAcceptInbox",
    version: "1.0",
    author: "BlackBot",
    description: "Auto accept private message requests so bot works in DMs",
    category: "events"
  },

  onStart: async ({ api, event }) => {
    if (global.BlackBot.config.antiInbox === true) return;

    const { threadID, senderID, isGroup } = event;

    if (isGroup === false || threadID == senderID) {
      try {
        await api.handleMessageRequest(threadID, true);
      } catch (e) {
      }
    }
  }
};
