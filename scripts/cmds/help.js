const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const gifList = [
    "https://h.top4top.io/p_3677567ew0.gif",
    "https://i.top4top.io/p_3677xwclv0.gif",
    "https://c.top4top.io/p_3677nzt8x0.gif",
    "https://k.top4top.io/p_3677k5cja0.gif",
    "https://a.top4top.io/p_367702l2h0.gif",
    "https://d.top4top.io/p_35040rp6o1.gif",
    "https://c.top4top.io/p_3504s5fvl0.gif",
    "https://e.top4top.io/p_3504gtkev2.gif",
    "https://f.top4top.io/p_3504l88323.gif",
    "https://l.top4top.io/p_3504m44g20.gif",
    "https://c.top4top.io/p_350483grh3.gif",
    "https://b.top4top.io/p_35048r1i12.gif",
    "https://j.top4top.io/p_3504vu3gk0.gif"
];

let lastGifIndex = -1;
let gifCounter = 0;

function getNextGifIndex() {
    let idx = gifCounter % gifList.length;
    if (idx === lastGifIndex && gifList.length > 1) {
        gifCounter++;
        idx = gifCounter % gifList.length;
    }
    lastGifIndex = idx;
    gifCounter++;
    return idx;
}

async function getGifStream(idx) {
    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const gifPath = path.join(cacheDir, `menu_gif_${idx}.gif`);
    if (fs.existsSync(gifPath) && fs.statSync(gifPath).size > 0) {
        return fs.createReadStream(gifPath);
    }
    try {
        const res = await axios.get(gifList[idx], { responseType: "arraybuffer", timeout: 10000 });
        fs.writeFileSync(gifPath, Buffer.from(res.data));
        return fs.createReadStream(gifPath);
    } catch (e) {
        return null;
    }
}

function getCmdDescription(cmd) {
    return cmd.config.shortDescription
        || cmd.config.longDescription
        || cmd.config.description
        || "لا يوجد وصف";
}

function getCmdCategory(cmd) {
    return (cmd.config.category || cmd.config.commandCategory || "أخرى").toLowerCase();
}

function getCmdUsage(cmd, prefix) {
    const guide = cmd.config.guide || cmd.config.usages || "";
    return guide.replace(/\{pn\}/g, cmd.config.name).replace(/\{p\}/g, prefix) || cmd.config.name;
}

function getRoleText(role) {
    if (role === 0 || role === undefined) return "الجميع";
    if (role === 1) return "مسؤول المجموعة";
    return "مطور البوت";
}

