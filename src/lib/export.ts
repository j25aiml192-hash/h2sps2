/**
 * Google Sheets + CSV Export utilities
 * ════════════════════════════════════
 * exportToCSV  — browser-native, zero cost
 * exportToSheets — Google Sheets API v4 (requires OAuth token from auth.currentUser)
 *
 * Usage:
 *   exportToCSV(rows, headers, "debates.csv")
 *   await exportToSheets(rows, headers, "title", accessToken)
 */

// ── Types ─────────────────────────────────────────────────────
export type SheetRow = (string | number | boolean | null)[];

// ── CSV Export (browser, fully free) ─────────────────────────
export function exportToCSV(
  rows: SheetRow[],
  headers: string[],
  filename = "export.csv"
): void {
  const escape = (v: SheetRow[number]) => {
    if (v === null || v === undefined) return "";
    const str = String(v);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvLines = [
    headers.map(escape).join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ];
  const csv = csvLines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Google Sheets Export (requires OAuth access token) ────────
// The access token comes from Firebase Auth user.getIdToken() or
// Google Identity Services with scope:
//   https://www.googleapis.com/auth/spreadsheets
export async function exportToSheets(
  rows: SheetRow[],
  headers: string[],
  title: string,
  accessToken: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  // 1. Create a new spreadsheet
  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: "Data" } }],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Sheets create failed: ${err}`);
  }

  const sheet = await createRes.json() as { spreadsheetId: string; spreadsheetUrl: string };
  const { spreadsheetId, spreadsheetUrl } = sheet;

  // 2. Populate with data
  const values = [headers, ...rows.map((r) => r.map((v) => v ?? ""))];

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Data!A1:Z${values.length}?valueInputOption=USER_ENTERED`,
    {
      method:  "PUT",
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ range: "Data!A1", majorDimension: "ROWS", values }),
    }
  );

  if (!updateRes.ok) {
    const err = await updateRes.text();
    throw new Error(`Sheets populate failed: ${err}`);
  }

  return { spreadsheetId, spreadsheetUrl };
}

// ── Debate-specific export helpers ────────────────────────────
export interface DebateExportRow {
  debateId: string;
  topic: string;
  createdAt: string;
  professor: string;
  activist: string;
  journalist: string;
  citizen: string;
  consensus?: string;
}

export function debateToRows(debates: DebateExportRow[]): { headers: string[]; rows: SheetRow[] } {
  const headers = ["Debate ID", "Topic", "Created At", "Professor", "Activist", "Journalist", "Citizen", "Consensus"];
  const rows: SheetRow[] = debates.map((d) => [
    d.debateId, d.topic, d.createdAt,
    d.professor, d.activist, d.journalist, d.citizen,
    d.consensus ?? "",
  ]);
  return { headers, rows };
}

export interface ArticleExportRow {
  articleId: string;
  title: string;
  source: string;
  category: string;
  relevanceScore: number;
  publishedAt: string;
  summary: string;
  regions: string;
  isScheme: boolean;
}

export function articlesToRows(articles: ArticleExportRow[]): { headers: string[]; rows: SheetRow[] } {
  const headers = ["Article ID", "Title", "Source", "Category", "Relevance", "Published", "Summary", "Regions", "Is Scheme"];
  const rows: SheetRow[] = articles.map((a) => [
    a.articleId, a.title, a.source, a.category,
    a.relevanceScore, a.publishedAt, a.summary, a.regions, a.isScheme,
  ]);
  return { headers, rows };
}
