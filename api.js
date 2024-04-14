// Load environment variables
const dotenv = require('dotenv').config()

// Load moment
const moment = require('moment-timezone');

// Setting up telegram bot api
const { Telegraf, session } = require('telegraf')
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN)

// Setting up OpenAI API
const openaiAPI = require('openai');
const openai = new openaiAPI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Setting up Airtable
const airtableAPI = require('airtable');
airtableAPI.configure({
    apiKey: process.env.AIRTABLE_PERSONAL_TOKEN,
    endpointUrl: 'https://api.airtable.com'
});
const base = airtableAPI.base(process.env.AIRTABLE_BASE_ID);

/*
 * Some handy functions
 * to get info
 */

async function shortenedWithOpenAI(text) {
    if (!text || text.trim() === '' || text.trim().length <= 10) {
        return text
    }
    const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL,
        messages: [
            {
                role: "system",
                content: "你很懂得把別人的話用最精簡卻不失原意的方式表達，請把訊息長度縮短到原本的20%。請保留原本的語言。若有提到別人，請盡量保留。",
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

async function getIANATimezone(text) {

    const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL,
        messages: [
            {
                role: "system",
                content: "我會給你一個城市名稱，請告訴我 IANA 碼是什麼？請直接輸入代碼，不用有其他文字。如果我給你一個比較大範圍的國家，請盡可能猜一個比較接近的時區，並一樣僅回傳 IANA 格式。",
            },
            {
                role: "user",
                content: text,
            },
        ],
        temperature: 0,
        max_tokens: 25, // 可以設定一個上限，以防回答過長
    })
    
    let timezonebyOpenAI;

    try {
        const timezonebyOpenAI = completion.choices[0].message.content;
        console.log(`timezonebyOpenAI: ${timezonebyOpenAI}`);
        // Check if the timezone is a valid IANA timezone
        if (moment.tz.zone(timezonebyOpenAI)) {
            return timezonebyOpenAI;
        } else {
            return null;
        }
    } catch (error) {
        console.error(error);
        return null;
    }
}

// Date format
function getFormattedDate(date, timezone) {
    return moment(date).tz(timezone).format('YYYY/MM/DD HH:mm:ss');
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

module.exports = {
    bot,
    session,
    openai,
    base,
    shortenedWithOpenAI,
    getIANATimezone,
    getFormattedDate,
    getGreeting
};
