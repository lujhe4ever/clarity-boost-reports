import { describe, expect, it } from "vitest";

import {
  filterByCampaign,
  filterByMonth,
  filterByPeriod,
  getAvailableMonths,
  getCampaignNames,
} from "./dashboardFilters";

const rows = [
  { date: "2026-01-05", campaign_name: "Campanha A", leads: 2 },
  { date: "2026-01-31", campaign_name: "Campanha B", leads: 3 },
  { date: "2026-02-01", campaign_name: "Campanha A", leads: 5 },
  { date: "2026-02-10", campaign_name: "Campanha B", leads: 7 },
];

describe("dashboard filters", () => {
  it("lists campaigns and months without duplicates", () => {
    expect(getCampaignNames(rows)).toEqual(["Campanha A", "Campanha B"]);
    expect(getAvailableMonths(rows)).toEqual(["2026-02", "2026-01"]);
  });

  it("isolates the selected campaign", () => {
    expect(filterByCampaign(rows, "Campanha A").map((row) => row.leads)).toEqual([2, 5]);
    expect(filterByCampaign(rows, "all")).toHaveLength(4);
  });

  it("isolates the selected calendar month", () => {
    expect(filterByMonth(rows, "2026-01").map((row) => row.leads)).toEqual([2, 3]);
  });

  it("keeps rolling periods anchored to the latest filtered row", () => {
    expect(filterByPeriod(rows, "7").map((row) => row.leads)).toEqual([7]);
  });
});
