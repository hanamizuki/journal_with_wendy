const { bot, openai, base, getIANATimezone, getFormattedDate } = require('./api');
const { loadMessagesToday, loadDiariesToday, getUserData } = require('./db');
const { generateWeekly } = require('./commands/diary');

// Load moment
const moment = require('moment-timezone');

/*
 * Command handlers for all other commands
 * List of commands and its function
 */
const commandHandlers = {
    '/intro': require('./commands/intro').handleIntroCommand,
    '/diary': require('./commands/diary').handleDiaryCommand,
    '/read': require('./commands/diary').handleReadDiaryCommand,
    '/stop': require('./commands/stop').handleStopCommand,
    '/settings': require('./commands/settings').handleSettingsCommand,
    '/menu': require('./commands/menu').handleMenuCommand,
    '/therapy': require('./commands/therapy').handleTherapyCommand
    // ...
};

function estimateTokens(text) {
    // 將文本分成 tokens
    const tokens = text.match(/[\w]+|[\s]+|[^\s\w]+/g);
    //console.log('estimateTokens tokens:', tokens);
  
    return tokens ? tokens.length : 0;
}

function getGreeting(timezone, lang, name) {

    let greeting;

    if (timezone) {
        // 使用 moment.tz() 來取得使用者的當地時間
        let userLocalTime = moment().tz(timezone);
        //console.log('userLocalTime:', userLocalTime);

        // 根據時間來決定要說早安、午安或晚安
        let hour = userLocalTime.hour();

        if (hour >= 6 && hour < 12) {
            greeting = lang === 'zh' ?
                `${name} 早啊！` :
                `gm, ${name}!`;
        } else if (hour >= 12 && hour < 18) {
            greeting = lang === 'zh' ?
                `${name} 午安！去曬曬太陽吧！` :
                `Good afternoon, ${name}.`;
        } else {
            greeting = lang === 'zh' ?
                `嘿 ${name}！晚餐吃了嗎？` :
                `Gooe evening, ${name}.`;
        }
    } else {
        greeting = lang === 'zh' ?
            `Hey ${name}.` :
            `Hi ${name}.`;
    }
    return greeting;
}

async function shortenText(text) {
    if (!text || text.trim() === '' || text.trim().length <= 10) {
        return text
    }
    const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL,
        messages: [
            {
                role: "system",
                content: "你很懂得把別人的話用最精簡卻不失原意的方式表達，請把訊息長度縮短到原本的20%。請保留原本的語言。若有提到別人，請盡量保留。如果原本就很短，請直接回覆一樣的內容即可。",
            },
            {
                role: "user",
                content: text,
            },
        ],
        temperature: 0,
        max_tokens: 100, // 可以設定一個上限，以防回答過長
    })
    return completion.choices[0].message.content
}

async function getInstructionsText(therapy, therapist) {
    console.log('getInstructionsText therapy:', therapy);
    return new Promise((resolve, reject) => {
        let formula = '';
        if (therapy === 'on') {
            formula = therapist === 'Harry' || therapist === 'Branden' ? 
                      `{Key} = 'therapy${therapist}'` : 
                      "{Key} = 'therapyDefault'";
        } else {
            formula = "{Key} = 'instructionsText'";
        }

        base('Settings').select({
            view: "Grid view",
            filterByFormula: formula
        }).firstPage((err, records) => {
            if (err) {
                reject(err);
                return;
            }
            if (records && records.length > 0) {
                resolve(records[0].get('Value'));
            } else {
                reject("No records found");
            }
        });
    });
}

