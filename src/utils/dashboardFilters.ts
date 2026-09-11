import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";

export type DashboardPeriod = "7" | "30" | "90" | "all";
export type DashboardCampaign = { date: string; campaign_name: string };

function normalizeCampaignName(name: string) {
  return name.trim() || "Sem nome";
}

export function getCampaignNames<T extends DashboardCampaign>(campaigns: T[]) {
  return Array.from(
    new Set(campaigns.map((campaign) => normalizeCampaignName(campaign.campaign_name))),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function getAvailableMonths<T extends DashboardCampaign>(campaigns: T[]) {
  return Array.from(new Set(campaigns.map((campaign) => campaign.date.slice(0, 7))))
    .filter((month) => /^\d{4}-\d{2}$/.test(month))
    .sort((a, b) => b.localeCompare(a));
}

export function filterByCampaign<T extends DashboardCampaign>(campaigns: T[], name: string) {
  if (name === "all") return campaigns;
  return campaigns.filter((campaign) => normalizeCampaignName(campaign.campaign_name) === name);
}

export function filterByMonth<T extends DashboardCampaign>(campaigns: T[], month: string) {
  if (month === "all") return campaigns;
  return campaigns.filter((campaign) => campaign.date.slice(0, 7) === month);
}

export function getPeriodWindow<T extends DashboardCampaign>(
  campaigns: T[],
  period: DashboardPeriod,
) {
  if (campaigns.length === 0) return null;

  const ordered = [...campaigns].sort((a, b) => a.date.localeCompare(b.date));
  const earliestDate = startOfDay(parseISO(ordered[0].date));
  const latestDate = startOfDay(parseISO(ordered[ordered.length - 1].date));

  if (period === "all") {
    return {
      start: earliestDate,
      end: latestDate,
      spanDays: Math.max(1, differenceInCalendarDays(latestDate, earliestDate) + 1),
    };
  }

  const spanDays = Number(period);
  return {
    start: addDays(latestDate, -(spanDays - 1)),
    end: latestDate,
    spanDays,
  };
}

export function filterByPeriod<T extends DashboardCampaign>(
  campaigns: T[],
  period: DashboardPeriod,
) {
  const window = getPeriodWindow(campaigns, period);
  if (!window) return [];

  return campaigns.filter((campaign) => {
    const date = startOfDay(parseISO(campaign.date));
    return date >= window.start && date <= window.end;
  });
}

export function getMonthWindow(month: string) {
  const start = startOfMonth(parseISO(`${month}-01`));
  return { start, end: endOfMonth(start) };
}

export function getPreviousMonthWindow(month: string) {
  const previous = subMonths(parseISO(`${month}-01`), 1);
  return { start: startOfMonth(previous), end: endOfMonth(previous) };
}
