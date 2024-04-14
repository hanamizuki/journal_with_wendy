const { Client } = require('pg');
const moment = require("moment-timezone");

const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
        timezone: 'UTC'
    }
});

/*
 * get user timezone from db
 * 
 */
async function getUserTimezone(userId) {
    const query = 'SELECT timezone FROM users WHERE uid = $1';
    const values = [userId];
    try {
        const result = await db.query(query, values);
        if (result.rows.length > 0) {
            return result.rows[0].timezone;
        } else {
            return null;
        }
    } catch (err) {
        console.error(err.stack);
        return null;
    }
}

async function checkUserExists(uid) {
    const query = 'SELECT EXISTS(SELECT 1 FROM users WHERE uid = $1)';
    const values = [uid];

    try {
        const result = await db.query(query, values);
        // Assuming the result is returned in a way where you can directly access it:
        //console.log('user exist:', result.rows[0].exists);
        return result.rows[0].exists;
    } catch (err) {
        console.error('Error checking user exists:', err.stack);
        throw err; // or return false, depending on how you want to handle the error
    }
}

async function addNewUser(uid, defaultValues) {
    const checkQuery = 'SELECT 1 FROM users WHERE uid = $1 LIMIT 1';
    const insertQuery = 'INSERT INTO users (uid, first_name, last_name, lang, joined) VALUES ($1, $2, $3, $4, $5) RETURNING *';

    try {
        // 首先检查用户是否存在
        const checkResult = await db.query(checkQuery, [uid]);

        // 如果用户不存在，则插入新用户
        if (checkResult.rows.length === 0) {
            // 这里的 defaultValues 对象包含了除 uid 以外您希望插入的其他字段及其默认值
            const values = [uid, defaultValues.first_name, defaultValues.last_name, defaultValues.lang, defaultValues.joined];
            const insertResult = await db.query(insertQuery, values);
            console.log('Saving new user...')
            console.log(insertResult)
            console.log('Saving new user ended...')
            return insertResult.rows[0]; // 返回新插入的用户记录
        } else {
            // 用户已存在
            return null; // 或者返回现有的用户信息，取决于您的需求
        }
    } catch (err) {
        console.error('Error upserting user:', err.stack);
        throw err;
    }
}



/*
 * get user language from db
 * 
 */
async function getUserLang(userId) {
    const query = 'SELECT lang FROM users WHERE uid = $1';
    const values = [userId];
    try {
        const result = await db.query(query, values);
        if (result.rows.length > 0) {
            return result.rows[0].lang;
        } else {
            return null;
        }
    } catch (err) {
        console.error(err.stack);
        return null;
    }
}

async function storeUserData(userId, field, newValue) {
    // 假設 'uid' 是表的主鍵或是唯一約束的一部分
    const query = `
        INSERT INTO users (uid, ${field})
        VALUES ($1, $2)
        ON CONFLICT (uid)
        DO UPDATE SET ${field} = EXCLUDED.${field}
        RETURNING *;
    `;
    const values = [userId, newValue];
    try {
        const result = await db.query(query, values);
        if (result.rowCount > 0) {
            return result.rows[0];
        } else {
            return null; // 這種情況理論上不會發生，除非INSERT和UPDATE都沒有進行。
        }
    } catch (err) {
        console.error(err.stack);
        return null;
    }
}

async function getUserData(userId, field) {
    const query = `SELECT ${field} FROM users WHERE uid = $1`;
    const values = [userId];
    try {
        const result = await db.query(query, values);
        if (result.rows.length > 0) {
            return result.rows[0][field];
        } else {
            return null;
        }
    } catch (err) {
        console.error(err.stack);
        return null;
    }
}

/*
 * Save messages to db
 * 
 */
async function storeMessage(uid, timestamp, local_timestamp, role, message, shortened, completion) {
    // 检查 uid 是否存在于 users 表中
    const userExistenceQuery = 'SELECT uid FROM users WHERE uid = $1';
    const userExistenceResult = await db.query(userExistenceQuery, [uid]);

    // 如果不存在，则插入新的 uid
    if (userExistenceResult.rows.length === 0) {
        const insertUserQuery = 'INSERT INTO users(uid) VALUES($1)';
        await db.query(insertUserQuery, [uid]);
    }

    // 插入消息
    const text = `INSERT INTO messages(uid, timestamp, local_timestamp, role, message, shortened, completion) VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *`;
    const values = [uid, timestamp, local_timestamp, role, message, shortened, completion];


    try {
        const res = await db.query(text, values);
        if (res.rows[0]['role'] !== 'system') {
            console.log(`Saving message to db...`);
            console.log(res.rows[0]);
        }
    } catch (err) {
        console.error(err.stack);
    }
}

