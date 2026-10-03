import assert from "node:assert/strict";
import test from "node:test";
import { calculateGstInterest, calculateGstLateFee } from "./gst.ts";

const tax = 20_745.76;
const due = "2026-01-01";

test("calculates 30 days of interest on cash tax only", () => {
  assert.equal(calculateGstInterest({
    taxPayable: tax,
    annualRatePercent: 18,
    dueDate: due,
    asOf: "2026-01-31",
  }), 306.92);
});

test("does not charge interest for payment on the due date", () => {
  assert.equal(calculateGstInterest({
    taxPayable: tax,
    annualRatePercent: 18,
    dueDate: due,
    asOf: due,
  }), 0);
});

test("accrues partial-payment interest only on remaining tax", () => {
  assert.equal(calculateGstInterest({
    taxPayable: tax,
    annualRatePercent: 18,
    dueDate: due,
    asOf: "2026-01-31",
    payments: [{ paidOn: due, taxAllocated: 10_000, wrongItcAllocated: 0 }],
  }), 158.98);
});

test("applies the higher rate only to confirmed wrongly utilized ITC", () => {
  assert.equal(calculateGstInterest({
    taxPayable: 0,
    wrongItcPayable: 40_000,
    annualRatePercent: 18,
    wrongItcRatePercent: 24,
    dueDate: due,
    asOf: "2026-01-31",
  }), 789.04);
});

test("calculates late filing fees with turnover caps and the nil cap", () => {
  assert.equal(calculateGstLateFee({ daysLate: 30, isNilReturn: false, previousFyTurnover: 10_000_000 }), 1_500);
  assert.equal(calculateGstLateFee({ daysLate: 120, isNilReturn: false, previousFyTurnover: 30_000_000 }), 5_000);
  assert.equal(calculateGstLateFee({ daysLate: 250, isNilReturn: false, previousFyTurnover: 60_000_000 }), 10_000);
  assert.equal(calculateGstLateFee({ daysLate: 50, isNilReturn: false, previousFyTurnover: 10_000_000 }), 2_000);
  assert.equal(calculateGstLateFee({ daysLate: 40, isNilReturn: true, previousFyTurnover: null }), 500);
});

test("matches the late-filed return total from the supplied example", () => {
  const interest = calculateGstInterest({
    taxPayable: tax,
    annualRatePercent: 18,
    dueDate: due,
    asOf: "2026-01-31",
  });
  const lateFee = calculateGstLateFee({
    daysLate: 30,
    isNilReturn: false,
    previousFyTurnover: 10_000_000,
  });
  assert.equal(Math.round((tax + interest + lateFee) * 100) / 100, 22_552.68);
});

test("requires turnover before calculating non-nil return late fee", () => {
  assert.equal(calculateGstLateFee({ daysLate: 30, isNilReturn: false }), null);
});
