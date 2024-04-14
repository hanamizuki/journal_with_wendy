
const { getUserData, storeUserData } = require('../db');

async function handleTherapyCommand(ctx) {
    
    userId = ctx.from.id;
    //const userLang = await getUserLang(userId);
    const userLang = ctx.session.userLang || await getUserData(userId, 'lang') || ctx.from.language_code;
    let message;
    let menuYes;
    let menuNo;

    const therapyOn = ctx.session.therapy || await getUserData(userId, 'therapy') || 'off';
    const therapist = ctx.session.therapist || await getUserData(userId, 'therapist') || 'Wendy';
    console.log('handleTherapyCommand ctx.session:', ctx.session);

    if (therapyOn === 'on') {
        message = userLang === 'zh' ? 
        `你正在和 ${therapist} 諮商，你要結束嗎？` : 
        `You are talking to ${therapist}. Do you want to exit therapy mode?`;
        menuChat = userLang === 'zh' ?
            '我想繼續' :
            'Stay';
        menuEnd = userLang === 'zh' ?
            '先結束吧' :
            'Ok end it';
        menuTherapist = userLang === 'zh' ?
            '看諮商師名單' :
            'See therapist list';

        // 提示用戶輸入自我介紹
        await ctx.reply(message, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: menuChat, callback_data: 'therapyContinue' }],
                    [{ text: menuEnd, callback_data: 'therapyOff' }],
                    [{ text: menuTherapist, callback_data: 'therapyTherapist' }]
                ],
            },
        });

    } else {
        message = userLang === 'zh' ? 
        '你要進入諮商模式嗎？我會開始針對你說的話問很多問題' : 
        'Do you want to enable therapy mode? I will be asking lot of questions.';
        menuYes = userLang === 'zh' ?
            '好' :
            'Yes';
        menuNo = userLang === 'zh' ?
            '不要' :
            'No';
        // 提示用戶輸入自我介紹
        await ctx.reply(message, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: menuYes, callback_data: 'therapyOn' }],
                    [{ text: menuNo, callback_data: 'therapyOff' }]
                ],
            },
        });
    } 
}
async function callTherapist(ctx, therapistName) {
    const userId = ctx.from.id;

    // 設定 therapist 和 therapy 狀態
    ctx.session.therapist = therapistName;
    ctx.session.therapy = 'on';
    await storeUserData(userId, 'therapy', 'on');
    await storeUserData(userId, 'therapist', therapistName);

    // 回應使用者
    await ctx.reply(`Hey 我是 ${therapistName}，想聊聊什麼嗎？`);
    ctx.session.messageBuffer.push({
        role: 'assistant',
        content: `Hey 我是 ${therapistName}，想聊聊什麼嗎？（目前已開啟諮商模式，我會隨機在訊息後面加上「(目前為諮商模式，你可以用 /therapy 指令關閉)」的提示。）`
    });

    // Set the process done so we can take the next request
    ctx.session.status = 'messageProcessingDone';
}

module.exports = {
    handleTherapyCommand,
    callTherapist
};