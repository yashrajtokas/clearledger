/*
 * ClearLedger — calculation engine
 * ---------------------------------
 * Pure functions only: numbers in, numbers out. No DOM access.
 * Works in the browser (as window.ClearLedgerCalc) and in Node (module.exports),
 * so the same code the page uses is the code the tests check.
 *
 * Conventions
 *  - Rates are annual percentages (36 means 36% a year).
 *  - Interest is applied monthly at (annual rate / 12).
 *  - Each month: interest is added first, then that month's money moves.
 *  - "gap" is always (Option A result) − (Option B result). Positive = A is ahead.
 */
(function (root) {
  'use strict';

  var CENT = 0.005; // balances below half a paisa/cent count as zero

  /** Annual % → monthly decimal rate. 12 → 0.01 */
  function monthlyRate(annualPct) {
    return annualPct / 100 / 12;
  }

  /** Savings rate after tax on interest, as a monthly decimal. */
  function afterTaxMonthlyRate(annualPct, taxPct) {
    return monthlyRate(annualPct) * (1 - taxPct / 100);
  }

  /**
   * Fixed monthly instalment for a loan (the standard EMI / amortisation formula).
   * EMI = P × r × (1 + r)^n / ((1 + r)^n − 1), where r = monthly rate, n = months.
   * With a 0% rate this is simply P / n.
   */
  function emiPayment(principal, annualPct, months) {
    var r = monthlyRate(annualPct);
    if (months <= 0) return principal;
    if (r === 0) return principal / months;
    var growth = Math.pow(1 + r, months);
    return (principal * r * growth) / (growth - 1);
  }

  /* ------------------------------------------------------------------ */
  /* Scenario 1: Pay down debt first vs. save while paying the minimum   */
  /* ------------------------------------------------------------------ */

  /**
   * @param {object} p
   * @param {number} p.debt        Starting debt balance
   * @param {number} p.debtApr     Debt interest rate, % a year
   * @param {number} p.minPayment  Minimum monthly payment on the debt
   * @param {number} p.monthly     Total money available each month (debt + savings)
   * @param {number} p.saveApr     Savings interest rate, % a year (before tax)
   * @param {number} p.taxPct      Tax on savings interest, %
   * @param {number} p.months      How many months to compare
   */
  function debtVsSave(p) {
    var rDebt = monthlyRate(p.debtApr);
    var rSave = afterTaxMonthlyRate(p.saveApr, p.taxPct);

    function run(strategy) {
      var debt = p.debt;
      var savings = 0;
      var interestPaid = 0;
      var interestEarned = 0;
      var debtFreeMonth = debt <= CENT ? 0 : null;
      var series = [{ month: 0, value: savings - debt, debt: debt, savings: savings }];

      for (var m = 1; m <= p.months; m++) {
        var debtInterest = debt * rDebt;
        debt += debtInterest;
        interestPaid += debtInterest;

        var saveInterest = savings * rSave;
        savings += saveInterest;
        interestEarned += saveInterest;

        var wanted = strategy === 'debtFirst' ? p.monthly : Math.min(p.minPayment, p.monthly);
        var toDebt = Math.min(wanted, debt);
        debt -= toDebt;
        savings += p.monthly - toDebt;

        if (debt < CENT) {
          debt = 0;
          if (debtFreeMonth === null) debtFreeMonth = m;
        }
        series.push({ month: m, value: savings - debt, debt: debt, savings: savings });
      }

      return {
        series: series,
        endDebt: debt,
        endSavings: savings,
        net: savings - debt,
        interestPaid: interestPaid,
        interestEarned: interestEarned,
        moneyIn: p.monthly * p.months,
        debtFreeMonth: debtFreeMonth
      };
    }

    var a = run('debtFirst');
    var b = run('saveFirst');
    return {
      a: a,
      b: b,
      gap: a.net - b.net,
      // Warning: the minimum payment is smaller than the first month's interest,
      // so under Option B the balance would grow instead of shrink.
      minimumTooLow: p.minPayment <= p.debt * rDebt,
      monthlyDebtRatePct: rDebt * 100,
      monthlySaveRatePct: rSave * 100,
      afterTaxSaveApr: p.saveApr * (1 - p.taxPct / 100)
    };
  }

  /* ------------------------------------------------------------------ */
  /* Scenario 2: Pay in full now vs. pay in monthly instalments (EMI)    */
  /* ------------------------------------------------------------------ */

  /**
   * Both options start with the same "pot": the item's price, set aside in savings.
   * Option A pays the (possibly discounted) price from the pot today.
   * Option B pays a one-off fee today, then an EMI from the pot each month,
   * while whatever remains keeps earning savings interest.
   * We compare what is left in the pot after the last instalment. Month by month,
   * the series shows the pot minus whatever is still owed on the plan.
   *
   * @param {object} p
   * @param {number} p.price       Sticker price
   * @param {number} p.discountPct Discount for paying in full, %
   * @param {number} p.fee         One-off processing fee for the instalment plan
   * @param {number} p.emiApr      Instalment interest rate, % a year (0 = "no-cost")
   * @param {number} p.months      Number of instalments
   * @param {number} p.saveApr     Savings interest rate, % a year (before tax)
   * @param {number} p.taxPct      Tax on savings interest, %
   */
  function payNowVsSpread(p) {
    var rSave = afterTaxMonthlyRate(p.saveApr, p.taxPct);
    var upfront = p.price * (1 - p.discountPct / 100);
    var emi = emiPayment(p.price, p.emiApr, p.months);

    var rLoan = monthlyRate(p.emiApr);

    function run(strategy) {
      var pot = strategy === 'payNow' ? p.price - upfront : p.price - p.fee;
      // What is still owed on the plan. Tracking it keeps the monthly comparison fair:
      // halfway through, the instalment option still has payments to make.
      var owed = strategy === 'payNow' ? 0 : p.price;
      var interestEarned = 0;
      var series = [{ month: 0, value: pot - owed, pot: pot, owed: owed }];

      for (var m = 1; m <= p.months; m++) {
        // Interest is only earned on money actually in the pot (a negative pot earns nothing).
        var earned = pot > 0 ? pot * rSave : 0;
        pot += earned;
        interestEarned += earned;
        if (strategy === 'spread') {
          pot -= emi;
          owed = owed * (1 + rLoan) - emi;
          if (Math.abs(owed) < CENT || m === p.months) owed = 0;
        }
        series.push({ month: m, value: pot - owed, pot: pot, owed: owed });
      }

      var paid = strategy === 'payNow' ? upfront : emi * p.months + p.fee;
      return {
        series: series,
        net: pot,
        interestEarned: interestEarned,
        totalPaid: paid,
        interestPaid: strategy === 'payNow' ? 0 : emi * p.months - p.price,
        fees: strategy === 'payNow' ? 0 : p.fee,
        discount: strategy === 'payNow' ? p.price - upfront : 0
      };
    }

    var a = run('payNow');
    var b = run('spread');
    return {
      a: a,
      b: b,
      gap: a.net - b.net,
      emi: emi,
      upfront: upfront,
      monthlySaveRatePct: rSave * 100,
      afterTaxSaveApr: p.saveApr * (1 - p.taxPct / 100)
    };
  }

  /* ------------------------------------------------------------------ */
  /* "What could change this result?" helpers                            */
  /* ------------------------------------------------------------------ */

  /**
   * Finds the value of one input where the two options come out equal (gap = 0),
   * searching between lo and hi by repeatedly halving the range (bisection).
   * Returns null if the winner never changes inside that range.
   *
   * @param {function(number): number} gapAt  returns the gap for a given input value
   */
  function findFlipPoint(gapAt, lo, hi, steps) {
    var gLo = gapAt(lo);
    var gHi = gapAt(hi);
    if (!isFinite(gLo) || !isFinite(gHi)) return null;
    if (gLo === 0) return lo;
    if (gHi === 0) return hi;
    if (gLo > 0 === gHi > 0) return null;
    for (var i = 0; i < (steps || 60); i++) {
      var mid = (lo + hi) / 2;
      var gMid = gapAt(mid);
      if (gMid === 0) return mid;
      if (gMid > 0 === gLo > 0) {
        lo = mid;
        gLo = gMid;
      } else {
        hi = mid;
      }
    }
    return (lo + hi) / 2;
  }

  var api = {
    monthlyRate: monthlyRate,
    afterTaxMonthlyRate: afterTaxMonthlyRate,
    emiPayment: emiPayment,
    debtVsSave: debtVsSave,
    payNowVsSpread: payNowVsSpread,
    findFlipPoint: findFlipPoint
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ClearLedgerCalc = api;
  }
})(typeof window !== 'undefined' ? window : this);
