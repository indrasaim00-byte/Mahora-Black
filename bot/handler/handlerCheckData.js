const { db, utils, BlackBot } = global;
const { config } = BlackBot;
const { log, getText } = utils;
const { creatingThreadData, creatingUserData } = global.client.database;

function getThreadSet() {
        if (!global.db._threadIDSet) {
                global.db._threadIDSet = new Set(global.db.allThreadData.map(t => String(t.threadID)));
        }
        return global.db._threadIDSet;
}

function getUserSet() {
        if (!global.db._userIDSet) {
                global.db._userIDSet = new Set(global.db.allUserData.map(u => String(u.userID)));
        }
        return global.db._userIDSet;
}

module.exports = async function (usersData, threadsData, event) {
        const { threadID } = event;
        const senderID = event.senderID || event.author || event.userID;

        // ———————————— CHECK THREAD DATA ———————————— //
        if (threadID) {
                try {
                        if (global.temp.createThreadDataError.includes(threadID))
                                return;

                        const threadSet = getThreadSet();
                        if (threadSet.has(String(threadID)))
                                return;

                        const findInCreatingThreadData = creatingThreadData.find(t => t.threadID == threadID);
                        if (!findInCreatingThreadData) {
                                const threadData = await threadsData.create(threadID);
                                threadSet.add(String(threadID));
                                log.info("DATABASE", `New Thread: ${threadID} | ${threadData.threadName} | ${config.database.type}`);
                        }
                        else {
                                await findInCreatingThreadData.promise;
                                threadSet.add(String(threadID));
                        }
                }
                catch (err) {
                        if (err.name != "DATA_ALREADY_EXISTS") {
                                global.temp.createThreadDataError.push(threadID);
                                log.err("DATABASE", getText("handlerCheckData", "cantCreateThread", threadID), err);
                        } else {
                                getThreadSet().add(String(threadID));
                        }
                }
        }


        // ————————————— CHECK USER DATA ————————————— //
        if (senderID) {
                try {
                        const userSet = getUserSet();
                        if (userSet.has(String(senderID)))
                                return;

                        const findInCreatingUserData = creatingUserData.find(u => u.userID == senderID);
                        if (!findInCreatingUserData) {
                                const userData = await usersData.create(senderID);
                                userSet.add(String(senderID));
                                log.info("DATABASE", `New User: ${senderID} | ${userData.name} | ${config.database.type}`);
                        }
                        else {
                                await findInCreatingUserData.promise;
                                userSet.add(String(senderID));
                        }
                }
                catch (err) {
                        if (err.name != "DATA_ALREADY_EXISTS")
                                log.err("DATABASE", getText("handlerCheckData", "cantCreateUser", senderID), err);
                        else
                                getUserSet().add(String(senderID));
                }
        }
};