/*
 * load messages from db
 * 
 */
async function loadMessageBuffer(userId, amount) {

    const userTimezone = await getUserData(userId, 'timezone') || 'Asia/Taipei';
    // 先取得最後一篇日記的時間
    const lastDiaryTimestamp = await db.query(`
        SELECT COALESCE(MAX(local_timestamp), '1970-01-01T00:00:00Z') as max_timestamp FROM diaries
        WHERE uid = $1
    `, [userId]);

    // 取得最後一篇日記之後的訊息
    let messages = await db.query(`
        SELECT * FROM (
            SELECT * FROM messages
            WHERE uid = $1
            AND role != 'system'
            AND local_timestamp >= $2
            ORDER BY ID DESC
            LIMIT $3
        ) AS subquery
        ORDER BY ID ASC
    `, [userId, lastDiaryTimestamp.rows[0].max_timestamp, amount]);

    console.log('loadMessageBuffer messages count: ', messages.rows.length);
    
    // 如果訊息數量不足 amount 定義的數量時，則直接取最新的 amount 數量的訊息
    if (messages && messages.rows.length < amount) {
        const amountLeft = amount-messages.rows.length ;
        console.log('loadMessageBuffer messages amountLeft: ', amountLeft);
        messages = await db.query(`
            SELECT * FROM (
                SELECT * FROM messages
                WHERE uid = $1
                AND role != 'system'
                ORDER BY ID DESC
                LIMIT $2
            ) AS subquery
            ORDER BY ID ASC
        `, [userId, amountLeft]);
    }

    const { getFormattedDate } = require('./api');

    return messages.rows.map(row => ({
        role: row.role,
        content: row.role === 'user'
            ? `${row.message} (sent: ${getFormattedDate(row.timestamp, userTimezone)})`
            : row.message,
            //: row.shortened || row.message,
    }));
}

/*
 * load today's messages from db
 * 
 */
async function loadMessagesToday(userId) {
    
    // Load moment
    const moment = require('moment-timezone');

    // 從資料庫獲取使用者的時區
    const userTimezone = await getUserTimezone(userId); // 從資料庫獲取使用者的時區
    console.log('userTimezone:', userTimezone);

     // 將今天的開始時間設定為凌晨五點: Output a moment object: Moment<2023-10-29T05:00:00+08:00>
     let now = moment().tz(userTimezone);
     let today5AM = moment().tz(userTimezone).hours(5).minute(0).second(0);
 
     if (now.isBefore(today5AM)) {
         today5AM = today5AM.subtract(1, 'days');
     }
    console.log('today5AM:', today5AM);
    
    // 取得最後一篇日記的時間
    const lastDiaryTimestamp = await db.query(`
        SELECT COALESCE(MAX(timestamp), '1970-01-01T00:00:00Z') as max_timestamp FROM diaries
        WHERE uid = $1
    `, [userId]);
    const lastDiaryTime = moment(lastDiaryTimestamp.rows[0].max_timestamp).tz(userTimezone);
    console.log('lastDiaryTime', lastDiaryTime);

    let start;
    if (lastDiaryTime < today5AM) {
        start = today5AM.format();
    } else {
        start = lastDiaryTime.format();
    }
    console.log('message for diary starting time: ', start);

    const queryLimit = 500;

    // 查詢今天的消息
    let todayMessages = await db.query(`
        SELECT * FROM (
            SELECT id, role, message, shortened, timestamp
            FROM messages
            WHERE uid = $1
            AND role != 'system'
            AND timestamp >= $2
            ORDER BY id DESC
            LIMIT $3
        ) AS subquery
        ORDER BY ID ASC;
    `, [userId, today5AM.format(), queryLimit]);

    //console.log('todayMessages for diary:', todayMessages);
    console.log('todayMessages.rowCount:', todayMessages.rowCount);
    
    // 如果今天的消息不足 30 條，則查詢昨天的消息以補足 -> 先取消，不然會把前一天的事情寫進去
    // if (todayMessages.rows.length < queryLimit) {
    //
    //     // Confirm how many more messages we need
    //     const howManyMore = queryLimit - todayMessages.rowCount;
    //     //console.log('howManyMore:', howManyMore);
    //
    //     const moreMessages = await db.query(`
    //         SELECT * FROM (
    //             SELECT id, role, message, shortened, local_timestamp
    //             FROM messages
    //             WHERE uid = $1
    //             AND role != 'system'
    //             AND local_timestamp < $2
    //             ORDER BY ID DESC
    //             LIMIT $3
    //         ) AS subquery
    //         ORDER BY ID ASC;
    //     `, [userId, start, howManyMore]);
    //     //console.log('moreMessages:', moreMessages);
    //
    //     // Add more messages to todayMessage
    //     todayMessages.rows.unshift(...moreMessages.rows);
    //     //console.log('todayMessages+moreMessages:', todayMessages.rows.length);
    // }
    return todayMessages.rows.map(row => ({
        role: row.role,
        content: row.role === 'user'
            ? `${row.message} (sent: ${row.timestamp.toLocaleString('en-US', { timeZone: userTimezone })})`
            : row.shortened || row.message,
    }));
}

