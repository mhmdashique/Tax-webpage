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
