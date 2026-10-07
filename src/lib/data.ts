export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export function downloadFile(filename: string, content: string | Blob, mime = "text/csv") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function exportPDF(title: string, rows: Record<string, unknown>[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 18);
  doc.setFontSize(10);
  let y = 28;
  const headers = Object.keys(rows[0] ?? { note: "no data" });
  doc.text(headers.join(" | ").slice(0, 180), 14, y);
  y += 8;
  for (const r of rows.slice(0, 60)) {
    doc.text(headers.map((h) => String(r[h] ?? "")).join(" | ").slice(0, 180), 14, y);
    y += 7;
    if (y > 280) { doc.addPage(); y = 18; }
  }
  doc.save(`${title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}

export type ReceiptFiling = {
  id: string;
  tax_type: string;
  period: string;
  due_date: string;
  status: string;
  amount_owed?: number | null;
  amount_refund?: number | null;
  filed_at?: string | null;
};

function receiptMoney(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `Rs. ${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Premium black & white A4 filing receipt. Returns the jsPDF doc so callers can save() or preview via output("datauristring"). */
export async function buildFilingReceiptPdf(filing: ReceiptFiling, clientName?: string | null) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const receiptNo = `RCP-${String(filing.id).slice(0, 8).toUpperCase()}`;
  const issued = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const BLACK: [number, number, number] = [12, 12, 12];
  const INK: [number, number, number] = [17, 17, 17];
  const MUTED: [number, number, number] = [110, 110, 110];
  const PAPER: [number, number, number] = [245, 245, 245];
  const LINE: [number, number, number] = [225, 225, 225];

  // Header — solid black, white serif title
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, 210, 44, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("T A X D E S K", 14, 12);
  doc.setFont("times", "bold");
  doc.setFontSize(20);
  doc.text("Filing Receipt", 14, 23);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(200, 200, 200);
  doc.text("System-generated receipt — no signature required.", 14, 30);
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.4);
  doc.line(14, 34, 80, 34);
  // Right meta in white/gray
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(receiptNo, 196, 13, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(200, 200, 200);
  doc.text(`Issued ${issued}`, 196, 20, { align: "right" });
  doc.text(`Status  ·  ${String(filing.status).replace(/_/g, " ").toUpperCase()}`, 196, 26, { align: "right" });

  // Meta row — uppercase labels, hairline rule
  let y = 56;
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("BILLED TO", 14, y);
  doc.text("FILING", 110, y);
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  y += 7;
  doc.text(String(clientName ?? "Client").slice(0, 42), 14, y);
  doc.setFont("times", "bold");
  doc.text(`${filing.tax_type}  ·  ${filing.period}`.slice(0, 48), 110, y);
  y += 5;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.4);
  doc.line(14, y, 196, y);

  // Details table — alternating paper/white with hairline borders
  y += 9;
  const rows: [string, string][] = [
    ["Tax type", filing.tax_type],
    ["Tax period", filing.period],
    ["Return due date", String(filing.due_date ?? "—").slice(0, 10)],
    ["Filed on", filing.filed_at ? String(filing.filed_at).slice(0, 10) : "—"],
    ["Receipt no", receiptNo],
  ];
  doc.setFontSize(9.5);
  rows.forEach(([k, v], i) => {
    if (i % 2 === 0) {
      doc.setFillColor(...PAPER);
      doc.rect(14, y - 5.5, 182, 10, "F");
    }
    doc.setDrawColor(...LINE);
    doc.rect(14, y - 5.5, 182, 10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUTED);
    doc.setFontSize(8);
    doc.text(k.toUpperCase(), 18, y + 0.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.setFontSize(9.5);
    doc.text(String(v).slice(0, 48), 80, y + 0.5);
    y += 11.5;
  });

  // Amounts — black masthead, monochrome rows
  y += 4;
  doc.setFillColor(...BLACK);
  doc.rect(14, y - 6.5, 182, 11, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("AMOUNT", 18, y + 0.5);
  doc.text("TOTAL", 196, y + 0.5, { align: "right" });
  y += 13;
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const amounts: [string, string][] = [
    ["Amount owed", receiptMoney(filing.amount_owed)],
    ["Expected refund", receiptMoney(filing.amount_refund)],
  ];
  for (const [k, v] of amounts) {
    doc.text(k, 18, y);
    doc.text(v, 196, y, { align: "right" });
    y += 7;
  }
  y += 3;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.8);
  doc.line(14, y, 196, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Net payable", 18, y);
  doc.text(receiptMoney(filing.amount_owed), 196, y, { align: "right" });

  // Footer — monochrome
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.4);
  doc.line(14, 272, 196, 272);
  doc.text(`Receipt ${receiptNo} · Filing ${String(filing.id).slice(0, 8)} · Generated ${new Date().toLocaleString("en-IN")}`, 14, 280);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.text("TaxDesk FilePilot OS", 196, 280, { align: "right" });

  return { doc, filename: `${filing.period}-${filing.tax_type}-receipt.pdf`, receiptNo };
}

export function daysUntil(due: string): number {
  const ms = new Date(due).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

export function dueLabel(due: string): string {
  const d = daysUntil(due);
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due in ${d}d`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
