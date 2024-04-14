const { bot, session, openai, base, shortenedWithOpenAI, getIANATimezone, getFormattedDate } = require('./api');
const { db, checkUserExists, addNewUser, getUserLang, storeUserData, getUserData, storeMessage, loadMessageBuffer, loadDiaryBuffer, storeAnswers, loadAnswers } = require('./db');
const { getGreeting, shortenText, getInstructionsText, estimateTokens } = require('./functions');
const { getRespond } = require('./services/tiktoken');


// Connect DB
db.connect();

// // Register session middleware
bot.use(session());

/*
 * The middleware
 * all messages come through here then bot.on
 */
// bot.js
const middleware = require('./middleware');
bot.use(middleware);
/*
 * The /start command, also the onboarding process
 * Say hi to the user and let the user choose next step.
 */
const startCommand = require('./commands/start');
bot.start(startCommand);

/*
 * All the other commands
 * see more in /commands folder
 */
const commandHandlers = {
    'intro': require('./commands/intro').handleIntroCommand,
    'diary': require('./commands/diary').handleDiaryCommand,
    'ytd': require('./commands/diary').handleYesterdayDiaryCommand,
    'read': require('./commands/diary').handleReadDiaryCommand,
    'stop': require('./commands/stop').handleStopCommand,
    'settings': require('./commands/settings').handleSettingsCommand,
    'menu': require('./commands/menu').handleMenuCommand,
    'therapy': require('./commands/therapy').handleTherapyCommand,
    'ask': require('./commands/ask').handleAskCommand
    // ...
};
Object.keys(commandHandlers).forEach(command => {
    bot.command(command, commandHandlers[command]);
});


/*
* Test
* 
*/
bot.command('test', async (ctx) => {
    // const userId = ctx.from.id;
    // console.log('test beginning:', ctx.message.text);
    
    // // 測試函式
    // // const { extractUserRelationship } = require('./functions');
    // // const test = await extractUserRelationship(userId, "我養了一隻貓叫小王子，他是一隻豹貓")
    
    // const { scheduleDiary } = require('./functions');
    // await scheduleDiary(ctx);

    // bot.telegram.sendMessage(userId, "okok");
    
});

/*
* Therapists
* 
*/
const callTherapist = require('./commands/therapy').callTherapist;
bot.hears('Harry?', (ctx) => callTherapist(ctx, 'Harry'));
bot.hears('Branden?', (ctx) => callTherapist(ctx, 'Branden'));
bot.hears('Wendy?', async (ctx) => {
    const userId = ctx.from.id;
    ctx.session.therapist = 'wendy';
    await storeUserData(userId, 'therapist', 'wendy');
    await ctx.reply('Hi 我回來了，我們繼續聊吧！');
});

/*
 * The main action
 * to receive and send messages
 */
