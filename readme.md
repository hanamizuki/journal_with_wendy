# Overview
Journal with Wendy is my personal project to help myself recover from a serious burnt-out from my job. I have anxiety issues during burnt-out and I can't focus when it happens, and I need a place where I can pour my thoughts and feelings safely.

# Who is Wendy?
It's inspired by Wendy Rhodes from the series "Billions". She's a performance coach in Axe's trading firm who constantly brings motivations and consolations to the traders. I've always wanted someone like Wendy in my workplace who can help me perform better.

# What does this do?
It's a telegram bot where you can send messages any time, and she responds like Wendy. There are also a "Therapy mode" where the response will be longer. And by the end of the day, you can generate a diary entry to summarize your day.

Telegram bot commands:
- /diary: generate today's diary
  - this will read your messages from 5am until now and summarize into a diary entry
  - you can use /diary multiple times in a day, but only the last one will be recorded as the official diary of the day when you want to read later
- /ytd: generate yesterday's diary
  - this is when you want to generate yesterday's diary entry.
  - the definition of the "day" is between 5am to 5am, meaning if you use this before 5am and after 12am, you will be generating the diary entry the day before
- /read: read the diary
  - this will call recent diary for you to read
- /therapy: turn on/off the therapy mode
  - there are 3 therapists: Wendy, Harry and Branden. They have different prompt and different styles, try and see which you like the best
  - the response will be longer and more thoughtful than normal mode
- /intro: input personal info
  - you can enter your age, job and other info for the AI to have some background info about you, this help the AI to respond better
  - the info will be part of the prompt in all messages you send
- /settings: timezone and language setup
  - you can setup timezone so the time can work correctly when you generate the diaries
  - this also works for AI when it sends greetings
  - you are suppose to be able to use any languages when you chat with AI, the language options here is only for system message or menu items.




# Tech Stack
This project uses the following services and projects:
- node.js
- OpenAI API 
- Telegram API
- Telegraf
- Airtable
- Heroku

# Demo
Add this telegram bot:
@journal_with_wendy_bot
https://t.me/journal_with_wendy_bot