async function loadUserMessagesToday(userId) {

    // Load moment
    const moment = require('moment-timezone');

    // 從資料庫獲取使用者的時區
    const userTimezone = await getUserTimezone(userId); // 從資料庫獲取使用者的時區
    console.log('userTimezone:', userTimezone);

    // 將今天的開始時間設定為凌晨五點: Output a moment object: Moment<2023-10-29T05:00:00+08:00>
    let now = moment().tz(userTimezone);
    let today5AM = moment().tz(userTimezone).hours(5).minute(0).second(0);

    if (now.isBefore(today5AM)) {
        today5AM = today5AM.subtract(1, 'days');
    }
    console.log('today5AM:', today5AM);

    start = today5AM.format();
    console.log('message for diary starting time: ', start);

    const queryLimit = 200;

    // 查詢今天的消息
    let todayMessages = await db.query(`
        SELECT * FROM (
            SELECT id, role, message, shortened, timestamp
            FROM messages
            WHERE uid = $1
            AND role = 'user'
            AND timestamp >= $2
            ORDER BY id DESC
            LIMIT $3
        ) AS subquery
        ORDER BY ID ASC;
    `, [userId, today5AM.format(), queryLimit]);

    //console.log('todayMessages for diary:', todayMessages);
    console.log('todayMessages.rowCount:', todayMessages.rowCount);

    return todayMessages.rows.map(row => ({
        role: row.role,
        content: row.role === 'user'
            ? `${row.message} (sent: ${row.timestamp.toLocaleString('en-US', { timeZone: userTimezone })})`
            : row.shortened || row.message,
    }));
}

async function loadMessagesYesterday(userId) {

    // Load moment
    const moment = require('moment-timezone');

    // 從資料庫獲取使用者的時區
    const userTimezone = await getUserTimezone(userId); // 從資料庫獲取使用者的時區
    console.log('userTimezone:', userTimezone);

    // 將今天的開始時間設定為凌晨五點: Output a moment object: Moment<2023-10-29T05:00:00+08:00>
    let now = moment().tz(userTimezone);

    let yesterdayStart;
    let yesterdayEnd;
    if (now.hour() >= 0 && now.hour() < 5) {
        // 如果現在時間在凌晨 1 點到 5 點之間，獲取前天早上 5 點的時間
        yesterdayStart = now.subtract(2, 'days').hours(5).minutes(0).seconds(0);
        yesterdayEnd = now.subtract(1, 'days').hours(5).minutes(0).seconds(0);
    } else {
        // 否則，獲取昨天早上 5 點的時間
        yesterdayStart = now.subtract(1, 'days').hours(5).minutes(0).seconds(0);
        yesterdayEnd = moment().hours(5).minute(0).second(0);
    }

    console.log('diary start:', yesterdayStart.toString()); // 這將輸出昨天早上 5 點的時間
    console.log('diary end:', yesterdayEnd.toString()); // 這將輸出昨天早上 5 點的時間

    const queryLimit = 500;

    // 查詢今天的消息
    let todayMessages = await db.query(`
        SELECT * FROM (
            SELECT id, role, message, shortened, timestamp
            FROM messages
            WHERE uid = $1
            AND role = 'user'
            AND timestamp >= $2
            AND timestamp <= $3
            ORDER BY id DESC
            LIMIT $4
        ) AS subquery
        ORDER BY ID ASC;
    `, [userId, yesterdayStart.format(), yesterdayEnd.format(), queryLimit]);

    //console.log('todayMessages for diary:', todayMessages);
    console.log('todayMessages.rowCount:', todayMessages.rowCount);

    return todayMessages.rows.map(row => ({
        role: row.role,
        content: row.role === 'user'
            ? `${row.message} (sent: ${row.timestamp.toLocaleString('en-US', { timeZone: userTimezone })})`
            : row.shortened || row.message,
    }));
}


