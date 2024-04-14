
const { getUserData } = require('../db');

async function handleSettingsCommand(ctx) {
    
    userId = ctx.from.id;
    // Get user name
    //const userName = ctx.update.message.from.first_name;

    // Ask the next qestion
    const userLang = ctx.session.userLang || await getUserData(userId, 'lang') || ctx.from.language_code;
    const userTimezone = ctx.session.userTimezone || await getUserData(userId, 'timezone') || '';
    console.log('userLang:', userLang);
    console.log('userTimezone:', userTimezone);

    // Initializing the interview
    ctx.session.answers = ctx.session.answers || {};
    ctx.session.answers.lang = ctx.session.answers.lang || '';
    ctx.session.answers.location = ctx.session.answers.location || '';
    ctx.session.answers.timezone = ctx.session.answers.timezone || '';

    const message = userLang === 'zh' ? 
                `目前設定\n
                 語系：中文\n
                 時區：${userTimezone}\n
                 \n 你要繼續用中文嗎？` : 
                `Current settings:\n
                 Language: English\n
                 Timezone: ${userTimezone}\n
                 \n Let's confirm language first:`;
    return ctx.reply(message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'English', callback_data: 'settingsLanguageEn' }],
                [{ text: '中文', callback_data: 'settingsLanguageZh' }],
                [{ text: 'Skip', callback_data: 'chat' }]
            ],
        },
    }); 

    

    // Change state
    //userSession.interviewState = 'none';
}

module.exports = {
    handleSettingsCommand
};