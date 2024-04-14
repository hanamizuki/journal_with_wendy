
const { getUserLang } = require('../db');

async function handleStopCommand(ctx) {
    
    // Get user name
    const userId = ctx.from.id;
    const userName = ctx.update.message.from.first_name;

    // Ask the next qestion
    const userLang = await getUserLang(userId);
    //console.log(userLang);

    const message = userLang === 'zh' ? 
        `ok ${userName} 那你想聊些啥？`: 
        `yeah ok ${userName}! let's chat! What's on your mind?`;


    // Send message
    await ctx.reply(message);

    // Change state
    userSession.interviewState = 'none';
}

module.exports = {
    handleStopCommand
};