// Handle received messages
bot.on('text', async (ctx) => {

    const userId = ctx.from.id;
    const userInput = ctx.message.text;

    // Catch user input and time
    const userLang = await getUserLang(userId);
    const userName = ctx.from.first_name;
    const userInputDate = new Date(ctx.message.date * 1000);
    const userTimezone = ctx.session.userTimezone || await getUserData(userId, 'timezone');
    
    let userInputLocalTime;
    if (userTimezone) {
        userInputLocalTime = getFormattedDate(userInputDate, userTimezone);
    }

    /*
    * Interview Questions
    * When user accept the interview at /start
    */
    if (ctx.session.interviewState === 'location') {
        // Handle the answer from location to timezone
        const userTimezoneIANA = await getIANATimezone(ctx.message.text);
        //console.log(`bot on userTimezoneInput: ${userTimezoneInput}`); // Asia/Taipei
        console.log(`bot on userTimezoneIANA: ${userTimezoneIANA}`);
        if (userTimezoneIANA === null) {
            // 如果 IANA 時區代碼無效，要求使用者重新輸入
            let message = userLang === 'zh' ? 
                '呃...這是哪？再說一次嘛？我需想知道你的城市，才知道你的時區和氣候，這樣我跟你更好聊。' : 
                'Uh...no idea what this is, tell me again so I can feel you more.';
            await ctx.reply(message);
        } else {
            // Store the answer to the session
            ctx.session.userTimezone = userTimezoneIANA;
            console.log('ctx.session.userTimezone:', ctx.session.userTimezone)

            // Save to db
            ctx.session.answers.location = ctx.message.text;
            await storeAnswers(userId, ctx.session.answers, 'location');
            ctx.session.answers.timezone = userTimezoneIANA;
            await storeAnswers(userId, ctx.session.answers, 'timezone');
            console.log('Location ctx.message.text:', ctx.message.text);
            console.log('Location userTimezoneIANA:', userTimezoneIANA);
            console.log('Location ctx.session.answers.timezone:', ctx.session.answers.timezone);
            console.log('Location userId:', userId);
            console.log('Location session.answers:', ctx.session.answers);
            // Ask the next question
            let greeting = getGreeting(userTimezoneIANA, ctx.session.answers.lang, userName);
            let message = userLang === 'zh'?
                `好，我把你時區設在「${userTimezoneIANA}」了。${greeting}！來繼續聊天吧！` :
                `I've set timezone in ${userTimezoneIANA}. ${greeting}. Let's chat! Now, what's on your mind?`;
            await ctx.reply(message);
            ctx.session.interviewState = 'none';
        }

        
    /*
    * More questions from /intro
    * More questions
    */
    } else if (ctx.session.interviewState === 'askingGender') {
        // Store the answer to the session
        ctx.session.answers.gender = ctx.message.text;
        await storeAnswers(userId, ctx.session.answers, 'gender');

        // Ask the next question: Age
        const message = userLang === 'zh' ? '你今年幾歲？' : 'How old are you?';
        await ctx.reply(message);
        ctx.session.interviewState = 'askingAge';
        
    } else if (ctx.session.interviewState === 'askingAge') {
        // Store the answer to the session
        const currentYear = new Date().getFullYear(); // 將年齡轉換為出生年份
        const birthYear = currentYear - parseInt(ctx.message.text);
        ctx.session.answers.age = ctx.message.text;
        ctx.session.answers.birthYear = birthYear;
        await storeAnswers(userId, ctx.session.answers, 'age');
        
        // Ask the next qestion: Company
        const message = userLang === 'zh'? '你在哪家公司工作？' : 'What\'s your company name?';
        await ctx.reply(message);
        ctx.session.interviewState = 'askingCompany';
        
    } else if (ctx.session.interviewState === 'askingCompany') {
        // Store the answer to the session
        ctx.session.answers.company = ctx.message.text;
        await storeAnswers(userId, ctx.session.answers, 'company');

        // Ask the next qestion: Position
        const message = userLang === 'zh' ? '你在公司是什麼職位呢？' : 'What\'s your position in the company?';
        await ctx.reply(message);
        ctx.session.interviewState = 'askingPosition';
        
    } else if (ctx.session.interviewState === 'askingPosition') {  // 如果用戶正在輸入自我介紹
        // Store the answer to the session
        ctx.session.answers.position = ctx.message.text;
        await storeAnswers(userId, ctx.session.answers, 'position');

        // Ask the next qestion: Income
        const message = userLang === 'zh' ? '請問你收入多少？你也可以回答好或普通這種模糊的答案。' : 'What is your approximate income? You can describe it in any ways.';
        await ctx.reply(message);
        ctx.session.interviewState = 'askingIncome';
        
    } else if (ctx.session.interviewState === 'askingIncome') {  // 如果用戶正在輸入自我介紹
        // Store the answer to the session
        ctx.session.answers.income = ctx.message.text;
        await storeAnswers(userId, ctx.session.answers, 'income');

        // Ask the next qestion: Family
        const message = userLang === 'zh' ? '你的家庭狀況呢？現在跟誰住？' : 'What is your family situation? Who do you live with?';
        await ctx.reply(message);
        ctx.session.interviewState = 'askingFamily';
        
    } else if (ctx.session.interviewState === 'askingFamily') {  // 如果用戶正在輸入自我介紹
        // Store the answer to the session
        ctx.session.answers.family = ctx.message.text;
        await storeAnswers(userId, ctx.session.answers, 'family');

        // Ask the next qestion: Relationship
        const message = userLang === 'zh' ? '你的感情狀況如何？' : 'What is your relationship status?';
        await ctx.reply(message)
        ctx.session.interviewState = 'askingRelationship';
        
    } else if (ctx.session.interviewState === 'askingRelationship') {  // 如果用戶正在輸入自我介紹
        // Store the answer to the session
        ctx.session.answers.relationship = ctx.message.text;
        await storeAnswers(userId, ctx.session.answers, 'relationship');

        // Conclusion
        const message = userLang === 'zh' ? '感謝你的介紹，這樣我可以更好的回應你！我們來繼續聊天吧！' : 'Thank you for your introduction! This is helpful for me to respond better. Let\'s continue chatting.';
        await ctx.reply(message);

        // Stop asking
        ctx.session.interviewState = 'none';

        console.log('end of question ctx.session.interviewState:', ctx.session.interviewState);


    /*
    * /Settings
    *
    */    
    } else if (ctx.session.interviewState === 'settingsLocation') {
        // Handle the answer from location to timezone
        const userTimezoneIANA = await getIANATimezone(ctx.message.text);
        //console.log(`bot on userTimezoneInput: ${userTimezoneInput}`); // Asia/Taipei
        console.log(`bot on userTimezoneIANA: ${userTimezoneIANA}`);
        if (userTimezoneIANA === null) {
            // 如果 IANA 時區代碼無效，要求使用者重新輸入
            let message = userLang === 'zh' ? 
                '呃...這是哪？再說一次嘛？我需想知道你的城市，才知道你的時區和氣候，這樣我跟你更好聊。' : 
                'Uh...no idea what this is, tell me again so I can feel you more.';
            await ctx.reply(message);
        } else {
            // Store the answer to the session
            ctx.session.userTimezone = userTimezoneIANA;
            console.log('ctx.session.userTimezone:', ctx.session.userTimezone)

            // Save to db
            ctx.session.answers.location = ctx.message.text;
            await storeAnswers(userId, ctx.session.answers, 'location');
            ctx.session.answers.timezone = userTimezoneIANA;
            await storeAnswers(userId, ctx.session.answers, 'timezone');
            console.log('settingsLocation ctx.message.text:', ctx.message.text);
            console.log('settingsLocation userId:', userId);
            console.log('settingsLocation session.answers:', ctx.session.answers);
            // Ask the next question
            let greeting = getGreeting(userTimezoneIANA, ctx.session.answers.lang, userName);
            let message = userLang === 'zh'?
                `好，我把你時區設在「${userTimezoneIANA}」了。${greeting}！來繼續聊天吧！` :
                `I've set timezone in ${userTimezoneIANA}. ${greeting}. Let's chat! Now, what's on your mind?`;
            await ctx.reply(message);
            ctx.session.interviewState = 'none';
        }


    /*
    * Other messages: the chatting part
    * Chat with AI
    */
    } else { 

        try {
            //console.log('bot on session.messageBuffer before completion - systemMessage:', ctx.session.systemMessage);
            console.log('bot on session.messageBuffer before completion - messageBuffer:', ctx.session.messageBuffer);           
            
            const textMessageBuffer = ctx.session.messageBuffer.map(b => `${b.role}: ${b.content}`).join('\n');




            // Pass the model settings to OpenAI

            let completion;
            if (ctx.session.therapy === 'on'){
                completion = await openai.chat.completions.create({
                    model: process.env.OPENAI_MODEL,
                    messages: [
                        {
                            role: 'system',
                            content: ctx.session.systemMessage,
                        },
                    ].concat(ctx.session.messageBuffer),
                    temperature: 0.2,
                    top_p: 0.5,
                    frequency_penalty: 0.2,
                    presence_penalty: 0.3,
                    max_tokens: 2000,
                    //stop: ['\n', '你覺得這些建議', '你覺得這個建議'],
                });
            } else {
                completion = await openai.chat.completions.create({
                    model: process.env.OPENAI_MODEL,
                    messages: [
                        {
                            role: 'system',
                            content: ctx.session.systemMessage,
                        },
                    ].concat(ctx.session.messageBuffer),
                    temperature: 0,
                    top_p: 0.1,
                    frequency_penalty: 2,
                    presence_penalty: 0.6,
                    max_tokens: 1000,
                    stop: ['如果']
                });
            }
            
            //console.log('bot on completion', JSON.stringify(completion, null, 2));
            //console.log(completion);

            // Set the process done so we can take the next request
            ctx.session.status = 'messageProcessingDone';
            console.log('ctx.session.status: ', ctx.session.status);

            // Send the generated response to the chat
            const response = completion.choices[0].message.content;
            if (response && response.trim() !== '') { 
                await ctx.reply(response); 
            } else {
                console.log('Warning: response was empty');
            }

            // Append the simplified response to the message buffer
            ctx.session.messageBuffer.push({
                role: 'assistant',
                content: response,
            });

    
            // After the message is sent, save to db
            const responseDate = new Date(completion.created * 1000);
            const responseLocalTime = userTimezone ? getFormattedDate(responseDate, userTimezone) : userInputLocalTime;
            const shortenedResponse = await shortenedWithOpenAI(response);
            await storeMessage(userId, responseDate, responseLocalTime, 'assistant', response, shortenedResponse, JSON.stringify(completion));
    

    
        } catch (err) {
            console.error(err.stack);
        }        
    }
    
});

