/**
 * Client Submission and Payments - Calculation Logic Module
 * Based on the requirements for TaxFile Manager.
 */

export type SalesGstMode = "deduct" | "inclusive" | "add_on_top";
export type PurchaseGstMode = "use_file" | "recompute" | "inclusive";

export interface InvoiceInput {
  invoice_no: string;
  date: string; // YYYY-MM-DD
  total_entered: number;
  gst_rate: number;
}

export interface PurchaseInvoiceInput {
  invoice_no: string;
  date: string;
  total_entered: number;
  gst_amount_file: number;
  taxable_value_file: number;
  gst_rate: number;
  supplier_gstin?: string;
}

export interface GstCalculationResult {
  taxable_value: number;
  gst_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface PurchaseValidationResult extends GstCalculationResult {
  itc_eligible: boolean;
  validation_flags: string[];
}

/**
 * 5A. Sales GST method calculation
 */
export function calculateSalesGst(
  input: InvoiceInput,
  mode: SalesGstMode,
  isInterState: boolean = false
): GstCalculationResult {
  let taxable = 0;
  let gst = 0;
  let total = input.total_entered;

  switch (mode) {
    case "deduct":
      gst = total * (input.gst_rate / 100);
      taxable = total - gst;
      break;
    case "inclusive":
      taxable = total / (1 + input.gst_rate / 100);
      gst = total - taxable;
      break;
    case "add_on_top":
      taxable = total;
      gst = taxable * (input.gst_rate / 100);
      total = taxable + gst;
      break;
  }

  // Rounding to 2 decimal places (paise)
  taxable = Math.round(taxable * 100) / 100;
  gst = Math.round(gst * 100) / 100;
  total = Math.round(total * 100) / 100;

  let cgst = 0, sgst = 0, igst = 0;
  if (isInterState) {
    igst = gst;
  } else {
    // Split equally, handle rounding carefully
    cgst = Math.round((gst / 2) * 100) / 100;
    sgst = gst - cgst;
  }

  return { taxable_value: taxable, gst_amount: gst, cgst, sgst, igst, total };
}

/**
 * 5B. Purchase register GST handling
 */
export function validatePurchaseInvoice(
  input: PurchaseInvoiceInput,
  mode: PurchaseGstMode,
  tolerance: number = 1.00
): PurchaseValidationResult {
  let taxable = input.taxable_value_file;
  let gst = 0;
  let total = input.total_entered;
  let flags: string[] = [];
  let itc_eligible = true;

  switch (mode) {
    case "use_file":
      gst = input.gst_amount_file;
      break;
    case "recompute":
      gst = taxable * (input.gst_rate / 100);
      gst = Math.round(gst * 100) / 100;
      break;
    case "inclusive":
      taxable = total / (1 + input.gst_rate / 100);
      taxable = Math.round(taxable * 100) / 100;
      gst = total - taxable;
      break;
  }

  // Check tolerance
  const computedGst = Math.round(input.taxable_value_file * (input.gst_rate / 100) * 100) / 100;
  if (Math.abs(computedGst - input.gst_amount_file) > tolerance) {
    flags.push(`GST mismatch: file=${input.gst_amount_file}, computed=${computedGst}`);
  }

  // Check GSTIN validity placeholder logic
  if (!input.supplier_gstin || input.supplier_gstin.includes("SAMPLE")) {
    flags.push("Invalid or placeholder GSTIN");
    itc_eligible = false;
  }

  // Note: Period checking (5C) should be done in a higher-level function 
  // that knows the current filing period boundaries.

  return {
    taxable_value: taxable,
    gst_amount: gst,
    cgst: gst / 2, // Simplified for this example, assumes intra-state if not specified
    sgst: gst / 2,
    igst: 0,
    total,
    itc_eligible,
    validation_flags: flags
  };
}

/**
 * 7A. Payment calculations
 */
export function calculatePaymentStatus(total: number, amountPaid: number) {
  const balance = total - amountPaid;
  let status = "Unpaid";
  
  if (balance <= 0 && amountPaid > 0) {
    status = "Paid";
  } else if (amountPaid > 0 && amountPaid < total) {
    status = "Partly paid";
  }

  return { amount_paid: amountPaid, balance_due: balance, status };
}

/**
 * 7B. Net GST Payable
 */
export function calculateNetPayable(outputGst: number, eligibleItc: number) {
  const net = outputGst - eligibleItc;
  return {
    output_gst: outputGst,
    eligible_itc: eligibleItc,
    net_payable: net > 0 ? net : 0,
    credit_carried_forward: net < 0 ? Math.abs(net) : 0
  };
}
