import { describe, expect, it } from "vitest";
import {
  findMetaAdsHeaderRow,
  isAggregateMetaRow,
  parseMetaNumber,
  pickMetaField,
  rowsToMetaAdsObjects,
  FIELD_ALIASES,
} from "./metaAdsImport";

describe("Meta Ads import helpers", () => {
  it("finds a header after formatted-report presentation rows", () => {
    const rows = [
      ["Relatorio sem titulo", "", "", ""],
      ["", "", "", ""],
      ["Nome da campanha", "Dia", "Resultados", "Valor gasto (BRL)", "Impressoes", "Alcance"],
      ["Campanha A", "2026-09-15", 10, "R$ 1,31", 661, 624],
    ];
    expect(findMetaAdsHeaderRow(rows)).toBe(2);
    expect(rowsToMetaAdsObjects(rows)).toEqual([
      {
        "Nome da campanha": "Campanha A",
        Dia: "2026-09-15",
        Resultados: 10,
        "Valor gasto (BRL)": "R$ 1,31",
        Impressoes: 661,
        Alcance: 624,
      },
    ]);
  });

  it("normalizes aliases and Brazilian currency without masking invalid values", () => {
    expect(parseMetaNumber("R$ 1.234,56")).toBe(1234.56);
    expect(parseMetaNumber("1,25")).toBe(1.25);
    expect(parseMetaNumber("invalido")).toBeNull();
    expect(pickMetaField({ "Amount spent": "2.50" }, FIELD_ALIASES.investment)).toBe("2.50");
  });

  it("identifies aggregate Meta rows so they are not mixed with daily records", () => {
    expect(isAggregateMetaRow({ Dia: "All", "Nome da campanha": "Campanha A" })).toBe(true);
    expect(isAggregateMetaRow({ Dia: "2026-09-15", "Nome da campanha": "Campanha A" })).toBe(false);
  });

  it("rejects a sheet without a recognizable Meta Ads header", () => {
    expect(() => rowsToMetaAdsObjects([["Resumo"], ["sem metricas"]])).toThrow(/cabecalho/i);
  });
});
