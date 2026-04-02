const deltaNext = global.BlackBot.configCommands.envCommands.rank.deltaNext;
const expToLevel = exp => Math.floor((1 + Math.sqrt(1 + 8 * exp / deltaNext)) / 2);
const { drive } = global.utils;

module.exports = {
        config: {
                name: "ترقية",
    aliases: ["rankup"],
                version: "1.4",
                author: "Saint",
                countDown: 5,
                role: 0,
                description: {
                        vi: "Bật/tắt thông báo level up",
                        en: "Turn on/off level up notification"
                },
                category: "rank",
                guide: {
                        en: "{pn} [on | off]"
                },
                envConfig: {
                        deltaNext: 5
                }
        },

        langs: {
                vi: {
                        syntaxError: "Sai cú pháp, chỉ có thể dùng {pn} on hoặc {pn} off",
                        turnedOn: "Đã bật thông báo level up",
                        turnedOff: "Đã tắt thông báo level up",
                        notiMessage: "🎉🎉 chúc mừng bạn đạt level %1"
                },
                en: {
                        syntaxError: "Syntax error, only use {pn} on or {pn} off",
                        turnedOn: "Turned on level up notification",
                        turnedOff: "Turned off level up notification",
                        notiMessage: "🎉🎉 Congratulations on reaching level %1"
                }
        },

        onStart: async function ({ message, event, threadsData, args, getLang }) {
                if (!["on", "off"].includes(args[0]))
                        return message.reply(getLang("syntaxError"));
                const val = args[0] == "on";
                await threadsData.set(event.threadID, val, "settings.sendRankupMessage");
                if (global._rankupSettingsCache) global._rankupSettingsCache.set(event.threadID, val);
                return message.reply(val ? getLang("turnedOn") : getLang("turnedOff"));
        },

        onChat: async function ({ threadsData, usersData, event, message, getLang }) {
                if (!global._rankupSettingsCache) global._rankupSettingsCache = new Map();
                const cache = global._rankupSettingsCache;
                let sendRankupMessage = cache.get(event.threadID);
                if (sendRankupMessage === undefined) {
                        try {
                                const threadData = await threadsData.get(event.threadID);
                                sendRankupMessage = !!threadData.settings.sendRankupMessage;
                                cache.set(event.threadID, sendRankupMessage);
                        } catch { return; }
                }
                if (!sendRankupMessage)
                        return;

                let { exp } = await usersData.get(event.senderID);
                const pending = global._rankExpBuffer?.get(event.senderID)?.pending || 0;
                exp += pending;
                const currentLevel = expToLevel(exp);
                if (currentLevel > expToLevel(exp - 1)) {
                        let customMessage = await threadsData.get(event.threadID, "data.rankup.message");
                        let isTag = false;
                        let userData;
                        const formMessage = {};

                        if (customMessage) {
                                userData = await usersData.get(event.senderID);
                                customMessage = customMessage
                                        // .replace(/{userName}/g, userData.name)
                                        .replace(/{oldRank}/g, currentLevel - 1)
                                        .replace(/{currentRank}/g, currentLevel);
                                if (customMessage.includes("{userNameTag}")) {
                                        isTag = true;
                                        customMessage = customMessage.replace(/{userNameTag}/g, `@${userData.name}`);
                                }
                                else {
                                        customMessage = customMessage.replace(/{userName}/g, userData.name);
                                }

                                formMessage.body = customMessage;
                        }
                        else {
                                formMessage.body = getLang("notiMessage", currentLevel);
                        }

                        if (threadData.data.rankup?.attachments?.length > 0) {
                                const files = threadData.data.rankup.attachments;
                                const attachments = files.reduce((acc, file) => {
                                        acc.push(drive.getFile(file, "stream"));
                                        return acc;
                                }, []);
                                formMessage.attachment = (await Promise.allSettled(attachments))
                                        .filter(({ status }) => status == "fulfilled")
                                        .map(({ value }) => value);
                        }

                        if (isTag) {
                                formMessage.mentions = [{
                                        tag: `@${userData.name}`,
                                        id: event.senderID
                                }];
                        }

                        message.reply(formMessage);
                }
        }
};