async function extractUserRelationship(uid, text) {

    const ner_gpt_function = [
        {
            "name": "find_ner",
            "description": "Extracts named entities and their categories from the input text.",
            "parameters": {
                "type": "object",
                "properties": {
                    "entities": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "entity":{"type": "string", 
                                            "description": "A Named entity extracted from text."},
                                "catrgory":{"type": "string", 
                                            "description": "Category of the named entity."}
                            }                            
                            }
                        }
                    }
                },
                "required": ["entities"]
        }
    ];


    const assistant = await openai.beta.assistants.create({
        name: "User Relationship Analysis",
        instructions: "You are an human relationship expert. You can extract user's personal relationship from the message.",
        tools: ner_gpt_function,
        model: process.env.OPENAI_MODEL,
    });

    console.log('assistant', assistant)
    
    const thread = await openai.beta.threads.create();
    
    const message = await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: text,
    });
    
    const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistant.id,
        instructions: "Please find this user's relationship with anyone else in the message",    
    });
    
    console.log('run', run)
    
    const checkStatusAndPrintMessages = async (threadId, runId) => {
        let runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
        console.log('runStatus', runStatus.status);
        if(runStatus.status === "completed"){
            let messages = await openai.beta.threads.messages.list(threadId);
            console.log('messages', messages);
            messages.data.forEach((msg) => {
                const role = msg.role;
                const content = msg.content[0].text.value;
                console.log(msg.content[0].text.value); 
                console.log(
                    `${role.charAt(0).toUpperCase() + role.slice(1)}: ${content}`
                );
                //console.log('runStatus', runStatus.required_action.submit_tool_outputs.tool_calls);
            });
        } else {
            console.log("Run is not completed yet.");
        }  
    };
    
    setTimeout(() => {
        checkStatusAndPrintMessages(thread.id, run.id)
    }, 10000 );
}

async function scheduleDiary(ctx) {

    const userId = ctx.from.id;
    
    // Define job name
    const diaryJobName = `diaryJobForUser${userId}`;

    // 檢查是否已經設定了一個特定名稱的定時任務
    const schedule = require('node-schedule');

    if (schedule.scheduledJobs[diaryJobName]) {
        console.log('Diary job already scheduled.');
    } else {
        // Get today's message count
        const messagesToday = await loadMessagesToday(userId);
        const messageCount = messagesToday.length;
        
        // Deal with time
        const moment = require('moment-timezone');
        const userTimezone = ctx.session.userTimezone || await getUserData(userId, 'timezone');

        // 獲取使用者時區的現在時間
        let now = moment().tz(userTimezone);

        // 獲取使用者時區的今天早上5點
        let fiveAMToday = moment().tz(userTimezone).startOf('day').add(5, 'hours');

        // 獲取使用者時區的明天早上5點
        let fiveAMTomorrow = moment().tz(userTimezone).add(1, 'day').startOf('day').add(5, 'hours');

        // 如果現在時間在今天早上5點之前，則設定定時任務為今天早上5點
        // 否則，設定定時任務為明天早上5點
        let nextFiveAM = now.isBefore(fiveAMToday) ? fiveAMToday : fiveAMTomorrow;

        // 使用 toDate 方法將 moment 物件轉換為 JavaScript 的 Date 物件
        // 使用 Date 物件來設定定時任務
        let nextFiveAMDate = nextFiveAM.toDate();

        // 使用差異來設定定時任務
        const job = schedule.scheduleJob(diaryJobName, nextFiveAMDate, async () => {
            console.log('messageCount', messageCount);
            // 如果使用者在 5am 之後發送了 3 則以上的訊息，則預定一個在隔天 5am 的訊息
            if (messageCount >= 3) {
                bot.command('diary', require('./commands/diary').handleDiaryCommand(ctx));     
            }
        });  
        if (schedule.scheduledJobs[diaryJobName]) {
            console.log('Diary job has been scheduled successfully.');
            console.log(schedule.scheduledJobs);
        } else {
            console.log('Failed to schedule the diary job.');
        }
    }

    // 定義工作名稱
    const weeklyJobName = `weeklyJobForUser${userId}`;

    // 檢查是否已經設定了一個特定名稱的定時任務
    if (schedule.scheduledJobs[weeklyJobName]) {
        console.log('Weekly job already scheduled.');
    } else {
        // 如果沒有設定定時任務，則設定一個新的定時任務
        // Cron-style 的時間格式：在每週一的早上9點執行
        const job = schedule.scheduleJob(weeklyJobName, '0 9 * * 2', async () => {
            const weeklySummery = await generateWeekly(ctx);
            await ctx.reply(weeklySummery);
        });
        if (schedule.scheduledJobs[diaryJobName]) {
            console.log('Weekly job has been scheduled successfully.');
            console.log(schedule.scheduledJobs);
        } else {
            console.log('Failed to schedule the weekly job.');
        }
    }
}

// Calculate the token count
async function tikTokensCount (text) {
    const { countTokens } = require("../services/tiktoken");
    const tokens = await countTokens(systemMessage);
    return tokens;
} 



module.exports = {
    commandHandlers,
    getGreeting,
    shortenText,
    getInstructionsText,
    estimateTokens,
    extractUserRelationship,
    scheduleDiary
};