/*
 * save diary to db
 * 
 */
async function storeDiary(uid, timestamp, local_timestamp, diary, mood, mood_score) {
    const text = 'INSERT INTO diaries(uid, timestamp, local_timestamp, diary, mood, mood_score) VALUES($1, $2, $3, $4, $5, $6) RETURNING *';
    const values = [uid, timestamp, local_timestamp, diary, mood, mood_score];
    try {
        const res = await db.query(text, values);
        console.log('Saving diary:');
        console.log(res.rows[0]);
    } catch (err) {
        console.error(err.stack);
    }
}


/*
 * load diary from db
 * 
 */
async function loadDiaryBuffer(userId, amount) {

    const userTimezone = await getUserData(userId, 'timezone');
    console.log('loadDiaryBuffer userTimezone:', userTimezone);
    
    const interval = `${amount} days`;
    const diaries = await db.query(`
        WITH AdjustedDiaries AS (
            SELECT *,
                   CASE
                       WHEN EXTRACT(HOUR FROM (timestamp AT TIME ZONE $2)) < 5 THEN (timestamp AT TIME ZONE $2)::DATE - INTERVAL '1 day'
                       ELSE (timestamp AT TIME ZONE $2)::DATE
                   END AS adjusted_date
            FROM diaries
            WHERE timestamp >= (CURRENT_DATE AT TIME ZONE $2 - INTERVAL '${interval}') + INTERVAL '5 hour'
              AND timestamp < ((CURRENT_DATE AT TIME ZONE $2) + INTERVAL '1 day') + INTERVAL '5 hour'
              AND uid = $1
        ), RankedDiaries AS (
            SELECT *,
                   ROW_NUMBER() OVER (PARTITION BY adjusted_date ORDER BY timestamp DESC) AS rn
            FROM AdjustedDiaries
        )
        SELECT *
        FROM RankedDiaries
        WHERE rn = 1;
    `, [userId, userTimezone]);

    // 這個查詢進行了以下操作：
    // AdjustedDiaries CTE 將每條記錄的 UTC timestamp 轉換為用戶的本地時區時間，然後根據本地時間來決定是否將記錄的日期減去一天（對於早上 5 點之前的時間戳記）。
    // 查詢範圍被設定為從用戶時區的當前日期減去 5 天，從那一天的早上 5 點開始，到用戶時區的當前日期的隔天早上 5 點結束。
    // 進一步篩選出 uid 等於 userId 的記錄。
    // RankedDiaries CTE 使用 adjusted_date 分組，然後按照每組內的 timestamp 降序排序，並分配行號。
    // 最後，選出每組中行號為 1 的記錄，即在指定時區下每天最後一篇日記。
    // 請確保替換查詢中的 userTimezone 和 userId 為實際的用戶時區和用戶 ID 變數。如果 timestamp 已經是本地時間，則無需轉換時區。
    
    //console.log(diaries.rows);
    return diaries.rows.map(row => ({
        role: 'user',
        content: row.diary
    }));
}

/*
 * load today's diary from db
 * 
 */
