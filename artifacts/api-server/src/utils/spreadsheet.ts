import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

/**
 * Parses an uploaded CSV or Excel (.xlsx) file into a plain array-of-rows
 * (string[][]), so every importer (products, chart of accounts, ...) can
 * share one validation/insert pipeline regardless of which format the
 * user uploaded. The first row is always treated as the header row.
 */
export async function parseSpreadsheet(buffer: Buffer, originalName: string): Promise<string[][]> {
  const isXlsx = originalName.toLowerCase().endsWith('.xlsx');
  if (!isXlsx) {
    return parseCsv(buffer, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
      encoding: 'utf-8',
    }) as string[][];
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      values.push(v === null || v === undefined ? '' : String(v).trim());
    });
    if (values.some((v) => v !== '')) rows.push(values);
  });
  return rows;
}

/** Builds a single-sheet .xlsx workbook buffer from a header row + data rows. */
export async function buildXlsxBuffer(sheetName: string, headers: string[], rows: (string | number)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  sheet.columns.forEach((col) => { col.width = 18; });
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
