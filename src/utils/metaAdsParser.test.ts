import { describe, expect, it } from "vitest";

import {
  findHeaderRowIndex,
  isLeadObjective,
  parseCampaignRows,
  parseNumberStrict,
  rowsToObjects,
} from "@/utils/metaAdsParser";

const HEADER = ["Dia", "Nome da campanha", "Objetivo", "Valor usado (BRL)", "Impressões", "Alcance", "Resultados"];

describe("meta ads parser", () => {
  it("detecta cabecalho deslocado apos linhas de apresentacao", () => {
    const rows = [
      ["Relatório de desempenho"],
      ["Conta: Letshoes"],
      [],
      HEADER,
      ["2026-09-01", "Campanha A", "Cadastros", "R$ 1.234,56", "10.000", "8.000", "12"],
    ];
    expect(findHeaderRowIndex(rows)).toBe(3);
    const objects = rowsToObjects(rows);
    expect(objects).toHaveLength(1);
    expect(parseCampaignRows(objects).records[0].campaign_name).toBe("Campanha A");
  });

  it("reconhece aliases de colunas do Meta em ingles", () => {
    const rows = [
      ["Day", "Campaign name", "Objective", "Amount spent", "Impressions", "Reach", "Link clicks"],
      ["09/01/2026", "Campaign B", "Traffic", "100.50", "5000", "4000", "250"],
    ];
    const [record] = parseCampaignRows(rowsToObjects(rows)).records;
    expect(record.date).toBe("2026-01-09");
    expect(record.investment).toBe(100.5);
    expect(record.clicks).toBe(250);
  });

  it("converte moeda brasileira sem perder centavos", () => {
    expect(parseNumberStrict("R$ 1.234,56")).toBe(1234.56);
    expect(parseNumberStrict("0,95")).toBe(0.95);
    expect(parseNumberStrict("12%")).toBe(12);
    expect(parseNumberStrict("")).toBeNull();
  });

  it("rejeita investimento ou impressoes invalidos com mensagem clara", () => {
    const rows = [HEADER, ["2026-09-01", "Campanha A", "Cadastros", "indisponível", "10", "8", "1"]];
    expect(() => parseCampaignRows(rowsToObjects(rows))).toThrow(/investimento na linha 2/);

    const rows2 = [HEADER, ["2026-09-01", "Campanha A", "Cadastros", "10", "n/d", "8", "1"]];
    expect(() => parseCampaignRows(rowsToObjects(rows2))).toThrow(/impressoes na linha 2/);
  });

  it("ignora linhas agregadas com Dia = All", () => {
    const rows = [
      HEADER,
      ["All", "Campanha A", "Cadastros", "100", "10", "8", "5"],
      ["2026-09-01", "Campanha A", "Cadastros", "100", "10", "8", "5"],
    ];
    const result = parseCampaignRows(rowsToObjects(rows));
    expect(result.ignoredAggregate).toBe(1);
    expect(result.records).toHaveLength(1);
  });

  it("mantem resultado em leads apenas para objetivos de geracao de leads", () => {
    expect(isLeadObjective("Cadastros")).toBe(true);
    expect(isLeadObjective("Alcance")).toBe(false);

    const rows = [
      HEADER,
      ["2026-09-01", "Campanha Lead", "Cadastros", "100", "10", "8", "7"],
      ["2026-09-01", "Campanha Alcance", "Alcance", "100", "10", "8", "900"],
    ];
    const [lead, reach] = parseCampaignRows(rowsToObjects(rows)).records;
    expect(lead.leads).toBe(7);
    expect(reach.leads).toBe(0);
    expect(reach.result_value).toBe(900);
  });

  it("falha quando o cabecalho e invalido", () => {
    expect(() => rowsToObjects([["a", "b"], ["1", "2"]])).toThrow(/cabecalho/);
  });
});
