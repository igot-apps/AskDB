# AskDB

Talk to your PostgreSQL database in plain English. A simple Windows desktop app built for beginners.

- Ask questions in plain English (or by voice) and get answers, tables and charts
- Switch between several saved databases
- Pick the AI model (via [OpenRouter](https://openrouter.ai))
- Read-only by default; every change needs your confirmation, and each database can be locked to read-only

## Install
Download **AskDB Setup.exe** from the [Releases](../../releases) page, double-click it, then paste your OpenRouter key and database link.
(If Windows warns you, click **More info → Run anyway**.)

## Develop
```bash
npm install
npm start        # run the app
npm run dist     # build the Windows installer into dist/
```
Optional: copy `.env.example` to `.env` to pre-fill your key and database link.

## Web version
The browser version lives in a separate repo: [AskDB-web](https://github.com/igot-apps/AskDB-web).
