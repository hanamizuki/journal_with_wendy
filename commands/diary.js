const { openai, getFormattedDate } = require('../api');
const { getUserTimezone, storeDiary, loadMessagesYesterday, loadMessagesToday, loadDiaryBuffer, getUserData,
    loadAnswers
} = require('../db');
const moment = require('moment-timezone');

async function handleDiaryCommand(ctx) {

    const userId = ctx.from.id;

    // fetch today's messages from the database
    const messagesToday = await loadMessagesToday(userId);

    if (messagesToday.length === 0) {
        await ctx.reply(`等等！今天我們還沒傳訊過，我生不出日記呀～可以用 /read 看上一篇`);
        ctx.session.status = 'normal';
    } else {

        const userTimezone = await getUserTimezone(userId); // 從資料庫獲取使用者的時區
        const timestamp = moment().utc().format('YYYY/MM/DD HH:mm:ss');
        const localTimestamp = getFormattedDate(new Date(), userTimezone);

        // get diaryDate
        let now = moment().tz(userTimezone).startOf('day');
        let diaryDate;
        if (now.hour() >= 0 && now.hour() < 5) {
            // 如果現在時間在凌晨 0 點到 5 點之間，獲取昨天
            diaryDate = now.subtract(1, 'days');
        } else {
            // 否則，獲取今天
            diaryDate = now;
        }

        //console.log('handleDiaryCommand timestamp now:', timestamp);
        //console.log('handleDiaryCommand localTimestamp now:', localTimestamp);
        console.log('handleDiaryCommand diaryDate:', diaryDate.toString());

        const diary = await generateDiary(messagesToday, diaryDate.toString(), userId);

        if (diary) {
            // 將狀態設定為完成
            ctx.session.status = 'normal';

            // Remove the last line
            const diaryLines = diary.trim().split(/\r?\n/);
            diaryLines.pop(); // 移除最後一行
            // 重新組合文本，除了最後的 Mood 行
            const diaryContent = diaryLines.join('\n')

            // Send the massage
            await ctx.reply(diaryContent);
            //console.log(diaryContent);

            // Save to db
            const { mood, moodScore } = extractMoodAndScore(diary);

            await storeDiary(userId, timestamp, localTimestamp, diaryContent, mood, moodScore);
            console.log('ctx.session in finished diary:', ctx.session.status);

        } else {
            console.log('diary error');
        }
    }

}

async function handleYesterdayDiaryCommand(ctx) {

    const userId = ctx.from.id;

    // fetch today's messages from the database
    //const messagesToday = await loadMessagesToday(userId);
    const messagesToday = await loadMessagesYesterday(userId);

    if (messagesToday.length === 0) {
        await ctx.reply(`等等！今天我們還沒傳訊過，我生不出日記呀～可以用 /read 看上一篇`);
        ctx.session.status = 'normal';
    } else {

        const userTimezone = await getUserTimezone(userId); // 從資料庫獲取使用者的時區

        // get diaryDate
        let now = moment().tz(userTimezone);
        let diaryDate;
        if (now.hour() >= 0 && now.hour() < 5) {
            // 如果現在時間在凌晨 0 點到 5 點之間，獲取昨天
            diaryDate = now.subtract(2, 'days');
        } else {
            // 否則，獲取今天
            diaryDate = now.subtract(1, 'days');
        }
        diaryDateUTC = diaryDate.clone().utc(); // 複製後轉換為 UTC，才不會改到 diaryDate

        //console.log('handleDiaryCommand timestamp now:', timestamp);
        //console.log('handleDiaryCommand localTimestamp now:', localTimestamp);
        console.log('handleYesterdayDiaryCommand diaryDate:', diaryDate.format());
        console.log('handleYesterdayDiaryCommand diaryDateUTC:', diaryDateUTC.format());

        const diary = await generateDiary(messagesToday, diaryDate.toString(), userId);

        if (diary) {
            // 將狀態設定為完成
            ctx.session.status = 'normal';

            // Remove the last line
            const diaryLines = diary.trim().split(/\r?\n/);
            diaryLines.pop(); // 移除最後一行
            // 重新組合文本，除了最後的 Mood 行
            const diaryContent = diaryLines.join('\n')

            // Send the massage
            await ctx.reply(diaryContent);
            //console.log(diaryContent);

            // Save to db
            const { mood, moodScore } = extractMoodAndScore(diary);

            await storeDiary(userId, diaryDateUTC, diaryDate, diaryContent, mood, moodScore);
            console.log('ctx.session in finished diary:', ctx.session.status);

        } else {
            console.log('diary error');
        }
    }

}