/*
 * The callback query
 * to receive and send messages
 */
bot.on('callback_query', async (ctx) => {

    const userId = ctx.from.id;
    const userName = ctx.from.first_name;
    const userLang = ctx.session.userLang || await getUserLang(userId);
    const callbackData = ctx.callbackQuery.data;

    /*
    * The callback query for /start
    * to receive and send messages
    */
    if (callbackData === 'startInterview') {

        ctx.session.answers = ctx.session.answers || {};
        ctx.session.answers.lang = ctx.session.answers.lang || '';
        ctx.session.answers.location = ctx.session.answers.location || '';
        ctx.session.answers.timezone = ctx.session.answers.timezone || '';

        // Ask the first question
        const message = userLang === 'zh' ? 
                '你要繼續用中文嗎？' : 
                'Confirm language';
        return ctx.reply(message, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'English', callback_data: 'languageEn' }],
                    [{ text: '中文', callback_data: 'languageZh' }]
                ],
            },
        }); 
    } else if (callbackData === 'languageEn') {

        // Store the answer to the session
        ctx.session.userLang = 'en';
        
        // Save to db
        ctx.session.answers.lang = 'en';
        await storeAnswers(userId, ctx.session.answers, 'lang');
        
        // Ask the next question
        await ctx.reply('Which city are you in?');

        // Set up the interviewState for the next question
        ctx.session.interviewState = 'location';


    } else if (callbackData === 'languageZh') {

        // Store the answer to the session
        ctx.session.userLang = 'zh';

        // Save to db
        ctx.session.answers.lang = 'zh';
        await storeAnswers(userId, ctx.session.answers, 'lang');

        // Ask the next question
        await ctx.reply('你在哪個城市？');

        // Set up the interviewState for the next question
        ctx.session.interviewState = 'location';


    /*
    * The callback query for /intro
    * to receive and send messages
    */
    } else if (callbackData === 'moreQuestions') {
        // Initializing the interview
        ctx.session.answers = {
            age: '',
            gender: '',
            company: '',
            position: '',
            income: '',
            family: '',
            relationship: '',
        };

        // Ask the first question
        const message = userLang === 'zh' ? 
                '你的性別是？要怎樣形容都可以' : 
                'How would you describe your gender?';
        await ctx.reply(message);
        ctx.session.interviewState = 'askingGender';

    /*
    * Settings
    * 
    */
    }  else if (callbackData === 'settingsLanguageEn') {

        // Store the answer to the session
        ctx.session.userLang = 'en';
        
        // Save to db
        if (!ctx.session.answers) {
            ctx.session.answers = {};
        }
        ctx.session.answers.lang = 'en';
        await storeAnswers(userId, ctx.session.answers, 'lang');
        
        // Ask the next question
        await ctx.reply('Which city are you in?');
        ctx.session.interviewState = 'location';
        
        
    } else if (callbackData === 'settingsLanguageZh') {
        // Store the answer to the session
        ctx.session.userLang = 'zh';
        
        // Save to db
        if (!ctx.session.answers) {
            ctx.session.answers = {};
        }
        ctx.session.answers.lang = 'zh';
        await storeAnswers(userId, ctx.session.answers, 'lang');

        // Ask the next question
        await ctx.reply('你在哪個城市？');
        ctx.session.interviewState = 'location';

    /*
    * Menu
    * 
    */
    } else if (callbackData === 'menuSettings') {
        await commandHandlers['settings'](ctx);
    } else if (callbackData === 'menuIntro') {
        await commandHandlers['intro'](ctx);
    } else if (callbackData === 'menuDiary') {
        await commandHandlers['diary'](ctx);
    } else if (callbackData === 'menuReadDiary') {
        await commandHandlers['read'](ctx);
    } else if (callbackData === 'menuTherapy') {
        await commandHandlers['therapy'](ctx);

    /*
    * Read Diary
    * 
    */
    } else if (callbackData === 'readDiaryRecent') {

        // fetch diaries from the database
        const DiaryBuffer = await loadDiaryBuffer(userId, 5);
        let combinedDiaryContent = DiaryBuffer.reduce((accumulator, currentEntry) => {
            return accumulator + "\n===\n" + currentEntry.content;
        }, "");

        // Test the data
        console.log('readDiaryRecent DiaryBuffer:', combinedDiaryContent);

        message = userLang === 'zh' ? 
            `這是最近的日記。\n` : 
            `This is recent diaries\n`;
        await ctx.reply(message + combinedDiaryContent);

    } else if (callbackData === 'readDiaryPick') {
        message = userLang === 'zh' ? 
            `還沒做這功能...\n` : 
            `The feature is not available yet\n`;
        await ctx.reply(message);
    /*
    * Therapy
    * 
    */
    } else if (callbackData === 'therapyOn') {
        ctx.session.therapy = 'on';
        await storeUserData(userId, 'therapy', 'on');
        if (ctx.session.therapist === 'none') {
            ctx.session.therapist = 'Wendy';
            await storeUserData(userId, 'therapist', 'Wendy');
        }
        message = userLang === 'zh' ? 
            `Hi ${userName}，我是 Wendy，今天想談什麼？若你想和另外兩位諮商師 Harry 或 Branden 談，可以打「Harry?」或「Branden?」來招喚他們。你也可以隨時用「Wendy?」來召喚我。` : 
            `Hi ${userName}, what do you want to talk about today? You can type "Harry?" to talk to Harry, he's another amazing therapist.`;
        await ctx.reply(message);
        console.log('therapyOn ctx.session:', ctx.session);

        ctx.session.messageBuffer = ctx.session.messageBuffer ??= await loadMessageBuffer(userId, 50);

        ctx.session.messageBuffer.push({
            role: 'assistant',
            content: `Hi ${userName}，我是 Wendy，今天想談什麼？若你想和另外兩位諮商師 Harry 或 Branden 談，可以打「Harry?」或「Branden?」來招喚他們。你也可以隨時用「Wendy?」來召喚我。（目前已開啟諮商模式，我會隨機在訊息後面加上「(目前為諮商模式，你可以用 /therapy 指令關閉)」的提示。）`
        });

    } else if (callbackData === 'therapyOff') {
        ctx.session.therapy = 'off';
        ctx.session.therapist = 'none';
        await storeUserData(userId, 'therapy', 'off');
        await storeUserData(userId, 'therapist', 'none');
        message = userLang === 'zh' ? 
            `好，那今天先談到這邊。歡迎隨時開啟諮商模式。` : 
            `Ok let's stop here today.`;
        await ctx.reply(message);
        ctx.session.messageBuffer ??= await loadMessageBuffer(userId);
        
        ctx.session.messageBuffer.push({
            role: 'user',
            content: '我已經把諮商模式關閉，請停止用 (Harry) 或 (Branden) 開頭，請停止在回應後面加上「(目前為諮商模式，你可以用 /therapy 指令關閉)」的提示。'
        });
        ctx.session.messageBuffer.push({
            role: 'assistant',
            content: '好，那今天先談到這邊。我會停止在訊息加上 (Harry) 或 (Branden) ，也不會再加上「(目前為諮商模式，你可以用 /therapy 指令關閉)」的提示。'
        });
    
    } else if (callbackData === 'therapyTherapist') {
        message = userLang === 'zh' ? 
            `我們的 Therapist 有 Wendy、Harry 和 Branden，只要輸入名字後面有半型問號「Harry?」或「Branden?」就可以召喚，僅限諮商模式哦！` :
            `We have Wenday and Harry and Branden and you can talk to them by calling their name with a question mark (e.g.Harry?).`;
        await ctx.reply(message);
    } else if (callbackData === 'therapyContinue') {
        if (ctx.session.therapist === 'none') {
            ctx.session.therapist = 'Wendy';
            await storeUserData(userId, 'therapist', 'Wendy');
        }
        message = userLang === 'zh' ? 
            `好，我們繼續聊。` : 
            `Ok let's continue.`;
        await ctx.reply(message);
        console.log(ctx.session);
    
    /*
    * When the user choose to start chatting
    * Chat with AI
    */
    } else if (callbackData === 'chat') {
        const message = userLang === 'zh' ? 
                '那來開始記錄心情吧！你現在在想什麼？' : 
                'Ok! What\'s on your mind?';
        await ctx.reply(message);
    }
});

/*
* Enable this when testing local
* 
*/
//bot.launch();

/*
* Enable this before push to server
* 
*/
bot.launch({
    webhook: {
      domain: process.env.WEBHOOK_DOMAIN, // your Heroku app URL
      port: process.env.PORT,
      path: '/webhook', // replace with your webhook path
      secretToken: process.env.WEBHOOK_SECRET, // replace with your secret token
    },
});

bot.catch((err, ctx) => {
    console.log(`Ooops, encountered an error for ${ctx.updateType}`, err)
})

// Enable graceful stop
// process.once('SIGINT', async () => await bot.stop('SIGINT'))
// process.once('SIGTERM', async () => await bot.stop('SIGTERM'))
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))