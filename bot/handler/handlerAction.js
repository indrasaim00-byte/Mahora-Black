const createFuncMessage = global.utils.message;
const handlerCheckDB = require("./handlerCheckData.js");

// Rate limiter: track message count per thread per second window
const _threadMsgCount = new Map();
const _FLOOD_THRESHOLD = 8;

function isThreadFlooding(threadID) {
  const now = Math.floor(Date.now() / 1000);
  const key = `${threadID}:${now}`;
  const count = (_threadMsgCount.get(key) || 0) + 1;
  _threadMsgCount.set(key, count);
  // Clean old entries every 1000 calls
  if (_threadMsgCount.size > 200) {
    for (const [k] of _threadMsgCount) {
      if (!k.endsWith(`:${now}`) && !k.endsWith(`:${now - 1}`))
        _threadMsgCount.delete(k);
    }
  }
  return count > _FLOOD_THRESHOLD;
}

module.exports = (
  api,
  threadModel,
  userModel,
  dashBoardModel,
  globalModel,
  usersData,
  threadsData,
  dashBoardData,
  globalData
) => {
  const handlerEvents = require(
    process.env.NODE_ENV == "development"
      ? "./handlerEvents.dev.js"
      : "./handlerEvents.js"
  )(
    api,
    threadModel,
    userModel,
    dashBoardModel,
    globalModel,
    usersData,
    threadsData,
    dashBoardData,
    globalData
  );

  return async function (event) {
    // ✅ Anti-Inbox Protection
    if (
      global.BlackBot.config.antiInbox == true &&
      (event.senderID == event.threadID ||
        event.userID == event.senderID ||
        event.isGroup == false) &&
      (event.senderID || event.userID || event.isGroup == false)
    )
      return;

    const isMessage = event.type === "message" || event.type === "message_reply";

    if (isMessage) {
      const prefix = (global.utils.getPrefix && global.utils.getPrefix(event.threadID)) || global.BlackBot?.config?.prefix || ".";
      const body = (event.body || "").trim();
      const isCommand = body.startsWith(prefix);
      const isAiTrigger = body.startsWith("بلاك");
      const hasOnReply = event.messageReply && global.BlackBot.onReply.has(event.messageReply.messageID);
      const isAdminDM = !event.isGroup && (global.BlackBot.config.adminBot || []).includes(event.senderID);

      if (!isCommand && !isAiTrigger && !hasOnReply && !isAdminDM) {
        return;
      }
    }

    if (event.type === "typ" || event.type === "presence" || event.type === "read_receipt") {
      return;
    }

    const message = createFuncMessage(api, event);
    await handlerCheckDB(usersData, threadsData, event);

    const handlerChat = await handlerEvents(event, message);
    if (!handlerChat) return;

    const {
      onAnyEvent,
      onFirstChat,
      onStart,
      onChat,
      onReply,
      onEvent,
      handlerEvent,
      onReaction,
      typ,
      presence,
      read_receipt
    } = handlerChat;

    switch (event.type) {
      case "message":
      case "message_reply":
      case "message_unsend":
        onStart();
        onChat();
        onReply();
        break;

      case "event":
        handlerEvent();
        onEvent();
        break;

      case "message_reaction":
        onReaction();

        try {
          const cfg = global.BlackBot.config.reactUnsend || {};
          const adminIDs = global.BlackBot.config.adminBot || [];
          const isAdmin = adminIDs.includes(event.userID || event.senderID);

          if (
            cfg.enable &&
            cfg.emojis?.includes(event.reaction) &&
            (!cfg.onlyAdmin || isAdmin)
          ) {
            await api.unsendMessage(event.messageID);
          }
        } catch (err) {
          console.error("❌ React-Unsend Error:", err);
        }

        break;

      default:
        break;
    }
  };
};