async function generateDiary(messageBuffer, date, userId) {
    const diaryInput = messageBuffer.map(b => `${b.role}: ${b.content}`).join('\n');

    //console.log('generateDiary diaryInput (messages for diary):', diaryInput);
    console.log('generateDiary date:', date);
    //console.log('generateDiary diaryBuffer:', diaryBuffer);

    const answerBuffer = await loadAnswers(userId);
    const answersContent = Object.entries(answerBuffer).map(([key, value]) => `  ${key}: ${value}`).join('\n');

    try {
        const systemMessage = 
            `以下是 user（也就是我）和 assistant 的對話，請把 user 的內容，串連成一篇日記，並調整內容或是加上連接詞，讓整篇讀起來通順並且前後文連貫。。\n`+
            `\n===\n`+
            diaryInput + `\n` +
            `\n=== 關於對話 ===\n`+
            `- 請用今天的日期 ${date}，以及總結今天發生的事情當做標題。 \n` +
            `- 我的訊息後面有 sent: 日期代表傳的時間，可用來參考當做日記內容的時間點。 \n`+
            `- 若我提到「剛才」、「我正在」、「剛剛」，請不要直接放到日記，請參考該訊息的時間點來描述內容。比如說，我在下午三點提到「我正在吃下午茶」，請調整成「下午三點我吃了下午茶」。 \n`+
            `- 請勿加上我沒有提過的事情、感受或比喻。請務必不要加上 assistant 的評論，這是我的日記。 \n`+
            `- 如果是我描述今天的夢、發生的事情經過、領悟、想法、靈感之類的，請一定要全部保留，這是重要的人生記錄。 \n`+
            `- 請不要自行在帶有負面情緒的內容後面加上正面的描述，請保留原始情緒，這很重要，人不會永遠正面。 \n` +
            `- 最後請簡單總結今天的事情，依照事實總結，不要加上評論。 \n` +
            //diaryBufferMessage +
            `\n=== 關於我 ===\n`+
            `這是我的檔案，不需要包含在日記，僅供參考：\n${answersContent}\n\n` +
            `\n=== 輸出格式（請你用以下格式寫成日記） ===\n`+
            `日期：${date} \n`+
            `標題：（這邊總結一整天的心情變成標題） \n\n`+
            `（這邊是日記內容，請分段描述。) \n\n`+
            `Mood: $今日心情 | Mood Score: $今日心情分數（請確保這一行是在最後一行）\n` +
            `=== 關於今日心情 === \n`+
            `「$今日心情」選項如下：Angry/Anxious/Calm/Confident/Confused/Depressed/Energized/Fatigued/Flirty/Forgetful/Frustrated/Gloomy/Happy/Hungry/Hyper/Impatient/In Love/Insecure/Irritable/Jealous/Mean/Moody/Nervous/Sensitive/Shy/Sick/Sleepy/Spacey/Stressed/Tired/Unbalanced/Weepy \n` +
            `請從今天的對話中，分析我的心情，可以有 1~3 個選項` +
            `「$今日心情分數」請從 1~100 分給一個心情指數，1 分是心情最低落，100 分是心情最好。` +
            `比如「Mood: Happy, Anxious | 70」 或是 「Mood: Sad, Angry, Weepy | 50」` +
            `除了最後一行之外，其他內文請勿提到心情分數之類的內容。` +
            `若你拿到的資料不足，無法用以上方式產出日記，請只回傳 "null"，不要傳其它文字。`;

        console.log('generateDiary systemMessage:', systemMessage);

        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL,
            messages: [
                {
                    role: 'system',
                    content: systemMessage,
                },
            ],
            temperature: 0,
            top_p: 0,
            frequency_penalty: 0,
            presence_penalty: 0,
            max_tokens:4096,
        });

        const result = completion && completion.choices[0].message.content;

        if (result !== 'null' && completion.choices.length > 0) {
            return result;
        } else {
            console.log('No choices available in the completion or openai return null');
            return null;
        }
    } catch (error) {
        console.log('Error generating diary:', error);
        return null;
        //return 'Error generating diary.'; // 這個會跑到 diaryBuffer
    }
}

