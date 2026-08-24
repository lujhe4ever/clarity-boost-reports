import { describe, expect, it } from "vitest";
import { Workbook } from "exceljs";

import {
  MAX_CELL_CHARACTERS,
  MAX_IMPORT_COLUMNS,
  MAX_UPLOAD_BYTES,
  assertSafeXlsxArchive,
  validateSpreadsheetFile,
  validateSpreadsheetRow,
} from "@/utils/spreadsheetSecurity";

describe("spreadsheet import boundaries", () => {
  it("accepts only bounded CSV and XLSX files", () => {
    expect(validateSpreadsheetFile({ name: "report.csv", size: 100, type: "text/csv" })).toBe(
      ".csv",
    );
    expect(() =>
      validateSpreadsheetFile({ name: "legacy.xls", size: 100, type: "application/vnd.ms-excel" }),
    ).toThrow(/Formato nao permitido/);
    expect(() =>
      validateSpreadsheetFile({ name: "large.xlsx", size: MAX_UPLOAD_BYTES + 1, type: "" }),
    ).toThrow(/5 MB/);
  });

  it("rejects excessive columns and cell lengths", () => {
    expect(() => validateSpreadsheetRow(Array(MAX_IMPORT_COLUMNS + 1).fill("x"), 2)).toThrow(
      /colunas/,
    );
    expect(() => validateSpreadsheetRow(["x".repeat(MAX_CELL_CHARACTERS + 1)], 3)).toThrow(
      /celula/,
    );
  });

  it("rejects malformed XLSX archives before parsing", () => {
    expect(() => assertSafeXlsxArchive(new ArrayBuffer(128))).toThrow(/corrompido/);
  });

  it("accepts and reads a normal XLSX workbook", async () => {
    const workbook = new Workbook();
    workbook.addWorksheet("Relatorio").addRow(["Data", "Campanha", "Investimento"]);
    workbook.getWorksheet("Relatorio")?.addRow([new Date("2026-08-24"), "Teste", 100]);
    const buffer = await workbook.xlsx.writeBuffer();
    const arrayBuffer = Uint8Array.from(buffer as unknown as ArrayLike<number>).buffer;

    expect(() => assertSafeXlsxArchive(arrayBuffer)).not.toThrow();

    const parsed = new Workbook();
    await parsed.xlsx.load(arrayBuffer);
    expect(parsed.worksheets[0]?.getCell("B2").value).toBe("Teste");
  });
});
