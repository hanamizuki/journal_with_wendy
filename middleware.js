
// middleware.js
const { bot, session, openai, base, shortenedWithOpenAI, getIANATimezone, getFormattedDate } = require('./api');
const { db, checkUserExists, addNewUser, getUserLang, storeUserData, getUserData, storeMessage, loadMessageBuffer, loadDiaryBuffer, storeAnswers, loadAnswers } = require('./db');
const { getGreeting, shortenText, getInstructionsText } = require('./functions');

/*
 * The middleware
 * all messages come through here then bot.on
 */
//let timeoutId = null; // 用於保存定時器ID

async function middleware(ctx, next) {

    // Detect memory usage
    // 這段程式碼會輸出當前的記憶體使用情況。rss 是進程的常駐集大小，heapTotal 是 V8 的總記憶體使用量，heapUsed 是 V8 當前使用的記憶體量。
    //const memoryUsage = process.memoryUsage();
    //console.log(`RSS: ${memoryUsage.rss}, Heap Total: ${memoryUsage.heapTotal}, Heap Used: ${memoryUsage.heapUsed}`);

    // 檢查 ctx.session 是否存在，如果不存在則初始化它
    ctx.session ??= {};

    console.log('===============================================================');
    console.log('beginning of middleware ctx.session.status:', ctx.session.status);

    const userId = ctx.from.id;

    // Schedule diary
    // const { scheduleDiary } = require('./functions');
    // await scheduleDiary(ctx);

    //console.log('ctx.session.interviewState 1:', ctx.session.interviewState);
    if (ctx.message && !ctx.message.text.startsWith('/') && !ctx.session.interviewState && ctx.session.interviewState !== 'none') {
        ctx.session.interviewState = 'none';
    }

    // Save user info to ctx.session
    ctx.session.userTimezone ??= await getUserData(userId, 'timezone') || '';
    const userTimezone = ctx.session.userTimezone;
    //console.log('middleware before ifs ctx.session.status:', ctx.session.status);
    //console.log('middleware before ifs getUserData timezone', await getUserData(userId, 'timezone'));

    // 使用 ctx.session 來儲存和讀取使用者狀態
    if (ctx.message && (ctx.message.text === '/diary' || ctx.message.text === '/ytd') && ctx.session.status !== 'generatingDiary') {
        // 設定狀態為 generatingDiary
        await ctx.reply(`等一下喔，這要一點時間，我寫好傳給你。`);
        ctx.session.status = 'generatingDiary';
        //console.log('end of diary middleware:', ctx.session);
    } else if (ctx.message &&
              !ctx.message.text.startsWith('/') && 
              (ctx.session.interviewState === 'none' || ctx.session.therapy === 'on') && 
              ctx.session.status !== 'generatingDiary' &&
              ctx.session.status !== 'messageProcessing' &&
              ctx.message !== 'Harry?' && ctx.message !== 'Branden?' && ctx.message !== 'Wendy?') {

        console.log('middleware ctx.message:', ctx.message.text);

        // Set status to messageProcessing
        ctx.session.status = 'messageProcessing';
        
        // Get user and local time info
        const userInput = ctx.message.text;
        const userInputDate = new Date(ctx.message.date * 1000); // 1698590674, it's a Unix Timestamp, need to *1000
        let userInputLocalTime;
        if (ctx.session.userTimezone) {
            userInputLocalTime = getFormattedDate(userInputDate, ctx.session.userTimezone);
        }
        console.log('userInputLocalTime', userInputLocalTime);

        // Get user data for gpt
        const userName = ctx.from.first_name;
        ctx.session.userLang ??= await getUserLang(userId);
        const userLang = ctx.session.userLang;

        // Get content for gpt
        ctx.session.therapy ??= await getUserData(userId, 'therapy');
        ctx.session.therapist ??= await getUserData(userId, 'therapist');

        const instructionsText = await getInstructionsText(ctx.session.therapy, ctx.session.therapist);
        console.log('middleware therapy:', ctx.session.therapy);
        console.log('middleware therapist:', ctx.session.therapist);
        const answerBuffer = await loadAnswers(userId);
        const answersContent = Object.entries(answerBuffer).map(([key, value]) => `  ${key}: ${value}`).join('\n');

        // Handle the content we are sending to openai 
        let diaryBuffer;
        if (ctx.session.therapy === 'on') {
            ctx.session.messageBuffer ??= await loadMessageBuffer(userId, 50);
            diaryBuffer = await loadDiaryBuffer(userId, 7);
            let DiaryContent = diaryBuffer.reduce((accumulator, currentEntry) => {
                return accumulator + "\n===\n" + currentEntry.content;
            }, "");
            ctx.session.systemMessage =
                `${instructionsText}\n我的名字是${userName}，關於我的其他事情：\n${answersContent}\n\n` +
                (userLang === 'zh' ? '請用台灣的繁體中文回應我。\n' : '請用跟我一樣的語言回應我。') +
                `以下是我最近的日記給你參考。若我有提到相關內容，或是問你日記內容，你可以根據日記回答。否則不需要刻意提起。\n${DiaryContent}`;
                ;
        } else {
            ctx.session.messageBuffer ??= await loadMessageBuffer(userId, 100);
            diaryBuffer = await loadDiaryBuffer(userId, 3);
            let DiaryContent = diaryBuffer.reduce((accumulator, currentEntry) => {
                return accumulator + "\n===\n" + currentEntry.content;
            }, "");
            ctx.session.systemMessage =
                `${instructionsText}\n我的名字是${userName}，關於我的其他事情：\n${answersContent}\n\n` +
                (userLang === 'zh' ? '請用台灣的繁體中文回應我。\n' : '請用跟我一樣的語言回應我。') +
                (userTimezone ? `現在我的時間是${userInputLocalTime}，我每則訊息後面都會有 "(sent:...)"，這是傳訊的時間，如果我好幾個小時沒有傳訊了，可以根據日期、時間問候我。但不要過度。\n` : '') +
                `請不要說出類似「如果需要支持或者想分享，在這裡隨時歡迎」或「隨時歡迎回來找我」或是「如果需要討論XXX話題，在此我都願意聽取哦！」的話，這太客套了，我會很不舒服。如果你之前這樣說了，之後不要這樣說就好。` + 
                `請不要在訊息前面加上 (Branden) 或是其他名字。` + 
                `以下是我最近的日記給你參考。若我有提到相關內容，或是問你日記內容，你可以根據日記回答。否則不需要刻意提起。\n${DiaryContent}`;
        }
        
        // Append the last message to messageBuffer
        ctx.session.messageBuffer.push({
            role: 'user',
            content: ctx.session.userTimezone ?
                `${userInput} (sent: ${userInputLocalTime})` :
                userInput
        });
        //console.log('message middleware ctx.session:', ctx.session);

        // Save to db
        const shortenedUserInput = await shortenText(userInput);
        //await storeMessage(userId, userInputDate, userInputLocalTime, 'system', ctx.session.systemMessage, '', false);
        await storeMessage(userId, userInputDate, userInputLocalTime, 'user', userInput, shortenedUserInput, ctx.session.systemMessage);

    } else if (ctx.session.status === 'messageProcessing') {
        //console.log('message processing ctx.update:', ctx.update);
        //ctx.session.messageBuffer ??= await loadMessageBuffer(userId);
        console.log('middleware ctx.message:', ctx.message.text);
        console.log('message processing ctx.session.status:', ctx.session.status);

        //ctx.session.status = 'messageProcessingPending';

        // Get user and local time info
        const userInput = ctx.message.text;
        const userInputDate = new Date(ctx.message.date * 1000); // 1698590674, it's a Unix Timestamp, need to *1000
        let userInputLocalTime;
        if (ctx.session.userTimezone) {
            userInputLocalTime = getFormattedDate(userInputDate, ctx.session.userTimezone);
        }
        // Append the last message to messageBuffer
        if (ctx.session.messageBuffer) {
            ctx.session.messageBuffer.push({
                role: 'user',
                content: ctx.session.userTimezone ?
                    `${userInput} (sent: ${userInputLocalTime})` :
                    userInput
            });
        }

        // 計算有幾個尚未回覆的訊息
        ctx.session.unansweredMessages ??= 0;
        ctx.session.unansweredMessages += 1; // 每次調用函數時增加計數器的值
        console.log('ctx.session.unansweredMessages count:', ctx.session.unansweredMessages);

        //console.log('now in message processing messageBuffer:', ctx.session.messageBuffer);

        // Save to db
        const shortenedUserInput = await shortenText(userInput);
        //await storeMessage(userId, userInputDate, userInputLocalTime, 'system', ctx.session.systemMessage, '', false);
        await storeMessage(userId, userInputDate, userInputLocalTime, 'user', userInput, shortenedUserInput, ctx.session.systemMessage);

        return;  // 結束這個中間件，不會繼續執行後面的程式
    } else if (ctx.session.status === 'generatingDiary') {
        await ctx.reply('日記生成中，先不要急！');
        console.log('generatingDiary session.status: ', ctx.session.status);
        return;  // 結束這個中間件，不會繼續執行後面的程式

    }
    console.log('end of middleware ctx.session:', ctx.session.status);
    next().then(r => '');  // 繼續執行後面的中間件或指令處理程式
}

module.exports = middleware;
