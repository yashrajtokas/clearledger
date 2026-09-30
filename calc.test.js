/*
 * ClearLedger — calculation tests
 * Run with:  node calc.test.js   (or: npm test)
 * No dependencies; uses Node's built-in assert module.
 */
'use strict';

const assert = require('assert');
const calc = require('./calc.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    console.error('  ✗ ' + name + '\n    ' + err.message);
    process.exitCode = 1;
  }
}
const near = (actual, expected, tolerance, label) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label || 'value'}: expected ${expected} ± ${tolerance}, got ${actual}`
  );

console.log('\nClearLedger calculation tests\n');

/* ---------- EMI formula ---------- */

test('EMI matches the standard amortisation formula (1,00,000 at 12% for 12 months ≈ 8,884.88)', () => {
  near(calc.emiPayment(100000, 12, 12), 8884.88, 0.01, 'EMI');
});

test('EMI at 0% is simply price ÷ months', () => {
  assert.strictEqual(calc.emiPayment(60000, 0, 12), 5000);
});

test('Monthly rate is the annual rate ÷ 12', () => {
  near(calc.monthlyRate(36), 0.03, 1e-12);
  near(calc.afterTaxMonthlyRate(12, 25), 0.0075, 1e-12);
});

/* ---------- Debt vs save ---------- */

const debtBase = {
  debt: 120000, debtApr: 36, minPayment: 6000, monthly: 15000,
  saveApr: 7, taxPct: 20, months: 24
};

test('Both debt options put in exactly the same money', () => {
  const r = calc.debtVsSave(debtBase);
  assert.strictEqual(r.a.moneyIn, r.b.moneyIn);
});

test('Money is conserved: net = money in − interest paid + interest earned − starting debt', () => {
  const r = calc.debtVsSave(debtBase);
  for (const side of [r.a, r.b]) {
    near(side.net, side.moneyIn - side.interestPaid + side.interestEarned - debtBase.debt, 0.01, 'net');
  }
});

test('When debt costs far more than savings earn, clearing debt first wins', () => {
  const r = calc.debtVsSave(debtBase);
  assert.ok(r.gap > 0, 'expected Option A ahead, gap was ' + r.gap);
  assert.ok(r.a.debtFreeMonth !== null && r.a.debtFreeMonth <= 10, 'debt-first should clear the card within ~10 months');
});

test('When savings earn more than the debt costs, saving first wins', () => {
  const r = calc.debtVsSave({ ...debtBase, debtApr: 2, saveApr: 12, taxPct: 0 });
  assert.ok(r.gap < 0, 'expected Option B ahead, gap was ' + r.gap);
});

test('If both rates are equal (after tax) the options tie', () => {
  const r = calc.debtVsSave({ ...debtBase, debtApr: 8, saveApr: 8, taxPct: 0 });
  near(r.gap, 0, 1, 'gap');
});

test('Flags a minimum payment that does not even cover the interest', () => {
  const r = calc.debtVsSave({ ...debtBase, minPayment: 3000 }); // 3% of 1,20,000 = 3,600 interest
  assert.strictEqual(r.minimumTooLow, true);
});

test('Break-even savings rate for debt-vs-save sits at the debt rate ÷ (1 − tax)', () => {
  const flip = calc.findFlipPoint(
    (rate) => calc.debtVsSave({ ...debtBase, saveApr: rate }).gap, 0, 100
  );
  near(flip, 36 / 0.8, 0.05, 'break-even savings rate');
});

/* ---------- Pay now vs spread ---------- */

const buyBase = {
  price: 72000, discountPct: 3, fee: 499, emiApr: 16, months: 12, saveApr: 7, taxPct: 20
};

test('Pay-in-full total equals the discounted price', () => {
  const r = calc.payNowVsSpread(buyBase);
  near(r.a.totalPaid, 72000 * 0.97, 0.001);
});

test('EMI total = instalments + fee, and interest = instalments − price', () => {
  const r = calc.payNowVsSpread(buyBase);
  near(r.b.totalPaid, r.emi * 12 + 499, 0.001);
  near(r.b.interestPaid, r.emi * 12 - 72000, 0.001);
});

test('A true no-cost EMI with no fee, no discount and 0% savings is a tie', () => {
  const r = calc.payNowVsSpread({ ...buyBase, discountPct: 0, fee: 0, emiApr: 0, saveApr: 0 });
  near(r.gap, 0, 0.001, 'gap');
});

test('A no-cost EMI beats paying in full when savings earn interest and nothing is lost', () => {
  const r = calc.payNowVsSpread({ ...buyBase, discountPct: 0, fee: 0, emiApr: 0 });
  assert.ok(r.gap < 0, 'expected EMI ahead, gap was ' + r.gap);
});

test('A 16% EMI with a fee loses to paying in full at 7% savings', () => {
  const r = calc.payNowVsSpread(buyBase);
  assert.ok(r.gap > 0, 'expected pay-in-full ahead, gap was ' + r.gap);
});

test('findFlipPoint returns null when the winner never changes', () => {
  assert.strictEqual(calc.findFlipPoint(() => 5, 0, 10), null);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}\n`);
