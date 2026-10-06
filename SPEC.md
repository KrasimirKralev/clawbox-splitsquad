# SplitSquad

## Purpose
SplitSquad lets a group of friends log shared trip expenses and see the balances right away.
It shows who owes whom using as few payments as possible, so everyone can settle up quickly.

## Features
- **People:** add or remove trip members by name. Duplicate and blank names are rejected. A person who appears in an expense can't be removed.
- **Expenses:** add an expense with a description, an amount, who paid, and who shares it (everyone by default, or tick specific people). Expenses can be deleted.
- **Balances:** each person's net balance (paid minus share), shown in green for positive and red for negative. All amounts are calculated in integer cents so nothing is lost to rounding.
- **Settle up:** a short list of payments in the form "A → B: $X". It uses greedy matching (biggest debtor pays biggest creditor), so it never needs more than n−1 payments.
- **Export CSV:** downloads the current expenses and final settlement as `splitsquad.csv`, with USD amounts to two decimal places and escaped text fields (text starting with `=`, `+`, `-`, `@` is prefixed with `'` so spreadsheets do not run it as a formula). Empty sections retain their headers.
- **Persistence:** everything is saved to localStorage automatically and restored on reload. A "Reset trip" button clears it after a confirmation.
- **Totals:** the total trip spend and the cost per person are shown at the top.

## UI notes
- Mobile-first, single column, max width about 480px and centred on desktop. Tap targets are at least 44px.
- Modern card layout: soft shadows, 16px rounded corners, system font stack, and one accent colour (teal/indigo gradient header).
- Three stacked cards: **People** (chips with a × button), **Expenses** (form plus list), **Settle up** (payment rows with arrows).
- Empty states give friendly hints, e.g. "Add at least 2 people to start".
- Supports dark mode through `prefers-color-scheme`. Inputs have visible focus rings and every control has an accessible label.

## Acceptance criteria
1. `splitExpense(1000, ['A','B','C'])` returns shares that add up to exactly 1000 cents. They are 334/333/333, with leftover cents going to the first participants in a fixed order.
2. `computeBalances(people, expenses)` returns balances that always sum to 0. For example, A pays 3000 for A, B and C, which gives A: +2000, B: −1000, C: −1000.
3. `settle(balances)` returns transfers that bring every balance to 0. There are never more than n−1 of them, and every amount is a positive integer.
4. When everyone is already even, `settle` returns an empty array. A two-person debt produces exactly one transfer.
5. An expense shared only by a subset of people (e.g. B and C) does not change the balance of anyone outside that subset.
6. In the UI, adding 3 people and one $30 expense paid by the first person immediately shows two "→ $10.00" payments in Settle up.
7. Reloading the page keeps the same people, expenses and payments. Clicking "Reset trip" and confirming clears all of them.
8. Invalid input is rejected with an inline message: an amount ≤ 0 or not a number, no participants selected, or a blank or duplicate name.

## Tech constraints
- Static site, files `index.html` + `style.css` + `app.js` + `logic.js`.
- Pure functions in `logic.js` as an ES module usable from Node.
- No build step, no CDN frameworks, no API keys.
- Tests in `tests/logic.test.mjs` using `node:test` + `node:assert`.
- Data persisted in localStorage if needed.
