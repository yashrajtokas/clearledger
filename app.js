/*
 * ClearLedger — interface
 * -----------------------
 * Reads the inputs, validates them, asks calc.js for the numbers,
 * and draws the result. All maths lives in calc.js; this file only
 * handles state, validation, formatting and rendering.
 *
 * Structure
 *   1. Configuration   – currencies and the two scenarios (fields, levers, wording)
 *   2. State           – current scenario, raw field values, baseline for "what if"
 *   3. Formatting      – money, percentages, dates
 *   4. Validation      – per-field rules plus cross-field checks
 *   5. Rendering       – form, results, chart, ledger, what-if, assumptions
 *   6. Events & boot
 */
(function () {
  'use strict';

  var calc = window.ClearLedgerCalc;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  /* ================================================================ */
  /* 1. Configuration                                                  */
  /* ================================================================ */

  var CURRENCIES = {
    INR: { locale: 'en-IN', label: '₹ INR' },
    USD: { locale: 'en-US', label: '$ USD' },
    EUR: { locale: 'en-IE', label: '€ EUR' },
    GBP: { locale: 'en-GB', label: '£ GBP' }
  };

  /*
   * Each scenario is described as data. Adding a third comparison means
   * adding one more entry here plus a compute function in calc.js.
   *
   * Field kinds: money (whole currency units), pct (percent), months (whole months).
   * A field with `lever` also appears in "What could change this result?".
   *   lever.delta      – absolute step used for the sensitivity check
   *   lever.deltaPct   – relative step (for money)
   *   lever.rel        – slider range relative to the baseline value (for money)
   */
  var SCENARIOS = {
    debt: {
      tab: 'Pay off debt or save?',
      intro: 'You owe money on a card or loan and have some spare cash each month. Should that cash clear the debt first, or go into savings while you pay the minimum?',
      a: { name: 'Clear the debt first', short: 'Debt first' },
      b: { name: 'Save, pay the minimum', short: 'Save first' },
      chart: { title: 'Net position each month', sub: 'What you have saved minus what you still owe' },
      groups: [
        { title: 'The debt', fields: ['debt', 'debtApr', 'minPayment'] },
        { title: 'Your money', fields: ['monthly', 'saveApr', 'taxPct'] },
        { title: 'Time', fields: ['months'] }
      ],
      fields: {
        debt: { label: 'Amount you owe', hint: 'The balance today, for example on a credit card.', kind: 'money', min: 1, max: 1e9, example: 120000 },
        debtApr: { label: 'Debt interest rate', hint: 'Yearly rate (APR). Credit cards in India often charge 36–42% a year.', kind: 'pct', min: 0, max: 100, example: 36,
          lever: { label: 'Debt interest rate', min: 0, max: 60, step: 0.5, delta: 6 } },
        minPayment: { label: 'Minimum monthly payment', hint: 'The least the lender asks for each month.', kind: 'money', min: 1, max: 1e9, example: 6000 },
        monthly: { label: 'Money you can put aside each month', hint: 'The total for debt and savings together.', kind: 'money', min: 1, max: 1e9, example: 15000,
          lever: { label: 'Monthly amount', rel: [0.25, 3], stepRel: 0.05, deltaPct: 25, minFrom: 'minPayment' } },
        saveApr: { label: 'Savings interest rate', hint: 'Yearly rate before tax, for example a fixed deposit.', kind: 'pct', min: 0, max: 50, example: 7,
          lever: { label: 'Savings interest rate', min: 0, max: 15, step: 0.25, delta: 3 } },
        taxPct: { label: 'Tax on interest earned', hint: 'Your tax rate on savings interest. Use 0 if none.', kind: 'pct', min: 0, max: 60, example: 20,
          lever: { label: 'Tax on interest', min: 0, max: 40, step: 1, delta: 10 } },
        months: { label: 'Compare over', hint: 'How far ahead to look, in months (up to 120).', kind: 'months', min: 1, max: 120, example: 24,
          lever: { label: 'Time period', min: 3, max: 120, step: 1, delta: 12 } }
      },
      crossCheck: function (v) {
        var errors = {};
        if (v.minPayment != null && v.monthly != null && v.minPayment > v.monthly) {
          errors.minPayment = 'The minimum payment can’t be more than the money you put aside each month (' + fmtMoney(v.monthly) + '). Lower it, or raise the monthly amount.';
        }
        return errors;
      },
      compute: function (v) { return calc.debtVsSave(v); }
    },

    buy: {
      tab: 'Pay in full or in instalments?',
      intro: 'You are buying something and the shop offers monthly instalments (an EMI or “buy now, pay later”). Is it cheaper to pay in full today, or spread the cost and keep your cash earning interest?',
      a: { name: 'Pay in full today', short: 'Pay in full' },
      b: { name: 'Pay in instalments', short: 'Instalments' },
      chart: { title: 'Net position each month', sub: 'Money left from what you set aside, minus what you still owe on the plan' },
      groups: [
        { title: 'The purchase', fields: ['price', 'discountPct'] },
        { title: 'The instalment plan', fields: ['emiApr', 'months', 'fee'] },
        { title: 'Your savings', fields: ['saveApr', 'taxPct'] }
      ],
      fields: {
        price: { label: 'Price', hint: 'The sticker price of the item.', kind: 'money', min: 1, max: 1e9, example: 72000 },
        discountPct: { label: 'Discount for paying in full', hint: 'Many “no-cost EMI” offers quietly drop a cash discount. Use 0 if none.', kind: 'pct', min: 0, max: 90, example: 3,
          lever: { label: 'Full-payment discount', min: 0, max: 15, step: 0.5, delta: 3 } },
        emiApr: { label: 'Instalment interest rate', hint: 'Yearly rate. Use 0 for a true “no-cost” plan.', kind: 'pct', min: 0, max: 100, example: 16,
          lever: { label: 'Instalment interest rate', min: 0, max: 36, step: 0.5, delta: 6 } },
        months: { label: 'Number of monthly instalments', hint: 'Common plans run 3 to 24 months.', kind: 'months', min: 1, max: 60, example: 12,
          lever: { label: 'Number of instalments', min: 3, max: 36, step: 1, delta: 6 } },
        fee: { label: 'One-off processing fee', hint: 'Charged when the plan starts. Use 0 if none.', kind: 'money', min: 0, max: 1e9, example: 499 },
        saveApr: { label: 'Savings interest rate', hint: 'What the set-aside money would earn, before tax.', kind: 'pct', min: 0, max: 50, example: 7,
          lever: { label: 'Savings interest rate', min: 0, max: 15, step: 0.25, delta: 3 } },
        taxPct: { label: 'Tax on interest earned', hint: 'Your tax rate on savings interest. Use 0 if none.', kind: 'pct', min: 0, max: 60, example: 20,
          lever: { label: 'Tax on interest', min: 0, max: 40, step: 1, delta: 10 } }
      },
      crossCheck: function (v) {
        var errors = {};
        if (v.fee != null && v.price != null && v.fee >= v.price) {
          errors.fee = 'The fee should be less than the price (' + fmtMoney(v.price) + ').';
        }
        return errors;
      },
      compute: function (v) { return calc.payNowVsSpread(v); }
    }
  };

  var FIELD_ORDER = {};
  Object.keys(SCENARIOS).forEach(function (key) {
    FIELD_ORDER[key] = SCENARIOS[key].groups.reduce(function (all, g) { return all.concat(g.fields); }, []);
  });

  /* ================================================================ */
  /* 2. State                                                          */
  /* ================================================================ */

  var state = {
    mode: 'debt',
    currency: 'INR',
    raw: {},       // raw text per scenario per field, exactly as typed
    baseline: {},  // last numbers the person entered in the form (for "what if" comparisons)
    touched: {},   // fields the person has interacted with (errors show only after touch)
    usingExample: {}
  };

  Object.keys(SCENARIOS).forEach(function (key) {
    state.raw[key] = exampleRaw(key);
    state.baseline[key] = exampleValues(key);
    state.touched[key] = {};
    state.usingExample[key] = true;
  });

  function exampleValues(key) {
    var out = {};
    FIELD_ORDER[key].forEach(function (id) { out[id] = SCENARIOS[key].fields[id].example; });
    return out;
  }
  function exampleRaw(key) {
    var out = {};
    FIELD_ORDER[key].forEach(function (id) { out[id] = String(SCENARIOS[key].fields[id].example); });
    return out;
  }

  try {
    var saved = JSON.parse(localStorage.getItem('clearledger:prefs') || '{}');
    if (saved.mode && SCENARIOS[saved.mode]) state.mode = saved.mode;
    if (saved.currency && CURRENCIES[saved.currency]) state.currency = saved.currency;
  } catch (e) { /* storage unavailable: defaults are fine */ }

  function savePrefs() {
    try { localStorage.setItem('clearledger:prefs', JSON.stringify({ mode: state.mode, currency: state.currency })); } catch (e) { /* ignore */ }
  }

  /* ================================================================ */
  /* 3. Formatting                                                     */
  /* ================================================================ */

  function locale() { return CURRENCIES[state.currency].locale; }

  function fmtMoney(n, opts) {
    if (n == null || !isFinite(n)) return '—';
    if (Math.abs(n) < 0.5) n = 0;
    return new Intl.NumberFormat(locale(), Object.assign({
      style: 'currency', currency: state.currency, maximumFractionDigits: 0, minimumFractionDigits: 0
    }, opts || {})).format(n);
  }
  /** Short axis labels: ₹1.2L / ₹3Cr for rupees, $12K / $1.5M elsewhere. */
  function fmtMoneyCompact(n) {
    if (Math.abs(n) < 0.5) n = 0;
    var abs = Math.abs(n);
    var units = state.currency === 'INR'
      ? [[1e7, 'Cr'], [1e5, 'L'], [1e3, 'K']]
      : [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    var unit = units.find(function (u) { return abs >= u[0]; });
    var body = unit
      ? fmtPlain(Math.round((abs / unit[0]) * 10) / 10, 1) + unit[1]
      : fmtPlain(abs, 0);
    return (n < 0 ? '−' : '') + currencySymbol() + body;
  }
  function fmtSigned(n) {
    if (Math.abs(n) < 0.5) return fmtMoney(0);
    return (n > 0 ? '+' : '−') + fmtMoney(Math.abs(n));
  }
  function fmtPct(n, digits) {
    var d = digits == null ? 2 : digits;
    var s = new Intl.NumberFormat(locale(), { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(n);
    return s + '%';
  }
  function fmtPlain(n, digits) {
    return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits == null ? 2 : digits }).format(n);
  }
  function currencySymbol() {
    var parts = new Intl.NumberFormat(locale(), { style: 'currency', currency: state.currency }).formatToParts(0);
    var sym = parts.find(function (p) { return p.type === 'currency'; });
    return sym ? sym.value : state.currency;
  }
  function fmtFieldValue(field, n) {
    if (field.kind === 'money') return fmtPlain(n, 0);
    if (field.kind === 'months') return String(Math.round(n));
    return fmtPlain(n, 2);
  }
  function fmtLeverValue(field, n) {
    if (field.kind === 'money') return fmtMoney(n);
    if (field.kind === 'months') return plural(Math.round(n), 'month');
    return fmtPct(n);
  }
  function plural(n, word) { return fmtPlain(n, 0) + ' ' + word + (n === 1 ? '' : 's'); }

  var MONTH_FMT = null;
  function calendarMonth(offset) {
    if (!MONTH_FMT || MONTH_FMT.locale !== locale()) {
      MONTH_FMT = { locale: locale(), f: new Intl.DateTimeFormat(locale(), { month: 'short', year: 'numeric' }) };
    }
    var now = new Date();
    return MONTH_FMT.f.format(new Date(now.getFullYear(), now.getMonth() + offset, 1));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ================================================================ */
  /* 4. Validation                                                     */
  /* ================================================================ */

  /** Accepts "1,20,000", "₹15000", "36 %", " 7.5 ". Returns NaN for anything else. */
  function parseNumber(raw) {
    var cleaned = String(raw).replace(/[\s,₹$€£%]/g, '').replace(/[^0-9.\-]/g, function () { return 'x'; });
    if (cleaned === '' || /x/.test(cleaned) || (cleaned.match(/\./g) || []).length > 1) return NaN;
    return Number(cleaned);
  }

  function validateField(field, raw) {
    if (raw == null || String(raw).trim() === '') return { missing: true, message: 'Enter a number here.' };
    var n = parseNumber(raw);
    if (isNaN(n)) {
      return { message: field.kind === 'pct' ? 'Enter a percentage as a number, like 7.5.' : 'Enter a number, like ' + fmtPlain(field.example, 0) + '.' };
    }
    if (field.kind === 'months' && Math.round(n) !== n) return { message: 'Use whole months, like 12.' };
    if (n < field.min) {
      if (field.min === 0) return { message: 'This can’t be negative.' };
      return { message: field.kind === 'money' ? 'Enter an amount above zero.' : 'Enter at least ' + fmtPlain(field.min) + '.' };
    }
    if (n > field.max) {
      var max = field.kind === 'money' ? fmtMoney(field.max) : field.kind === 'pct' ? fmtPct(field.max) : plural(field.max, 'month');
      return { message: 'That’s higher than this tool handles. Keep it at or below ' + max + '.' };
    }
    return { value: n };
  }

  function validate(mode) {
    var sc = SCENARIOS[mode];
    var values = {};
    var errors = {};
    var missing = [];
    FIELD_ORDER[mode].forEach(function (id) {
      var res = validateField(sc.fields[id], state.raw[mode][id]);
      if (res.missing) missing.push(id);
      else if (res.message) errors[id] = res.message;
      else values[id] = res.value;
    });
    var cross = sc.crossCheck(values);
    Object.keys(cross).forEach(function (id) { if (!errors[id]) errors[id] = cross[id]; });
    return {
      values: values,
      errors: errors,
      missing: missing,
      ok: missing.length === 0 && Object.keys(errors).length === 0
    };
  }

  /* ================================================================ */
  /* 5a. Rendering — tabs and form                                     */
  /* ================================================================ */

  function renderCurrencyPicker() {
    var sel = $('#currency');
    sel.innerHTML = Object.keys(CURRENCIES).map(function (code) {
      return '<option value="' + code + '"' + (code === state.currency ? ' selected' : '') + '>' + CURRENCIES[code].label + '</option>';
    }).join('');
  }

  function renderTabs() {
    var host = $('#scenario-tabs');
    host.innerHTML = Object.keys(SCENARIOS).map(function (key, i) {
      var selected = key === state.mode;
      return '<button type="button" role="tab" id="tab-' + key + '" data-mode="' + key + '"' +
        ' aria-selected="' + selected + '" aria-controls="workspace" tabindex="' + (selected ? '0' : '-1') + '">' +
        '<span class="tab-index" aria-hidden="true">' + (i + 1) + '</span>' + escapeHtml(SCENARIOS[key].tab) + '</button>';
    }).join('');
  }

  function fieldId(id) { return 'f-' + state.mode + '-' + id; }

  function renderForm() {
    var sc = SCENARIOS[state.mode];
    $('#scenario-intro').textContent = sc.intro;
    var sym = currencySymbol();

    $('#inputs-form').innerHTML = sc.groups.map(function (group) {
      return '<fieldset class="field-group"><legend>' + escapeHtml(group.title) + '</legend>' +
        group.fields.map(function (id) {
          var f = sc.fields[id];
          var fid = fieldId(id);
          var raw = state.raw[state.mode][id];
          var shown = raw;
          var parsed = parseNumber(raw);
          if (raw !== '' && !isNaN(parsed)) shown = fmtFieldValue(f, parsed);
          var affix = f.kind === 'money'
            ? '<span class="affix affix-pre" aria-hidden="true">' + escapeHtml(sym) + '</span>'
            : '<span class="affix affix-post" aria-hidden="true">' + (f.kind === 'pct' ? '%' : 'months') + '</span>';
          return '<div class="field" data-field="' + id + '">' +
            '<label for="' + fid + '">' + escapeHtml(f.label) + '</label>' +
            '<div class="input-wrap kind-' + f.kind + '">' + affix +
            '<input id="' + fid + '" name="' + id + '" type="text" inputmode="' + (f.kind === 'pct' ? 'decimal' : 'numeric') + '"' +
            ' value="' + escapeHtml(shown) + '" aria-describedby="' + fid + '-hint ' + fid + '-error" spellcheck="false">' +
            '</div>' +
            '<p class="hint" id="' + fid + '-hint">' + escapeHtml(f.hint) + '</p>' +
            '<p class="error" id="' + fid + '-error" hidden></p>' +
            '</div>';
        }).join('') +
        '</fieldset>';
    }).join('');
  }

  function renderFieldErrors(result) {
    var touched = state.touched[state.mode];
    FIELD_ORDER[state.mode].forEach(function (id) {
      var input = document.getElementById(fieldId(id));
      var err = document.getElementById(fieldId(id) + '-error');
      if (!input || !err) return;
      var message = result.errors[id] || (touched[id] && result.missing.indexOf(id) !== -1 ? 'Enter a number here.' : '');
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
      input.closest('.field').classList.toggle('has-error', !!message);
      err.textContent = message;
      err.hidden = !message;
    });
    $('#example-note').hidden = !state.usingExample[state.mode];
  }

  /* ================================================================ */
  /* 5b. Rendering — results                                           */
  /* ================================================================ */

  function isTie(mode, v, r) {
    var scale = mode === 'debt' ? v.monthly * v.months : v.price;
    return Math.abs(r.gap) < Math.max(1, scale * 0.002);
  }

  function winnerOf(mode, v, r) {
    if (isTie(mode, v, r)) return null;
    return r.gap > 0 ? 'a' : 'b';
  }

  function optionBadge(key) {
    return '<span class="opt-badge opt-' + key + '" aria-hidden="true">' + key.toUpperCase() + '</span>';
  }

  function verdictHtml(mode, v, r) {
    var sc = SCENARIOS[mode];
    var w = winnerOf(mode, v, r);
    var after = plural(v.months, 'month');

    if (!w) {
      return '<p class="verdict-eyebrow">Result after ' + after + '</p>' +
        '<p class="verdict">It’s <em>roughly a tie</em>. Both options end within ' + fmtMoney(Math.abs(r.gap)) + ' of each other.</p>';
    }
    var winner = sc[w];
    return '<p class="verdict-eyebrow">Result after ' + after + '</p>' +
      '<p class="verdict">' + optionBadge(w) + ' <strong>' + escapeHtml(winner.name) + '</strong> leaves you ' +
      '<span class="verdict-amount">' + fmtMoney(Math.abs(r.gap)) + '</span> better off.</p>';
  }

  /** The "why" paragraph, written from the actual numbers. */
  function explanationHtml(mode, v, r) {
    var w = winnerOf(mode, v, r);
    var parts = [];

    if (mode === 'debt') {
      var afterTax = r.afterTaxSaveApr;
      parts.push('Your debt charges <strong>' + fmtPct(v.debtApr) + '</strong> a year (' + fmtPct(r.monthlyDebtRatePct) + ' a month). ' +
        'Your savings earn <strong>' + fmtPct(afterTax) + '</strong> a year after tax.');
      if (w === 'a') {
        parts.push('Each ' + escapeHtml(currencySymbol()) + '1 you send to the debt stops ' + fmtPct(v.debtApr) +
          ' interest from being charged. That is worth more than the ' + fmtPct(afterTax) + ' it would earn in savings.');
      } else if (w === 'b') {
        parts.push('Here the savings rate beats the cost of the debt, so keeping money in savings grows faster than the interest you pay on the balance.');
      } else {
        parts.push('The two rates cancel out, so where the money goes makes little difference.');
      }
      if (r.a.debtFreeMonth != null) {
        var bText = r.b.debtFreeMonth != null
          ? 'Saving first clears it in month ' + r.b.debtFreeMonth + '.'
          : 'Saving first still owes ' + fmtMoney(r.b.endDebt) + ' at the end.';
        parts.push('Debt first clears the balance in month ' + r.a.debtFreeMonth + ' (' + calendarMonth(r.a.debtFreeMonth) + '). ' + bText);
      } else {
        parts.push('Even with everything going to the debt, ' + fmtMoney(r.a.endDebt) + ' is still owed after ' + plural(v.months, 'month') + '.');
      }
    } else {
      var lostDiscount = v.price - r.upfront;
      var extraEarned = r.b.interestEarned - r.a.interestEarned;
      var costOfSpreading = r.b.interestPaid + v.fee + lostDiscount;
      parts.push('Spreading the cost adds <strong>' + fmtMoney(costOfSpreading) + '</strong>: ' +
        fmtMoney(r.b.interestPaid) + ' interest, ' + fmtMoney(v.fee) + ' in fees and ' + fmtMoney(lostDiscount) + ' of discount you give up.');
      parts.push('Keeping the cash in savings earns about <strong>' + fmtMoney(extraEarned) + '</strong> more over ' + plural(v.months, 'month') + ' at ' + fmtPct(r.afterTaxSaveApr) + ' after tax.');
      if (w === 'a') parts.push('The extra interest earned doesn’t cover the cost of spreading, so paying in full comes out ahead.');
      else if (w === 'b') parts.push('The interest earned outweighs the cost of spreading, so instalments come out ahead, as long as you really leave that money untouched.');
      if (v.emiApr === 0 && (v.fee > 0 || lostDiscount > 0)) {
        parts.push('Note: a “no-cost” plan still costs you the fee and any discount you give up.');
      }
    }
    return '<div class="explain">' + parts.map(function (p) { return '<p>' + p + '</p>'; }).join('') + '</div>';
  }

  function warningsHtml(mode, v, r) {
    var notes = [];
    if (mode === 'debt' && r.minimumTooLow) {
      notes.push('The minimum payment (' + fmtMoney(v.minPayment) + ') is less than one month’s interest (' +
        fmtMoney(v.debt * calc.monthlyRate(v.debtApr)) + '). Under “save first” the debt would grow every month, not shrink.');
    }
    if (mode === 'buy' && r.b.net < 0) {
      notes.push('With instalments you would need to add ' + fmtMoney(-r.b.net) + ' on top of the money you set aside.');
    }
    if (!notes.length) return '';
    return notes.map(function (n) {
      return '<p class="callout callout-warn"><span class="callout-label">Watch out</span> ' + n + '</p>';
    }).join('');
  }

  function factsHtml(mode, v, r) {
    var sc = SCENARIOS[mode];
    var rows;
    if (mode === 'debt') {
      rows = [
        ['Interest charged on the debt', fmtMoney(r.a.interestPaid), fmtMoney(r.b.interestPaid)],
        ['Debt-free by', r.a.debtFreeMonth != null ? 'Month ' + r.a.debtFreeMonth : 'Not yet', r.b.debtFreeMonth != null ? 'Month ' + r.b.debtFreeMonth : 'Not yet']
      ];
    } else {
      rows = [
        ['Total paid for the item', fmtMoney(r.a.totalPaid), fmtMoney(r.b.totalPaid)],
        ['Monthly payment', '—', fmtMoney(r.emi) + ' × ' + v.months]
      ];
    }
    return '<dl class="facts">' + rows.map(function (row) {
      return '<div class="fact"><dt>' + row[0] + '</dt>' +
        '<dd><span class="fact-val"><span class="dot dot-a" aria-hidden="true"></span><span class="visually-hidden">' + escapeHtml(sc.a.short) + ': </span>' + row[1] + '</span>' +
        '<span class="fact-val"><span class="dot dot-b" aria-hidden="true"></span><span class="visually-hidden">' + escapeHtml(sc.b.short) + ': </span>' + row[2] + '</span></dd></div>';
    }).join('') + '</dl>';
  }

  function ledgerHtml(mode, v, r) {
    var sc = SCENARIOS[mode];
    var rows;
    var total;
    if (mode === 'debt') {
      rows = [
        ['Money you put in', 'Same monthly amount for ' + plural(v.months, 'month'), r.a.moneyIn, r.b.moneyIn],
        ['Starting debt', 'What you owed on day one', -v.debt, -v.debt],
        ['Interest charged', 'Cost of the debt, month by month', -r.a.interestPaid, -r.b.interestPaid],
        ['Interest earned', 'Savings growth after tax', r.a.interestEarned, r.b.interestEarned]
      ];
      total = ['Net position', 'Saved minus still owed', r.a.net, r.b.net];
    } else {
      rows = [
        ['Money set aside', 'The price, kept in savings on day one', v.price, v.price],
        ['Paid today', 'Discounted price, or the plan fee', -r.upfront, -v.fee],
        ['Instalments', v.months + ' × ' + fmtMoney(r.emi), 0, -r.emi * v.months],
        ['Interest earned', 'On whatever is left, after tax', r.a.interestEarned, r.b.interestEarned]
      ];
      total = ['Left over', 'After the last instalment', r.a.net, r.b.net];
    }
    function cell(n) {
      var cls = n < -0.5 ? 'neg' : n > 0.5 ? 'pos' : 'zero';
      return '<td class="num ' + cls + '">' + fmtSigned(n).replace(/^\+/, '') + '</td>';
    }
    return '<div class="ledger-wrap"><table class="ledger">' +
      '<caption class="visually-hidden">Where the money goes under each option after ' + plural(v.months, 'month') + '</caption>' +
      '<thead><tr><th scope="col">Entry</th>' +
      '<th scope="col" class="num">' + optionBadge('a') + '<span>' + escapeHtml(sc.a.short) + '</span></th>' +
      '<th scope="col" class="num">' + optionBadge('b') + '<span>' + escapeHtml(sc.b.short) + '</span></th></tr></thead>' +
      '<tbody>' + rows.map(function (row) {
        return '<tr><th scope="row"><span class="entry-name">' + row[0] + '</span><span class="entry-note">' + escapeHtml(row[1]) + '</span></th>' + cell(row[2]) + cell(row[3]) + '</tr>';
      }).join('') + '</tbody>' +
      '<tfoot><tr><th scope="row"><span class="entry-name">' + total[0] + '</span><span class="entry-note">' + total[1] + '</span></th>' +
      cell(total[2]) + cell(total[3]) + '</tr></tfoot></table></div>';
  }

  function dataTableHtml(mode, v, r) {
    var sc = SCENARIOS[mode];
    var n = r.a.series.length - 1;
    var step = n <= 36 ? 1 : n <= 72 ? 3 : 6;
    var rows = [];
    for (var m = 0; m <= n; m += step) rows.push(m);
    if (rows[rows.length - 1] !== n) rows.push(n);
    return '<details class="data-table"><summary>Month-by-month numbers</summary><div class="table-scroll"><table>' +
      '<caption class="visually-hidden">' + escapeHtml(sc.chart.title) + ', by month</caption>' +
      '<thead><tr><th scope="col">Month</th><th scope="col" class="num">' + escapeHtml(sc.a.short) + '</th><th scope="col" class="num">' + escapeHtml(sc.b.short) + '</th><th scope="col" class="num">Difference</th></tr></thead><tbody>' +
      rows.map(function (m) {
        var a = r.a.series[m].value;
        var b = r.b.series[m].value;
        return '<tr><th scope="row">' + m + ' <span class="muted">' + calendarMonth(m) + '</span></th><td class="num">' + fmtMoney(a) + '</td><td class="num">' + fmtMoney(b) + '</td><td class="num">' + fmtSigned(a - b) + '</td></tr>';
      }).join('') + '</tbody></table></div></details>';
  }

  function emptyStateHtml(result) {
    var sc = SCENARIOS[state.mode];
    var missingNames = result.missing.map(function (id) {
      return '<li><button type="button" class="link-btn" data-focus="' + id + '">' + escapeHtml(sc.fields[id].label) + '</button></li>';
    }).join('');
    var errorCount = Object.keys(result.errors).length;
    var title = result.missing.length === FIELD_ORDER[state.mode].length
      ? 'Add your numbers to see the comparison'
      : result.missing.length ? 'A few numbers to go' : 'Check the highlighted numbers';
    return '<div class="empty">' +
      '<svg class="empty-art" viewBox="0 0 120 80" aria-hidden="true" focusable="false">' +
      '<rect x="8" y="6" width="104" height="68" rx="6" class="ea-sheet"></rect>' +
      '<line x1="24" y1="6" x2="24" y2="74" class="ea-margin"></line><line x1="27" y1="6" x2="27" y2="74" class="ea-margin"></line>' +
      '<line x1="36" y1="24" x2="100" y2="24" class="ea-rule"></line><line x1="36" y1="38" x2="100" y2="38" class="ea-rule"></line>' +
      '<line x1="36" y1="52" x2="100" y2="52" class="ea-rule"></line><line x1="70" y1="62" x2="100" y2="62" class="ea-total"></line><line x1="70" y1="65" x2="100" y2="65" class="ea-total"></line>' +
      '</svg>' +
      '<h3>' + title + '</h3>' +
      (result.missing.length
        ? '<p>ClearLedger needs every number to play both options forward. Still missing:</p><ul class="missing-list">' + missingNames + '</ul>'
        : '') +
      (errorCount ? '<p>' + (errorCount === 1 ? 'One number needs' : errorCount + ' numbers need') + ' a fix before the result can update. The message under each field says how.</p>' : '') +
      '<button type="button" class="btn btn-primary" data-action="example">Use the example numbers</button>' +
      '</div>';
  }

  function renderResults(result) {
    var host = $('#results');
    var mode = state.mode;
    if (!result.ok) {
      host.innerHTML = emptyStateHtml(result);
      return null;
    }
    var v = result.values;
    var r = SCENARIOS[mode].compute(v);
    var sc = SCENARIOS[mode];

    host.innerHTML =
      '<div class="balance-sheet">' +
        '<div class="verdict-block">' + verdictHtml(mode, v, r) + explanationHtml(mode, v, r) + warningsHtml(mode, v, r) + '</div>' +
        factsHtml(mode, v, r) +
        '<figure class="chart-figure">' +
          '<figcaption><span class="chart-title">' + escapeHtml(sc.chart.title) + '</span><span class="chart-sub">' + escapeHtml(sc.chart.sub) + '</span></figcaption>' +
          '<div class="legend" aria-hidden="true">' +
            '<span class="legend-item"><svg width="28" height="10"><line x1="1" y1="5" x2="27" y2="5" class="lg-a"></line></svg>' + optionBadge('a') + escapeHtml(sc.a.name) + '</span>' +
            '<span class="legend-item"><svg width="28" height="10"><line x1="1" y1="5" x2="27" y2="5" class="lg-b"></line></svg>' + optionBadge('b') + escapeHtml(sc.b.name) + '</span>' +
          '</div>' +
          '<div class="chart" id="chart"></div>' +
        '</figure>' +
        '<h3 class="ledger-title">Where the money goes</h3>' +
        ledgerHtml(mode, v, r) +
        dataTableHtml(mode, v, r) +
        '<div class="balance-foot"><p class="disclaimer">Educational estimate based on the numbers entered and the assumptions below. Not financial advice.</p>' +
        '<button type="button" class="btn btn-quiet" data-action="copy">Copy summary</button></div>' +
      '</div>';

    drawChart($('#chart'), mode, v, r);
    return { values: v, result: r };
  }

  /* ================================================================ */
  /* 5c. Rendering — chart (hand-built SVG, no library)                 */
  /* ================================================================ */

  var chartState = null;

  function niceStep(range, targetTicks) {
    var rough = range / Math.max(1, targetTicks);
    var pow = Math.pow(10, Math.floor(Math.log10(rough)));
    var n = rough / pow;
    var nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return nice * pow;
  }

  function drawChart(host, mode, v, r) {
    if (!host) return;
    var sc = SCENARIOS[mode];
    var width = Math.max(280, host.clientWidth || 600);
    var narrow = width < 520;
    var height = narrow ? 240 : 290;
    var m = { top: 14, right: narrow ? 14 : 104, bottom: 40, left: narrow ? 52 : 64 };
    var innerW = width - m.left - m.right;
    var innerH = height - m.top - m.bottom;

    var a = r.a.series, b = r.b.series;
    var n = a.length - 1;
    var values = a.concat(b).map(function (p) { return p.value; });
    var lo = Math.min.apply(null, values.concat([0]));
    var hi = Math.max.apply(null, values.concat([0]));
    if (hi - lo < 1) { hi += 1; lo -= 1; }
    var step = niceStep(hi - lo, narrow ? 4 : 5);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;

    var x = function (month) { return m.left + (n === 0 ? 0 : (month / n) * innerW); };
    var y = function (val) { return m.top + (1 - (val - lo) / (hi - lo)) * innerH; };

    var yTicks = [];
    for (var t = lo; t <= hi + step / 2; t += step) yTicks.push(t);

    var xSteps = [1, 2, 3, 6, 12, 24];
    var xStep = xSteps.find(function (s) { return n / s <= (narrow ? 5 : 8); }) || 24;
    var xTicks = [];
    for (var xm = 0; xm <= n; xm += xStep) xTicks.push(xm);

    function path(series) {
      return series.map(function (p, i) { return (i ? 'L' : 'M') + x(p.month).toFixed(1) + ' ' + y(p.value).toFixed(1); }).join(' ');
    }

    var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" role="img" aria-labelledby="chart-desc">' +
      '<desc id="chart-desc">' + escapeHtml(sc.chart.title) + '. ' + escapeHtml(sc.a.name) + ' ends at ' + fmtMoney(r.a.net) + '; ' +
      escapeHtml(sc.b.name) + ' ends at ' + fmtMoney(r.b.net) + ' after ' + plural(n, 'month') + '. Use the arrow keys to read each month.</desc>';

    // grid + y labels
    yTicks.forEach(function (tv) {
      var yy = y(tv);
      var isZero = Math.abs(tv) < step / 1000;
      svg += '<line x1="' + m.left + '" x2="' + (m.left + innerW) + '" y1="' + yy + '" y2="' + yy + '" class="' + (isZero ? 'c-zero' : 'c-grid') + '"></line>';
      svg += '<text x="' + (m.left - 8) + '" y="' + (yy + 4) + '" class="c-tick" text-anchor="end">' + escapeHtml(fmtMoneyCompact(tv)) + '</text>';
    });
    // x labels
    xTicks.forEach(function (xm) {
      svg += '<text x="' + x(xm) + '" y="' + (m.top + innerH + 18) + '" class="c-tick" text-anchor="middle">' + xm + '</text>';
    });
    svg += '<text x="' + (m.left + innerW / 2) + '" y="' + (height - 4) + '" class="c-axis-title" text-anchor="middle">Months from today</text>';

    // lines: B first so A (usually the story) sits on top
    svg += '<path d="' + path(b) + '" class="c-line c-line-b"></path>';
    svg += '<path d="' + path(a) + '" class="c-line c-line-a"></path>';

    // end points + direct labels (wide screens only; the legend covers narrow ones)
    var endA = y(r.a.net), endB = y(r.b.net);
    svg += '<circle cx="' + x(n) + '" cy="' + endB + '" r="4" class="c-end c-end-b"></circle>';
    svg += '<circle cx="' + x(n) + '" cy="' + endA + '" r="4" class="c-end c-end-a"></circle>';
    if (!narrow) {
      var la = endA, lb = endB;
      if (Math.abs(la - lb) < 30) {
        var mid = (la + lb) / 2;
        var aAbove = r.a.net >= r.b.net;
        la = mid + (aAbove ? -15 : 15);
        lb = mid + (aAbove ? 15 : -15);
      }
      [['a', la, r.a.net], ['b', lb, r.b.net]].forEach(function (d) {
        svg += '<text x="' + (x(n) + 10) + '" y="' + (d[1] - 1) + '" class="c-label-name">' + escapeHtml(sc[d[0]].short) + '</text>';
        svg += '<text x="' + (x(n) + 10) + '" y="' + (d[1] + 12) + '" class="c-label-val">' + escapeHtml(fmtMoneyCompact(d[2])) + '</text>';
      });
    }

    // hover layer
    svg += '<g class="c-hover" hidden><line class="c-cross" y1="' + m.top + '" y2="' + (m.top + innerH) + '"></line>' +
      '<circle r="5" class="c-dot c-dot-b"></circle><circle r="5" class="c-dot c-dot-a"></circle></g>';
    svg += '<rect class="c-hit" x="' + m.left + '" y="' + m.top + '" width="' + innerW + '" height="' + innerH + '"></rect>';
    svg += '</svg>';

    host.innerHTML = '<div class="chart-inner" tabindex="0">' + svg + '<div class="tooltip" hidden></div></div>';
    chartState = { host: host, mode: mode, r: r, x: x, y: y, n: n, width: width, m: m, innerW: innerW, current: null };
    wireChart();
  }

  function wireChart() {
    var cs = chartState;
    var inner = cs.host.querySelector('.chart-inner');
    var svg = inner.querySelector('svg');
    var hit = svg.querySelector('.c-hit');

    function monthFromEvent(evt) {
      var rect = svg.getBoundingClientRect();
      var px = (evt.clientX - rect.left) * (cs.width / rect.width);
      var frac = (px - cs.m.left) / cs.innerW;
      return Math.max(0, Math.min(cs.n, Math.round(frac * cs.n)));
    }
    hit.addEventListener('pointermove', function (e) { showMonth(monthFromEvent(e)); });
    hit.addEventListener('pointerdown', function (e) { showMonth(monthFromEvent(e)); });
    inner.addEventListener('pointerleave', function () { hideTooltip(); });
    inner.addEventListener('focus', function () { showMonth(cs.current == null ? cs.n : cs.current); });
    inner.addEventListener('blur', hideTooltip);
    inner.addEventListener('keydown', function (e) {
      var cur = cs.current == null ? cs.n : cs.current;
      if (e.key === 'ArrowLeft') { showMonth(Math.max(0, cur - 1)); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { showMonth(Math.min(cs.n, cur + 1)); e.preventDefault(); }
      else if (e.key === 'Home') { showMonth(0); e.preventDefault(); }
      else if (e.key === 'End') { showMonth(cs.n); e.preventDefault(); }
      else if (e.key === 'Escape') { hideTooltip(); }
    });
  }

  function showMonth(month) {
    var cs = chartState;
    if (!cs) return;
    cs.current = month;
    var sc = SCENARIOS[cs.mode];
    var inner = cs.host.querySelector('.chart-inner');
    var g = inner.querySelector('.c-hover');
    var tip = inner.querySelector('.tooltip');
    var a = cs.r.a.series[month].value;
    var b = cs.r.b.series[month].value;
    var xx = cs.x(month);
    g.hidden = false;
    var cross = g.querySelector('.c-cross');
    cross.setAttribute('x1', xx); cross.setAttribute('x2', xx);
    var da = g.querySelector('.c-dot-a'), db = g.querySelector('.c-dot-b');
    da.setAttribute('cx', xx); da.setAttribute('cy', cs.y(a));
    db.setAttribute('cx', xx); db.setAttribute('cy', cs.y(b));

    tip.innerHTML = '<p class="tt-head">Month ' + month + ' <span>' + calendarMonth(month) + '</span></p>' +
      '<p class="tt-row">' + optionBadge('a') + '<span class="tt-name">' + escapeHtml(sc.a.short) + '</span><span class="tt-val">' + fmtMoney(a) + '</span></p>' +
      '<p class="tt-row">' + optionBadge('b') + '<span class="tt-name">' + escapeHtml(sc.b.short) + '</span><span class="tt-val">' + fmtMoney(b) + '</span></p>' +
      '<p class="tt-gap">Difference <span>' + fmtSigned(a - b) + '</span></p>';
    tip.hidden = false;
    var svgRect = inner.querySelector('svg').getBoundingClientRect();
    var scale = svgRect.width / cs.width;
    var left = xx * scale + 14;
    var tipW = tip.offsetWidth;
    if (left + tipW > svgRect.width) left = xx * scale - tipW - 14;
    tip.style.left = Math.max(0, left) + 'px';
    tip.style.top = (cs.m.top * scale) + 'px';
  }

  function hideTooltip() {
    if (!chartState) return;
    var inner = chartState.host.querySelector('.chart-inner');
    if (!inner) return;
    inner.querySelector('.c-hover').hidden = true;
    inner.querySelector('.tooltip').hidden = true;
  }

  /* ================================================================ */
  /* 5d. Rendering — "What could change this result?"                  */
  /* ================================================================ */

  function leverFields(mode) {
    return FIELD_ORDER[mode].filter(function (id) { return SCENARIOS[mode].fields[id].lever; });
  }

  /** Slider range for a lever; money levers scale with the baseline value. */
  function leverRange(mode, id, values) {
    var f = SCENARIOS[mode].fields[id];
    var L = f.lever;
    var current = values[id];
    if (!L.rel) return { min: L.min, max: Math.max(L.max, current), step: L.step };
    var base = (state.baseline[mode] && state.baseline[mode][id]) || current;
    var step = niceStep(base * L.stepRel, 1);
    var min = Math.max(step, Math.floor((base * L.rel[0]) / step) * step);
    // Some levers can't go below another field (e.g. monthly amount ≥ minimum payment).
    if (L.minFrom && values[L.minFrom] != null) min = Math.max(min, Math.ceil(values[L.minFrom] / step) * step);
    var max = Math.ceil((base * L.rel[1]) / step) * step;
    return { min: Math.min(min, current), max: Math.max(max, current), step: step };
  }

  function clampToLever(mode, id, value, values) {
    var f = SCENARIOS[mode].fields[id];
    var range = leverRange(mode, id, values);
    var v = Math.max(Math.max(range.min, f.min), Math.min(range.max, value));
    if (f.kind === 'months') v = Math.round(v);
    return v;
  }

  function gapWith(mode, values, id, newValue) {
    var next = Object.assign({}, values);
    next[id] = newValue;
    return SCENARIOS[mode].compute(next).gap;
  }

  function flipPointFor(mode, values, id) {
    var f = SCENARIOS[mode].fields[id];
    var range = leverRange(mode, id, values);
    var fn = function (val) { return gapWith(mode, values, id, val); };
    // A tie exactly at the edge of the range (e.g. monthly amount = minimum payment,
    // where both options are identical) isn't a real change of winner.
    var isEdge = function (x) { return x != null && (Math.abs(x - range.min) < 1e-6 || Math.abs(x - range.max) < 1e-6); };
    if (f.kind === 'months') {
      var prev = fn(range.min);
      for (var mth = range.min + 1; mth <= range.max; mth++) {
        var g = fn(mth);
        if ((g > 0) !== (prev > 0) && Math.abs(prev) > 0.5) return mth;
        prev = g;
      }
      return null;
    }
    var flip = calc.findFlipPoint(fn, Math.max(range.min, f.min), range.max);
    return isEdge(flip) ? null : flip;
  }

  function renderWhatIfShell() {
    var body = $('#whatif-body');
    var mode = state.mode;
    var ids = leverFields(mode);
    body.innerHTML =
      '<div class="whatif-summary" id="whatif-summary" aria-live="polite"></div>' +
      '<div class="whatif-grid">' +
        '<div class="levers" role="group" aria-label="Adjust assumptions">' +
          ids.map(function (id) {
            var f = SCENARIOS[mode].fields[id];
            var lid = 'lever-' + mode + '-' + id;
            return '<div class="lever" data-lever="' + id + '">' +
              '<div class="lever-head"><label for="' + lid + '">' + escapeHtml(f.lever.label) + '</label>' +
              '<output for="' + lid + '" class="lever-value" id="' + lid + '-out"></output></div>' +
              '<div class="lever-track"><input type="range" id="' + lid + '" data-id="' + id + '">' +
              '<span class="lever-was" aria-hidden="true"></span></div>' +
              '<p class="lever-note" id="' + lid + '-note"></p>' +
              '</div>';
          }).join('') +
          '<button type="button" class="btn btn-quiet" id="reset-levers">Reset to my numbers</button>' +
        '</div>' +
        '<div class="sensitivity">' +
          '<h3>Which assumption matters most?</h3>' +
          '<p class="sens-lede">Each bar shows how far the gap moves if that one number goes down or up by a realistic amount, with everything else held still. Longer bars matter more.</p>' +
          '<div class="sens-axis" aria-hidden="true"><span>' + optionBadge('b') + ' ahead</span><span>' + optionBadge('a') + ' ahead</span></div>' +
          '<ol class="sens-list" id="sens-list"></ol>' +
          '<ul class="flip-list" id="flip-list"></ul>' +
        '</div>' +
      '</div>';
  }

  function renderWhatIf(ctx) {
    var mode = state.mode;
    var body = $('#whatif-body');
    var sc = SCENARIOS[mode];
    if (!body.querySelector('.levers')) renderWhatIfShell();
    var section = $('#what-if');
    section.classList.toggle('is-disabled', !ctx);

    if (!ctx) {
      $('#whatif-summary').innerHTML = '<p class="muted">Complete the numbers above to explore what could change the result.</p>';
      body.querySelectorAll('input[type=range]').forEach(function (el) { el.disabled = true; });
      $('#sens-list').innerHTML = '';
      $('#flip-list').innerHTML = '';
      $('#reset-levers').disabled = true;
      return;
    }

    var v = ctx.values, r = ctx.result;
    var base = state.baseline[mode];
    var changed = base && FIELD_ORDER[mode].some(function (id) { return Math.abs((base[id] || 0) - v[id]) > 1e-9; });

    // Summary: now vs. your numbers
    var nowText = describeGap(mode, v, r);
    var summary = '<p><span class="sum-label">Now</span> ' + nowText + '</p>';
    if (changed) {
      var baseValid = validateValues(mode, base);
      if (baseValid) {
        var rb = sc.compute(base);
        summary = '<p><span class="sum-label">Your numbers</span> ' + describeGap(mode, base, rb) + '</p>' +
          '<p><span class="sum-label">With these changes</span> ' + nowText + '</p>';
      }
    }
    $('#whatif-summary').innerHTML = summary;
    $('#reset-levers').disabled = !changed;

    // Sliders
    leverFields(mode).forEach(function (id) {
      var f = sc.fields[id];
      var el = document.getElementById('lever-' + mode + '-' + id);
      var range = leverRange(mode, id, v);
      el.disabled = false;
      el.min = range.min; el.max = range.max; el.step = range.step;
      el.value = v[id];
      el.setAttribute('aria-valuetext', fmtLeverValue(f, v[id]));
      var fill = ((v[id] - range.min) / (range.max - range.min)) * 100;
      el.style.setProperty('--fill', fill + '%');
      document.getElementById(el.id + '-out').textContent = fmtLeverValue(f, v[id]);
      var was = el.parentNode.querySelector('.lever-was');
      var note = document.getElementById(el.id + '-note');
      if (base && Math.abs(base[id] - v[id]) > 1e-9) {
        var pos = ((base[id] - range.min) / (range.max - range.min)) * 100;
        was.style.left = 'calc(' + pos + '% + ' + (8 - pos * 0.16) + 'px)';
        was.hidden = false;
        note.textContent = 'Was ' + fmtLeverValue(f, base[id]);
      } else {
        was.hidden = true;
        note.textContent = '';
      }
    });

    // Sensitivity (tornado) rows
    var rows = leverFields(mode).map(function (id) {
      var f = sc.fields[id];
      var d = f.lever.deltaPct ? v[id] * f.lever.deltaPct / 100 : f.lever.delta;
      var loV = clampToLever(mode, id, v[id] - d, v);
      var hiV = clampToLever(mode, id, v[id] + d, v);
      return { id: id, f: f, loV: loV, hiV: hiV, lo: gapWith(mode, v, id, loV), hi: gapWith(mode, v, id, hiV) };
    });
    rows.sort(function (p, q) { return Math.abs(q.hi - q.lo) - Math.abs(p.hi - p.lo); });
    var maxAbs = Math.max.apply(null, rows.reduce(function (acc, row) { return acc.concat([Math.abs(row.lo), Math.abs(row.hi)]); }, [Math.abs(r.gap), 1]));
    var pos = function (g) { return 50 + (g / maxAbs) * 48; };
    var nowPos = pos(r.gap);

    $('#sens-list').innerHTML = rows.map(function (row) {
      var left = Math.min(pos(row.lo), pos(row.hi));
      var right = Math.max(pos(row.lo), pos(row.hi));
      var negPart = left < 50 ? '<span class="sens-bar sens-bar-b" style="left:' + left + '%;width:' + (Math.min(right, 50) - left) + '%"></span>' : '';
      var posPart = right > 50 ? '<span class="sens-bar sens-bar-a" style="left:' + Math.max(left, 50) + '%;width:' + (right - Math.max(left, 50)) + '%"></span>' : '';
      var loLabel = fmtLeverValue(row.f, row.loV), hiLabel = fmtLeverValue(row.f, row.hiV);
      return '<li class="sens-row">' +
        '<p class="sens-name">' + escapeHtml(row.f.lever.label) + ' <span class="muted">' + loLabel + ' → ' + hiLabel + '</span></p>' +
        '<div class="sens-track" role="img" aria-label="' + escapeHtml(row.f.lever.label + ': at ' + loLabel + ' the gap is ' + describeGapPlain(mode, row.lo) + '; at ' + hiLabel + ' it is ' + describeGapPlain(mode, row.hi)) + '">' +
          '<span class="sens-mid"></span>' + negPart + posPart +
          '<span class="sens-now" style="left:' + nowPos + '%"></span>' +
        '</div>' +
        '<p class="sens-vals"><span>' + fmtSigned(row.lo) + '</span><span>' + fmtSigned(row.hi) + '</span></p>' +
        '</li>';
    }).join('');

    // Flip points
    var flips = leverFields(mode).map(function (id) {
      var f = sc.fields[id];
      var flip = flipPointFor(mode, v, id);
      var range = leverRange(mode, id, v);
      if (flip == null) {
        return '<li><span class="flip-name">' + escapeHtml(f.lever.label) + '</span> The winner stays the same anywhere from ' +
          fmtLeverValue(f, range.min) + ' to ' + fmtLeverValue(f, range.max) + '.</li>';
      }
      return '<li class="flip-yes"><span class="flip-name">' + escapeHtml(f.lever.label) + '</span> The winner changes at about <strong>' +
        fmtLeverValue(f, flip) + '</strong> (now ' + fmtLeverValue(f, v[id]) + ').</li>';
    });
    $('#flip-list').innerHTML = '<li class="flip-head">Tipping points</li>' + flips.join('');
  }

  function describeGap(mode, v, r) {
    var sc = SCENARIOS[mode];
    var w = winnerOf(mode, v, r);
    if (!w) return 'The two options are roughly tied.';
    return optionBadge(w) + ' <strong>' + escapeHtml(sc[w].short) + '</strong> ahead by <strong>' + fmtMoney(Math.abs(r.gap)) + '</strong>';
  }
  function describeGapPlain(mode, gap) {
    var sc = SCENARIOS[mode];
    if (Math.abs(gap) < 1) return 'about even';
    return (gap > 0 ? sc.a.short : sc.b.short) + ' ahead by ' + fmtMoney(Math.abs(gap));
  }
  function validateValues(mode, values) {
    return FIELD_ORDER[mode].every(function (id) { return typeof values[id] === 'number' && isFinite(values[id]); });
  }

  /* ================================================================ */
  /* 5e. Rendering — assumptions                                       */
  /* ================================================================ */

  function renderAssumptions(ctx) {
    var host = $('#assumptions-body');
    if (!ctx) {
      host.innerHTML = '<p class="muted">The assumptions fill in with your numbers once every field above is complete.</p>';
      return;
    }
    var mode = state.mode, v = ctx.values, r = ctx.result;
    var items;
    if (mode === 'debt') {
      items = [
        ['Interest on the debt', 'Charged monthly at ' + fmtPct(v.debtApr) + ' ÷ 12 = ' + fmtPct(r.monthlyDebtRatePct, 3) + ' of the balance, added before each payment.'],
        ['Interest on savings', fmtPct(v.saveApr) + ' a year, minus ' + fmtPct(v.taxPct) + ' tax = ' + fmtPct(r.afterTaxSaveApr) + ' a year, or ' + fmtPct(r.monthlySaveRatePct, 3) + ' a month. Savings start at zero.'],
        ['The monthly amount', fmtMoney(v.monthly) + ' every month, the same in both options, paid at the end of each month.'],
        ['The minimum payment', 'Stays fixed at ' + fmtMoney(v.minPayment) + '. Real cards usually lower the minimum as the balance falls, which would make “save first” pay off the debt even more slowly.'],
        ['After the debt is gone', 'Everything goes to savings.'],
        ['Not included', 'Late fees, penalty rates, rate changes, inflation, emergencies and credit score effects.']
      ];
    } else {
      items = [
        ['The instalment', fmtMoney(v.price) + ' over ' + plural(v.months, 'month') + ' at ' + fmtPct(v.emiApr) + ' a year = ' + fmtMoney(r.emi, { maximumFractionDigits: 2 }) + ' a month, using the standard EMI formula.'],
        ['Paying in full', fmtMoney(v.price) + ' minus a ' + fmtPct(v.discountPct) + ' discount = ' + fmtMoney(r.upfront) + ', paid today.'],
        ['The set-aside money', 'Both options start with ' + fmtMoney(v.price) + ' in savings earning ' + fmtPct(r.afterTaxSaveApr) + ' a year after tax (' + fmtPct(r.monthlySaveRatePct, 3) + ' a month). If the pot runs below zero, it earns nothing.'],
        ['The fee', fmtMoney(v.fee) + ' is paid on day one. Some lenders also charge tax on the fee or on the interest; add it to the fee to include it.'],
        ['Discipline', 'Assumes the money you don’t spend really stays in savings.'],
        ['Not included', 'Late-payment charges, price changes, cashback timing, inflation and credit score effects.']
      ];
    }
    host.innerHTML = '<dl class="assume-list">' + items.map(function (it) {
      return '<div class="assume"><dt>' + it[0] + '</dt><dd>' + it[1] + '</dd></div>';
    }).join('') + '</dl>';
  }

  /* ================================================================ */
  /* 6. Update loop, events and boot                                   */
  /* ================================================================ */

  var lastCtx = null;

  function update() {
    var result = validate(state.mode);
    renderFieldErrors(result);
    lastCtx = renderResults(result);
    renderWhatIf(lastCtx);
    renderAssumptions(lastCtx);
  }

  function setMode(mode, focusTab) {
    if (!SCENARIOS[mode]) return;
    state.mode = mode;
    savePrefs();
    renderTabs();
    renderForm();
    $('#whatif-body').innerHTML = '';
    update();
    if (focusTab) document.getElementById('tab-' + mode).focus();
  }

  function loadExample() {
    state.raw[state.mode] = exampleRaw(state.mode);
    state.baseline[state.mode] = exampleValues(state.mode);
    state.touched[state.mode] = {};
    state.usingExample[state.mode] = true;
    renderForm();
    update();
  }

  function clearAll() {
    FIELD_ORDER[state.mode].forEach(function (id) { state.raw[state.mode][id] = ''; });
    state.baseline[state.mode] = null;
    state.touched[state.mode] = {};
    state.usingExample[state.mode] = false;
    renderForm();
    update();
    var first = document.getElementById(fieldId(FIELD_ORDER[state.mode][0]));
    if (first) first.focus();
  }

  function copySummary() {
    if (!lastCtx) return;
    var mode = state.mode, v = lastCtx.values, r = lastCtx.result, sc = SCENARIOS[mode];
    var w = winnerOf(mode, v, r);
    var lines = [
      'ClearLedger: ' + sc.tab,
      w ? sc[w].name + ' leaves you ' + fmtMoney(Math.abs(r.gap)) + ' better off after ' + plural(v.months, 'month') + '.' : 'Roughly a tie after ' + plural(v.months, 'month') + '.',
      sc.a.short + ': ' + fmtMoney(r.a.net) + ' | ' + sc.b.short + ': ' + fmtMoney(r.b.net),
      'Educational estimate, not financial advice.'
    ];
    var text = lines.join('\n');
    var btn = document.querySelector('[data-action="copy"]');
    var done = function (msg) { if (btn) { btn.textContent = msg; setTimeout(function () { btn.textContent = 'Copy summary'; }, 1800); } };
    try {
      navigator.clipboard.writeText(text).then(function () { done('Copied'); }, function () { fallbackCopy(text); done('Copied'); });
    } catch (e) { fallbackCopy(text); done('Copied'); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* the text stays selected for manual copy */ }
    document.body.removeChild(ta);
  }

  function bindEvents() {
    // Scenario tabs (click + arrow keys)
    $('#scenario-tabs').addEventListener('click', function (e) {
      var btn = e.target.closest('[role=tab]');
      if (btn && btn.dataset.mode !== state.mode) setMode(btn.dataset.mode);
    });
    $('#scenario-tabs').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var keys = Object.keys(SCENARIOS);
      var i = keys.indexOf(state.mode);
      var next = keys[(i + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
      setMode(next, true);
      e.preventDefault();
    });

    // Currency
    $('#currency').addEventListener('change', function (e) {
      state.currency = e.target.value;
      savePrefs();
      renderForm();
      $('#whatif-body').innerHTML = '';
      update();
    });

    // Form fields: typing updates the numbers and the "what if" baseline
    var form = $('#inputs-form');
    form.addEventListener('input', function (e) {
      var id = e.target.name;
      if (!id) return;
      state.raw[state.mode][id] = e.target.value;
      state.touched[state.mode][id] = true;
      state.usingExample[state.mode] = false;
      var res = validate(state.mode);
      if (res.ok) state.baseline[state.mode] = Object.assign({}, res.values);
      update();
    });
    form.addEventListener('focusout', function (e) {
      var id = e.target.name;
      if (!id) return;
      state.touched[state.mode][id] = true;
      var f = SCENARIOS[state.mode].fields[id];
      var n = parseNumber(e.target.value);
      if (e.target.value.trim() !== '' && !isNaN(n)) e.target.value = fmtFieldValue(f, n);
      renderFieldErrors(validate(state.mode));
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    // Levers: move the number without resetting "your numbers"
    $('#whatif-body').addEventListener('input', function (e) {
      if (e.target.type !== 'range') return;
      var id = e.target.dataset.id;
      var f = SCENARIOS[state.mode].fields[id];
      var n = Number(e.target.value);
      state.raw[state.mode][id] = String(n);
      var input = document.getElementById(fieldId(id));
      if (input) input.value = fmtFieldValue(f, n);
      update();
    });
    $('#whatif-body').addEventListener('click', function (e) {
      if (e.target.id !== 'reset-levers' || !state.baseline[state.mode]) return;
      var base = state.baseline[state.mode];
      FIELD_ORDER[state.mode].forEach(function (id) { state.raw[state.mode][id] = String(base[id]); });
      renderForm();
      update();
    });

    // Buttons inside the results panel and elsewhere
    $('#load-example').addEventListener('click', loadExample);
    $('#clear-all').addEventListener('click', clearAll);
    $('#results').addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.action === 'example') loadExample();
      if (t.dataset.action === 'copy') copySummary();
      if (t.dataset.focus) {
        var input = document.getElementById(fieldId(t.dataset.focus));
        if (input) input.focus();
      }
    });

    // Redraw the chart at its real width (keeps text crisp, not stretched)
    var lastWidth = 0;
    var redraw = function () {
      var host = $('#chart');
      if (!host || !lastCtx) return;
      var w = host.clientWidth;
      if (Math.abs(w - lastWidth) < 4) return;
      lastWidth = w;
      drawChart(host, state.mode, lastCtx.values, lastCtx.result);
    };
    if ('ResizeObserver' in window) new ResizeObserver(redraw).observe($('.balance'));
    else window.addEventListener('resize', redraw);
  }

  // Boot
  renderCurrencyPicker();
  renderTabs();
  renderForm();
  bindEvents();
  update();
})();
