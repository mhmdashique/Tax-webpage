export interface GstPaymentForInterest {
  paidOn: string;
  taxAllocated: number;
  wrongItcAllocated: number;
}

export function roundInr(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateGstInterest({
  taxPayable,
  wrongItcPayable = 0,
  annualRatePercent,
  wrongItcRatePercent = 0,
  dueDate,
  asOf,
  payments = [],
}: {
  taxPayable: number;
  wrongItcPayable?: number;
  annualRatePercent: number;
  wrongItcRatePercent?: number;
  dueDate: string;
  asOf: string;
  payments?: GstPaymentForInterest[];
}): number {
  let taxBalance = taxPayable;
  let wrongItcBalance = wrongItcPayable;
  let previousDate = dueDate;
  let accrued = 0;

  const orderedPayments = [...payments].sort((a, b) => a.paidOn.localeCompare(b.paidOn));
  for (const payment of orderedPayments) {
    accrued += interestForDays(
      taxBalance,
      wrongItcBalance,
      annualRatePercent,
      wrongItcRatePercent,
      daysBetween(previousDate, payment.paidOn),
    );
    taxBalance = Math.max(0, taxBalance - payment.taxAllocated);
    wrongItcBalance = Math.max(0, wrongItcBalance - payment.wrongItcAllocated);
    if (payment.paidOn > previousDate) previousDate = payment.paidOn;
  }

  accrued += interestForDays(
    taxBalance,
    wrongItcBalance,
    annualRatePercent,
    wrongItcRatePercent,
    daysBetween(previousDate, asOf),
  );
  return roundInr(accrued);
}

export function calculateGstLateFee({
  daysLate,
  isNilReturn,
  previousFyTurnover,
  dailyFee = isNilReturn ? 20 : 50,
}: {
  daysLate: number;
  isNilReturn: boolean;
  previousFyTurnover?: number | null;
  dailyFee?: number;
}): number | null {
  if (daysLate <= 0) return 0;
  if (isNilReturn) return Math.min(daysLate * dailyFee, 500);
  if (previousFyTurnover == null) return null;
  const cap = previousFyTurnover <= 15_000_000
    ? 2_000
    : previousFyTurnover <= 50_000_000
      ? 5_000
      : 10_000;
  return Math.min(daysLate * dailyFee, cap);
}

function interestForDays(
  tax: number,
  wrongItc: number,
  rate: number,
  wrongRate: number,
  days: number,
): number {
  if (days <= 0) return 0;
  return roundInr((tax * rate + wrongItc * wrongRate) * days / 36_500);
}

function daysBetween(from: string, to: string): number {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  return Math.max(0, Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000));
}
