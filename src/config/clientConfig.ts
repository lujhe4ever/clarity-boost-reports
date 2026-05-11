export type ClientConfig = {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logo: string;
  messageDashboard: string;
};

type ClientConfigSource = {
  company_name?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  logo_url?: string | null;
  dashboard_message?: string | null;
  manager_message?: string | null;
};

export const defaultClientConfig: ClientConfig = {
  name: "Metrica",
  primaryColor: "#0f766e",
  secondaryColor: "#0891b2",
  logo: "",
  messageDashboard: "",
};

export function resolveClientConfig(client?: ClientConfigSource | null): ClientConfig {
  if (!client) return defaultClientConfig;

  return {
    name: client.company_name?.trim() || defaultClientConfig.name,
    primaryColor: client.primary_color?.trim() || defaultClientConfig.primaryColor,
    secondaryColor: client.secondary_color?.trim() || defaultClientConfig.secondaryColor,
    logo: client.logo_url?.trim() || defaultClientConfig.logo,
    messageDashboard:
      client.dashboard_message?.trim() ||
      client.manager_message?.trim() ||
      defaultClientConfig.messageDashboard,
  };
}