async function loadLastDiary(userId) {
    // 獲取今天的日期
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // 查詢今天的日記
    const diaries = await db.query(`
        SELECT * FROM (
            SELECT 
                *,
                ROW_NUMBER() OVER (PARTITION BY date(timestamp) ORDER BY timestamp DESC) as rn
            FROM diaries
            WHERE uid = $1 AND date(timestamp) = $2
            ) as subquery
        WHERE rn = 1;
    `, [userId, todayStr]);

    // 如果今天的日記存在，則返回日記內容，否則返回空陣列
    if (diaries.rows.length > 0) {
        return diaries.rows.map(diary => ({
            role: 'user',
            content: diary.diary,
        }));
    } else {
        return [];
    }
}

async function loadDiariesToday(userId) {

    // Load moment
    const moment = require('moment-timezone');

    // 從資料庫獲取使用者的時區
    const userTimezone = await getUserTimezone(userId); // 從資料庫獲取使用者的時區
    //console.log('userTimezone:', userTimezone);

    // 將今天的開始時間設定為凌晨五點: Output a moment object: Moment<2023-10-29T05:00:00+08:00>
    const today5AM = moment().tz(userTimezone).hours(5).minute(0).second(0).format();
    //console.log('today5AM:', today5AM);

    // 查詢今天早上五點之後的所有日記
    const diaries = await db.query(`
        SELECT * FROM (
            SELECT * FROM diaries
            WHERE uid = $1 AND timestamp >= $2
            ORDER BY id DESC
            LIMIT 20
            ) as subquery
        ORDER BY id ASC
    `, [userId, today5AM]);
    //console.log('diaries:', diaries);

    // 如果今天早上五點之後的日記存在，則返回所有日記內容，否則返回空陣列
    if (diaries.rows.length > 0) {
        return diaries.rows.map(diary => ({
            role: 'user',
            content: diary.diary,
        }));
    } else {
        return [];
    }
}

/*
 * save answers from /start and /intro to db
 * 
 */
async function storeAnswers(uid, answers, field) {
    const userExistenceQuery = 'SELECT uid, intro FROM users WHERE uid = $1';
    const userExistenceResult = await db.query(userExistenceQuery, [uid]);

    let introData = {};

    if (userExistenceResult.rows.length === 0) {
        const insertUserQuery = 'INSERT INTO users(uid) VALUES($1)';
        await db.query(insertUserQuery, [uid]);
    } else {
        const existingIntro = userExistenceResult.rows[0].intro;
        introData = existingIntro ? JSON.parse(existingIntro) : {};
    }

    if (field === 'lang' || field === 'location' || field === 'timezone') {
        if (answers[field] !== '' && answers.hasOwnProperty(field)) {
            const updateQuery = `UPDATE users SET ${field} = $2 WHERE uid = $1 RETURNING *`;
            const values = [uid, answers[field]];
    
            try {
                const res = await db.query(updateQuery, values);
                console.log(`Saving ${field}...`);
                console.log(res.rows[0]);
            } catch (err) {
                console.error(err.stack);
            }
    
            // Update the field in introData as well
            introData[field] = answers[field];
            //delete answers[field];
        } 
    } else {
        introData = { ...introData, ...answers };

        const introUpdateQuery = 'UPDATE users SET intro = $2 WHERE uid = $1 RETURNING *';
        const introValues = [uid, JSON.stringify(introData)];
    
        try {
            const res = await db.query(introUpdateQuery, introValues);
            console.log(`Saving answers to intro...`);
            console.log(res.rows[0]);
        } catch (err) {
            console.error(err.stack);
        }
    }    
}

/*
 * load answers from db
 * 
 */
async function loadAnswers(userId) {
    const user = await db.query(`
        SELECT intro FROM users
        WHERE uid = $1;
    `, [userId]);

    if (user.rows.length === 0) {
        return {};
    }

    const intro = user.rows[0].intro;
    if (!intro) {
        return {};
    }

    return JSON.parse(intro);
}

module.exports = {
    db,
    getUserTimezone,
    getUserLang,
    getUserData,
    storeUserData,
    storeMessage,
    loadMessageBuffer,
    loadMessagesToday,
    loadUserMessagesToday,
    loadLastDiary,
    storeDiary,
    loadDiaryBuffer,
    loadDiariesToday,
    storeAnswers,
    loadAnswers,
    checkUserExists,
    addNewUser,
    loadMessagesYesterday
};