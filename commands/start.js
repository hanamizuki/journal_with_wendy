
const { commandHandlers, getGreeting, shortenText, getInstructionsText } = require('../functions');
const { db, checkUserExists, addNewUser, getUserLang, storeUserData, getUserData, storeMessage, loadMessageBuffer, loadDiaryBuffer, storeAnswers, loadAnswers } = require('../db');


// startCommand.js
async function startCommand(ctx) {
    // 檢查 ctx.session 是否存在，如果不存在則初始化它
    ctx.session ??= {};

    // Get timezone and lang data from telegram, then get greeting
    const userId = ctx.from.id;
    const userName = ctx.from.first_name;

    // Confirm if it's a new user
    const userExist = await checkUserExists(userId);
    console.log('userExist:', userExist);
    if (!userExist) {
        const userJoinedTime = new Date(ctx.message.date * 1000); // 1698590674, it's a Unix Timestamp, need to *1000
        const userValue = {
            first_name: userName,
            last_name: ctx.from.last_name,
            lang: ctx.from.language_code,
            joined: userJoinedTime,
        };
        addNewUser(userId, userValue);
        console.log('userId: ', userId);
        console.log('userValue:', userValue);
    }

    // get user lang
    const userLangData = await getUserData(userId, 'lang');
    console.log('userLangData:', userLangData);
    const userLang = userLangData ? userLangData : ctx.from.language_code;
    ctx.session.userLang ??= userLang;

    const userTimezone = await getUserData(userId, 'timezone') || null;
    const greeting = getGreeting(userTimezone, userLang, userName);

    // Messages
    const message = userLang === 'zh' ? '你想先做什麼？' : 'How do you want to start?';
    const interviewText = userLang === 'zh' ? '接受訪談' : 'Answer quick qeustions';
    const chatText = userLang === 'zh' ? '直接聊' : 'Start Chatting';

    console.log('start session:', ctx.session);

    return ctx.reply(`${greeting} ${message}`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: interviewText, callback_data: 'startInterview' }],
                [{ text: chatText, callback_data: 'chat' }]
            ],
        },
    });
}

module.exports = startCommand;