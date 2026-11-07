# Home Hub – demo

A household app: budget (pay, buckets, bills, sorting bank transactions), calendar, to-dos, groceries, chores,
house projects, car, insurance, church rosters, workouts and more – one place for a family to run the house.

This is the **public demo copy**. It starts filled with sample data, **resets every night**, and has the outside
connections (bank feed, Telegram bot, phone notifications, calendar imports) switched off. Nothing in it is real –
add, change and delete anything you like.

- The people are called **Default Name** – rename them in **Settings → Family members**.
- Built with Next.js, React, Tailwind and SQLite (Node's built-in `node:sqlite`).

## Run it yourself

```bash
npm ci
npm run dev          # http://localhost:3000 – your own copy, empty
```

Demo mode (sample data, nightly reset, outside connections off) is switched on with `HOME_HUB_DEMO=1`.
