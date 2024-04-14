
const { getUserData } = require('../db');

async function handleIntroCommand(ctx) {

    const userId = ctx.from.id;
    const userLang = ctx.session.userLang || await getUserData(userId, 'lang') || ctx.from.language_code;

    const message = userLang === 'zh' ? 
        '接下來有更多問題，你可以隨時打 /stop 停止。' : 
        'There are 6 more questions, you can stop with /stop.';
    const moreQuestionText = userLang === 'zh' ?
        '問吧' :
        'Ask away!';
    const notNowText = userLang === 'zh' ?
        '先不要' :
        'Not now';

    // 提示用戶輸入自我介紹
    await ctx.reply(message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: moreQuestionText, callback_data: 'moreQuestions' }],
                [{ text: notNowText, callback_data: 'chat' }]
            ],
        },
    });

    // 設置用戶的狀態為正在輸入自我介紹
    ctx.session.interviewState = 'intro';
}

module.exports = {
    handleIntroCommand
};