module.exports = {
    config: {
        name: "الاوامر",
        aliases: ["menu", "commands", "help", "cmds", "اوامر", "أوامر", "الأوامر", "قائمة", "القائمة", "امر", "الامر", "الاومر", "الأومر", "hlep", "hepl", "helo", "mnu", "meun"],
        version: "2.0.0",
        author: "Saint",
        shortDescription: "اوامر البوت",
        longDescription: "عرض جميع اوامر البوت مع التفاصيل",
        category: "system",
        guide: "{pn} [اسم الامر]",
        role: 0,
        coolDown: 5
    },

    onReply: async function({ message, Reply, event, prefix }) {
        const commands = global.BlackBot.commands;
        let num = parseInt((event.body || "").split(" ")[0].trim());
        if (Reply.bonus) num -= Reply.bonus;
        let msg = "";
        let data = Reply.content;
        let check = false;

        if (isNaN(num)) {
            msg = "⚠️ رد على الرسالة برقم العنوان";
        } else if (num > data.length || num <= 0) {
            msg = "❌ الرقم الذي اخترته غير موجود بالقائمة";
        } else {
            const dataAfter = data[num - 1];

            if (Reply.type === "cmd_info") {
                const cmd = commands.get(dataAfter);
                if (!cmd) return message.reply("❌ الأمر غير موجود");
                const cfg = cmd.config;
                msg += `〖 ${(getCmdCategory(cmd)).toUpperCase()} 〗\n`;
                msg += `\n📌 اسم الأمر: ${dataAfter}`;
                msg += `\n📝 الوصف: ${getCmdDescription(cmd)}`;
                msg += `\n⚙️ الاستخدام: ${getCmdUsage(cmd, prefix)}`;
                msg += `\n⏱️ وقت الانتظار: ${cfg.coolDown || cfg.cooldowns || 5}s`;
                msg += `\n🔑 الصلاحية: ${getRoleText(cfg.role || cfg.hasPermssion)}`;
                msg += `\n✎﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏`;
                msg += `\n\n↞ تم تطويره بواسطة ⸙ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼`;
            } else {
                check = true;
                let count = 0;
                msg += `هذه جميع الاوامر في فئة 〔${dataAfter.group.toUpperCase()}〕\n`;
                dataAfter.cmds.forEach(item => {
                    const cmd = commands.get(item);
                    const desc = cmd ? getCmdDescription(cmd) : "لا يوجد وصف";
                    msg += `\n ${++count}↞ ${item}: ${desc}`;
                });
                msg += "\n\n╭──────╮\n        ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝕷𝗶⃪𝘀⃪t⃫   \n╰──────╯ رد على الرسالة برقم الامر لعرض تفاصيل الأمر وكيفية استخدامه";
            }
        }

        Reply.delete();

        const gifIdx = getNextGifIndex();
        const gifStream = await getGifStream(gifIdx);

        if (gifStream) await message.send({ attachment: [gifStream] });
        const info = await new Promise(resolve => message.reply({ body: msg }, (err, info) => resolve(info || null)));
        if (info && check) {
            global.BlackBot.onReply.set(info.messageID, {
                type: "cmd_info",
                commandName: module.exports.config.name,
                messageID: info.messageID,
                content: data[parseInt((event.body || "").split(" ")[0].trim()) - 1].cmds,
                delete: () => global.BlackBot.onReply.delete(info.messageID)
            });
        }
    },

    onStart: async function({ message, args, prefix, event }) {
        const commands = global.BlackBot.commands;
        const { threadID } = event;
        const itemsPerPage = 40;

        let group = [];
        let msg = "◈  ⌯ ⟅𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ 𖥻 ❦៹ .˖ִ.◈\n";

        for (const [, cmd] of commands) {
            const cat = getCmdCategory(cmd);
            const existing = group.find(item => item.group.toLowerCase() === cat);
            if (!existing) {
                group.push({ group: cat, cmds: [cmd.config.name] });
            } else {
                existing.cmds.push(cmd.config.name);
            }
        }

        const gifIdx = getNextGifIndex();
        const gifStreamPromise = getGifStream(gifIdx);

        if (args[0] && ["all", "الكل"].includes(args[0].trim())) {
            let all_commands = [];
            group.forEach(g => g.cmds.forEach(c => all_commands.push(c)));
            const page_num_total = Math.ceil(all_commands.length / itemsPerPage);
            let check = true;
            let page_num_input = 0;
            let bonus = 0;

            if (args[1]) {
                page_num_input = parseInt(args[1]);
                if (isNaN(page_num_input)) {
                    msg = "⚠️ اكتب رقم الصفحة بعد الكل";
                    check = false;
                } else if (page_num_input > page_num_total || page_num_input <= 0) {
                    msg = "❌ رقم الصفحة غير موجود";
                    check = false;
                }
            }

            if (check) {
                let index_start = page_num_input ? (page_num_input * itemsPerPage) - itemsPerPage : 0;
                bonus = index_start;
                let index_end = Math.min(index_start + itemsPerPage, all_commands.length);
                let commandsToShow = all_commands.slice(index_start, index_end);
                let i = index_start;
                commandsToShow.forEach(e => {
                    const cmd = commands.get(e);
                    const desc = cmd ? getCmdDescription(cmd) : "لا يوجد وصف";
                    msg += `\n「${++i}」↞〔${e}: ${desc}〕`;
                });
                msg += `\n\nالصفحة ${page_num_input || 1}/${page_num_total}`;
                msg += "\n╭──────\n       ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝕷𝗶⃪𝘀⃪t⃫   \n──────╯ رد على الرسالة برقم الامر لعرض تفاصيله";

                const gifStream = await gifStreamPromise;
                if (gifStream) await message.send({ attachment: [gifStream] });
                const info2 = await new Promise(resolve => message.reply({ body: msg }, (err, info) => resolve(info || null)));
                if (info2) {
                    global.BlackBot.onReply.set(info2.messageID, {
                        type: "cmd_info",
                        bonus: bonus,
                        commandName: module.exports.config.name,
                        messageID: info2.messageID,
                        content: commandsToShow,
                        delete: () => global.BlackBot.onReply.delete(info2.messageID)
                    });
                }
                return;
            }
        }

        if (args[0] && !["all", "الكل"].includes(args[0].trim())) {
            const cmdName = args[0].toLowerCase();
            const cmd = commands.get(cmdName)
                || [...commands.values()].find(c => c.config.aliases?.includes(cmdName));
            if (cmd) {
                const cfg = cmd.config;
                let infoMsg = `〖 ${getCmdCategory(cmd).toUpperCase()} 〗\n`;
                infoMsg += `\n📌 اسم الأمر: ${cfg.name}`;
                infoMsg += `\n🔀 الاختصارات: ${cfg.aliases?.join(", ") || "لا يوجد"}`;
                infoMsg += `\n📝 الوصف: ${getCmdDescription(cmd)}`;
                infoMsg += `\n⚙️ الاستخدام: ${getCmdUsage(cmd, prefix)}`;
                infoMsg += `\n⏱️ وقت الانتظار: ${cfg.coolDown || cfg.cooldowns || 5}s`;
                infoMsg += `\n🔑 الصلاحية: ${getRoleText(cfg.role || cfg.hasPermssion)}`;
                infoMsg += `\n✎﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏﹏`;
                infoMsg += `\n\n↞ 𝗕⃪𝗹⃪𝖆⃟𝗰⃪𝗸⃪ ˖՞𝗦⃪𝖆⃟𝗶⃪𝗻⃪𝘁⃪ ⪼`;
                return message.reply(infoMsg);
            }
        }

        const page_num_total = Math.ceil(group.length / itemsPerPage);
        let check = true;
        let page_num_input = 0;
        let bonus = 0;

        if (args[0] && !["all", "الكل"].includes(args[0].trim())) {
            page_num_input = parseInt(args[0]);
            if (isNaN(page_num_input)) {
                msg = "⚠️ رد على الرسالة برقم العنوان";
                check = false;
            } else if (page_num_input > page_num_total || page_num_input <= 0) {
                msg = "❌ الرقم الذي اخترته غير موجود بالقائمة";
                check = false;
            }
        }

        if (check) {
            let index_start = page_num_input ? (page_num_input * itemsPerPage) - itemsPerPage : 0;
            bonus = index_start;
            let index_end = Math.min(index_start + itemsPerPage, group.length);
            let groupsToShow = group.slice(index_start, index_end);
            let i = index_start;
            groupsToShow.forEach(g => {
                msg += `\n「${++i}」↞〔${g.group.toUpperCase()} — ${g.cmds.length}〕`;
            });
            msg += `\n\nالصفحة【${page_num_input || 1}/${page_num_total}】`;
            msg += `\n╭──────\n        ⌯ 𝕭⃟𝗹⃪𝗮⃪𝗰⃪𝐤̰ 𝕷𝗶⃪𝘀⃪t⃫   \n──────╯       اخـتـر الـقائـمـة`;

            const gifStream = await gifStreamPromise;
            if (gifStream) await message.send({ attachment: [gifStream] });
            const info3 = await new Promise(resolve => message.reply({ body: msg }, (err, info) => resolve(info || null)));
            if (info3) {
                global.BlackBot.onReply.set(info3.messageID, {
                    commandName: module.exports.config.name,
                    bonus: bonus,
                    messageID: info3.messageID,
                    content: groupsToShow,
                    delete: () => global.BlackBot.onReply.delete(info3.messageID)
                });
            }
        }
    }
};
