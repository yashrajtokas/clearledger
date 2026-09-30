# ClearLedger

**See what a money choice really costs before you make it.**

ClearLedger is a one-page financial decision dashboard. Pick an everyday money decision, enter a few numbers, and it plays both options forward month by month. You get the answer in plain words, a chart of how the two paths separate over time, a ledger of where every rupee goes, and every assumption laid out in the open.

> Educational estimates only. ClearLedger is not financial, tax or legal advice.

---

## The problem

Most people make money decisions from a single number on a banner: *"No-cost EMI!"*, *"Minimum due: ₹6,000"*. The real cost sits in the difference between two paths over time, and that difference is hard to picture.

- A credit card at 36% a year feels abstract. Learning that paying only the minimum (while saving the rest) means about **₹42,000 more in interest** over two years is not.
- A "no-cost" EMI often drops a cash discount and adds a processing fee, so it quietly costs more than paying in full.

Existing calculators tend to answer only one side ("what is my EMI?") and hide their maths. ClearLedger compares **two choices side by side**, shows **why** one wins, and shows **what would have to change** for the other to win.

**Who it's for:** someone who is financially careful but not a finance expert, making a decision this week, often on a phone.

## What it does

| Decision | Option A | Option B | Compared on |
|---|---|---|---|
| Pay off debt or save? | Put all spare money on the debt until it's gone | Pay the minimum, save the rest | Net position: savings minus what's still owed |
| Pay in full or in instalments? | Pay today (with any full-payment discount) | Pay a fee plus a monthly EMI, keep the cash earning interest | Net position: money left minus what's still owed on the plan |

For each decision the page shows:

1. **A verdict in one sentence**, e.g. "Clear the debt first leaves you ₹37,276 better off."
2. **The reason, written from your numbers**, e.g. "Your debt charges 36% a year; your savings earn 5.6% after tax…"
3. **A month-by-month chart** with hover and keyboard read-out, plus the full table behind it.
4. **A ledger** of money in, interest charged, interest earned, fees, and the total.
5. **What could change this result?** Sliders for interest rates, time period and monthly amount, a sensitivity chart showing which assumption matters most, and the **tipping point** where the winner flips.
6. **The assumptions**, filled in with your numbers, and **How this works** in everyday language.

## Run it locally

No build step, no sign-in, no backend. Nothing you type leaves your browser.

**Option 1: just open it**

Double-click `index.html`. It works straight from the file system.

**Option 2: run a local server** (needs Node.js 18+)

```bash
npm start          # serves the folder at http://localhost:5173
```

**Run the tests**

```bash
npm test           # or: node calc.test.js
```

The tests check the EMI formula against a known value, that money is conserved in every simulation, that the winner flips in the expected direction, and that the break-even point is where the maths says it should be.

## Project structure

```
clearledger/
├── index.html      Page structure and the static "How this works" copy
├── styles.css      Design tokens (light + dark), layout, components
├── calc.js         Pure calculation engine: no DOM, runs in browser and Node
├── app.js          State, validation, formatting and rendering
├── calc.test.js    Dependency-free tests for calc.js
└── package.json    `npm start` and `npm test`
```

The split is deliberate: **`calc.js` is the only place maths happens.** The interface asks it for numbers and draws them. The same file is loaded by the page and by the tests, so the tested code is the shipped code.

Scenarios are described as **data** in `app.js` (fields, limits, example values, which fields become sliders, wording). Adding a third comparison means adding one config entry and one function in `calc.js`.

## How the calculations work

- **Month-by-month simulation.** Rather than one closed-form formula, each option is stepped through every month: add interest to what you owe and what you've saved, then move that month's money. The table under the chart is exactly what the chart plots.
- **Monthly rates.** Yearly rate ÷ 12. A 36% card charges 3% a month. Savings are reduced by the tax rate first (7% with 20% tax = 5.6%).
- **EMI.** The standard amortisation formula: `EMI = P × r × (1 + r)^n ÷ ((1 + r)^n − 1)`, with `P` the price, `r` the monthly rate and `n` the number of months.
- **Fair comparison over time.** Both scenarios compare *net position* (what you have minus what you still owe), so an option isn't made to look better mid-way just because its payments come later.
- **Tipping points.** Bisection search: try the middle of a range, see which option wins, halve the range towards the switch, repeat 60 times. For debt vs savings this lands exactly on `debt rate ÷ (1 − tax rate)`, which the tests confirm.
- **Sensitivity.** Each lever is nudged down and up by a realistic amount (e.g. ±3 points on a savings rate, ±25% on the monthly amount) with everything else fixed. Bars are sorted so the assumption that moves the result most is at the top.

