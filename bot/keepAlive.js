const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");

let pingTimer = null;
let saveTimer = null;
let inboxTimer = null;

function getRandomMs(minMinutes, maxMinutes) {
  const minMs = minMinutes * 60 * 1000;
  const maxMs = maxMinutes * 60 * 1000;
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

async function doPing() {
  try {
    const api = global.BlackBot.fcaApi;
    if (!api) return;

    const appState = api.getAppState();
    if (!appState || !appState.length) return;

    const cookieStr = appState.map(c => `${c.key}=${c.value}`).join("; ");
    const userAgent =
      global.BlackBot.config?.facebookAccount?.userAgent ||
      "Mozilla/5.0 (Linux; Android 12; M2102J20SG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.0.0 Mobile Safari/537.36";

    await axios.get("https://mbasic.facebook.com/", {
      headers: {
        cookie: cookieStr,
        "user-agent": userAgent,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      timeout: 15000,
    });

    global.utils.log.info("KEEP_ALIVE", "✅ Ping sent — account stays active");
  } catch (e) {
    global.utils.log.warn("KEEP_ALIVE", "⚠️ Ping failed: " + (e.message || e));
  }
}

async function doSaveCookies() {
  try {
    const api = global.BlackBot.fcaApi;
    if (!api) return;

    const appState = api.getAppState();
    if (!appState || !appState.length) return;

    const accountPath = path.join(process.cwd(), "account.txt");
    const current = await fs.readFile(accountPath, "utf-8").catch(() => "");
    const newData = JSON.stringify(appState, null, 2);

    if (current.trim() === newData.trim()) return;

    await fs.writeFile(accountPath, newData, "utf-8");
    global.utils.log.info("KEEP_ALIVE", "💾 Cookies saved to account.txt");
  } catch (e) {
    global.utils.log.warn("KEEP_ALIVE", "⚠️ Failed to save cookies: " + (e.message || e));
  }
}

function schedulePing() {
  if (pingTimer) clearTimeout(pingTimer);
  const delay = getRandomMs(8, 18);
  const minutes = Math.round(delay / 60000);
  pingTimer = setTimeout(async () => {
    await doPing();
    schedulePing();
  }, delay);
  global.utils.log.info("KEEP_ALIVE", `🔔 Next ping in ${minutes} min`);
}

function scheduleSave() {
  if (saveTimer) clearInterval(saveTimer);
  const interval = 6 * 60 * 60 * 1000;
  saveTimer = setInterval(async () => {
    await doSaveCookies();
  }, interval);
}

async function doAcceptInbox() {
  try {
    const api = global.BlackBot.fcaApi;
    if (!api) return;
    if (global.BlackBot.config.antiInbox === true) return;

    let accepted = 0;

    for (const folder of ["PENDING", "OTHER"]) {
      try {
        const threads = await api.getThreadList(50, null, [folder]);
        if (!threads || !threads.length) continue;
        for (const thread of threads) {
          if (!thread.isGroup) {
            try {
              await api.handleMessageRequest(thread.threadID, true);
              accepted++;
              await new Promise(r => setTimeout(r, 400));
            } catch (e) {}
          }
        }
      } catch (e) {}
    }

    if (accepted > 0)
      global.utils.log.info("INBOX", `✅ قبلت ${accepted} رسالة خاص معلقة`);
  } catch (e) {}
}

function scheduleInbox() {
  if (inboxTimer) clearInterval(inboxTimer);
  inboxTimer = setInterval(doAcceptInbox, 2 * 60 * 1000);
}

module.exports = function startKeepAlive() {
  if (pingTimer) clearTimeout(pingTimer);
  if (saveTimer) clearInterval(saveTimer);
  if (inboxTimer) clearInterval(inboxTimer);

  global.utils.log.info(
    "KEEP_ALIVE",
    "🚀 Keep-alive started | Ping every 8–18 min | Cookies saved every 6h"
  );

  schedulePing();
  scheduleSave();
  doAcceptInbox();
  scheduleInbox();
};

module.exports.stop = function () {
  if (pingTimer) clearTimeout(pingTimer);
  if (saveTimer) clearInterval(saveTimer);
  if (inboxTimer) clearInterval(inboxTimer);
  pingTimer = null;
  saveTimer = null;
  inboxTimer = null;
};
