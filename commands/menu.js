
const { getUserData } = require('../db');

async function handleMenuCommand(ctx) {
    
    userId = ctx.from.id;
    // Get user name and lang
    //const userName = ctx.update.message.from.first_name;
    const userLang = ctx.session.userLang || await getUserData(userId, 'lang') || ctx.from.language_code;
    //console.log('ctx.from:', ctx.from);

    const message = userLang === 'zh' ? 
        '你想做什麼？' : 
        'Choose an option:';
    const menuSettings = userLang === 'zh' ?
        '設定語系和時區 (/settings)' :
        'Update Language/Timezone (/settings)';
    const menuIntro = userLang === 'zh' ?
        '更新基本資料 (/intro)' :
        'Update My Info (/intro)';
    const menuDiary = userLang === 'zh' ?
        '生成今天的日記 (/diary)' :
        'Generate Today\'s Diary (/diary)';
    const menuReadDiary = userLang === 'zh' ?
        '看日記 (/read)' :
        'Read Diary (/read)';
    const menuTherapy = userLang === 'zh' ?
        '諮商/一般模式切換 (/therapy)' :
        'Therapy mode (/therapy)';

    // 提示用戶輸入自我介紹
    await ctx.reply(message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: menuDiary, callback_data: 'menuDiary' }],
                [{ text: menuReadDiary, callback_data: 'menuReadDiary' }],

                [{ text: menuSettings, callback_data: 'menuSettings' }],
                [{ text: menuIntro, callback_data: 'menuIntro' }],
                
                [{ text: menuTherapy, callback_data: 'menuTherapy' }]
            ],
        },
    });
}

module.exports = {
    handleMenuCommand
};