async function generateWeekly(ctx) {
    const diaryBuffer = await loadDiaryBuffer(ctx.from.id, 5);
    const weeklyInput = diaryBuffer.map(b => `${b.content}`).join('\n');
    console.log('generateWeekly weeklyInput (lasy 7 diaries):', weeklyInput);
   
    try {
        const systemMessage = 
            `以下是我最近一週的日記，請你幫我回顧這一週的重點生活點滴，寫成一篇「本週回顧」。\n`+
            `\n===\n`+
            weeklyInput + `\n` +
            `\n=== 關於回顧 ===\n`+
            `- 請特別把情緒起伏忠實呈現 \n` +
            `- 請勿加上我沒有提過的事情、感受或比喻。請務必不要加上 assistant 的評論，這是我的日記。 \n`+
            `- 請不要自行在帶有負面情緒的內容後面加上正面的描述，請保留原始情緒，這很重要，人不會永遠正面。 \n` +
            //diaryBufferMessage +
            `\n=== 輸出格式（請你用以下格式寫成本週回顧） ===\n`+
            `標題：（這邊總結這一週的心情變成標題） \n\n`+
            `（這邊是日記內容，請分段描述。) \n\n`+
            `若你拿到的資料不足，無法用以上方式產出日記，請只回傳 "null"，不要傳其它文字。`;

        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL,
            messages: [
                {
                    role: 'system',
                    content: systemMessage,
                },
            ],
            temperature: 0,
            top_p: 0,
            frequency_penalty: 0,
            presence_penalty: 0,
            max_tokens:4096,
        });

        const result = completion && completion.choices[0].message.content;

        if (result !== 'null' && completion.choices.length > 0) {
            return result;
        } else {
            console.log('No choices available in the completion or openai return null');
            return null;
        }
    } catch (error) {
        console.log('Error generating diary:', error);
        return null;
        //return 'Error generating diary.'; // 這個會跑到 diaryBuffer
    }
}

function extractMoodAndScore(diaryText) {
    // 使用正則表達式提取 Mood 和 Mood Score
    const moodRegex = /Mood: ([\w\s,]+) \|/;
    const scoreRegex = /Mood Score: (\d+)/;

    const moodMatch = diaryText.match(moodRegex);
    const scoreMatch = diaryText.match(scoreRegex);

    if (moodMatch || moodScoreMatch) {
        const mood = moodMatch ? moodMatch[1].trim() : null;
        const moodScore = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
        // 檢查提取結果
        console.log('Mood:', mood); // "Confident, Anxious"
        console.log('Mood Score:', moodScore); // 70
        return {mood, moodScore};
    } else {
        console.error('Unable to extract mood information from diary text.');
    }
}

async function handleReadDiaryCommand(ctx) {

    const userId = ctx.from.id;
    const userLang = await getUserData(userId, 'lang');
    //console.log('handleDiaryCommand diariesToday:', diariesToday)

    message = userLang === 'zh' ? 
        `你要看哪天的日記` : 
        `What day?`;
    readRecent = userLang === 'zh' ?
        '最近幾天' :
        'Recent days';
    readPickaDay = userLang === 'zh' ?
        '我選一天' :
        'Pick a date';

    // 提示用戶輸入自我介紹
    await ctx.reply(message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: readRecent, callback_data: 'readDiaryRecent' }],
                [{ text: readPickaDay, callback_data: 'readDiaryPick' }]
            ],
        },
    });
}

module.exports = {
    handleDiaryCommand,
    handleYesterdayDiaryCommand,
    handleReadDiaryCommand,
    generateWeekly
};