## Design choices

- **A ledger, not a banking template.** The visual language comes from accounting ledgers: a red double margin rule, faint blue row rules, and the accountant's double underline under totals. It signals "careful bookkeeping" rather than "sales page".
- **Answer first, detail after.** The verdict sentence sits at the top of the result, then the reason, then the chart, then the ledger. People who only read one line still get the answer.
- **Plain language everywhere.** "Net position" is always explained as "what you've saved minus what you still owe". Error messages say what to type ("Use whole months, like 12"), not just that something is wrong.
- **Accessible colour.** The two option colours were checked with a colour-vision-deficiency validator in both light and dark themes. Colour is never the only signal: Option B's line is dashed, every mark carries an A/B badge, the chart has direct labels and a data table, and the chart can be read with arrow keys.
- **Trust through transparency.** Every result carries the "educational estimate" label, the assumptions list uses the person's own numbers, and the limitations are stated rather than buried.
- **Honest empty and error states.** Clearing the form shows exactly which fields are missing (each one a link to the field) and a one-click way back to the example.
- **Realistic example data.** Indian credit cards commonly charge 36–42% a year; fixed deposits pay around 7%; EMI plans often carry a processing fee and drop a full-payment discount. The examples reflect that. Currency can be switched to $, € or £ (symbols only, no conversion).
- **Responsive and theme-aware.** One column on phones, two on larger screens, and full light and dark themes.

## Limitations

- Rates are fixed for the whole period. Real card rates, deposit rates and floating loans change.
- The minimum payment is fixed. Real cards usually lower it as the balance falls, which makes the "save first" path even slower to clear the debt.
- No late fees, penalty rates, inflation, tax on fees or interest (e.g. GST on card EMIs), or credit-score effects.
- One debt at a time. It doesn't compare multiple cards (avalanche vs snowball).
- It assumes discipline: money "kept in savings" really stays there.
- It values only money. The comfort of an emergency fund is real and isn't priced in.

## What I'd improve next

1. **Emergency-fund guardrail:** a "keep at least ₹X in savings" rule, since clearing debt with every rupee can leave someone exposed.
2. **Multiple debts:** avalanche (highest rate first) vs snowball (smallest balance first).
3. **Inflation-adjusted view** and a toggle for "today's money".
4. **Shareable scenarios** via a link that encodes the inputs, so a user can send a comparison to a partner or adviser.
5. **Localisation of rules** such as GST on EMI interest in India or tax-advantaged accounts elsewhere.
6. **Usability testing** with five to eight target users to see whether the verdict sentence and the tipping point change what they would actually do.

## Talking about this project in an interview

- **User problem:** people compare money choices using one headline number, and the real cost only shows up over time.
- **Key product decision:** compare two paths, not one calculation, and lead with a sentence rather than a chart.
- **Trade-off made visible:** the tipping point turns "it depends" into a specific number ("saving wins only if your savings earn more than 45% a year").
- **Trust:** assumptions with the user's own numbers, visible limitations, and an explicit "not advice" label.
- **Engineering hygiene:** pure calculation module, tests that check conservation of money and known formula values, data-driven scenario config.
- **Success metrics I'd track in a real product:** share of users who reach a verdict, how often "What could change" is used, and whether users report a decision they're more confident in.
- **What I'd add for real-world use:** the guardrails and features listed above, plus review of the assumptions by a qualified financial professional and clear regulatory disclaimers for each market.

---

Built with plain HTML, CSS and JavaScript. No frameworks, no tracking, no data leaves the browser.

**Author:** Yashraj Tokas · © 2026 Yashraj Tokas. All rights reserved. You may view and run this project to evaluate it; please ask before reusing the code or design.
