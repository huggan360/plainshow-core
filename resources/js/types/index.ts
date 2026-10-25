export type Role = string;

export type UserSummary = {
    id: number;
    username: string;
    name: string;
    firstName: string;
    lastName: string;
    initials: string;
    avatar: string | null;
    role: Role;
    status: string;
};

export type AppLink = { id: string; name: string; icon: string; url: string | null };

/** An app inside the dashboard (Weather, News): opened in the content area, and from its widgets. */
export type CoreApp = { id: string; name: string; icon: string; url: string; widgets: string[] };
export type AdminArea = { id: string; href: string; icon: string; label: string; description: string };
export type WeatherPlace = { name: string; region?: string; country?: string; countryCode?: string; lat: number; lon: number };

export type SharedProps = {
    auth: { user: UserSummary | null; capabilities: string[] };
    apps: AppLink[];
    coreApps: CoreApp[];
    /** The admin areas this person may open (empty: no Administration at all). */
    adminAreas: AdminArea[];
    weatherHome: WeatherPlace | null;
    flash: { status: string | null; error: string | null };
    errors: Record<string, string>;
    uiVersion: string;
    /** Every installed app's address, by app id (core, login, cloud, ...). */
    platform: Record<string, string>;
    /** The theme colour: orange, teal, indigo, red or yellow (kit Theme). */
    accent: string;
};

export function can(capabilities: string[], capability: string): boolean {
    return capabilities.includes('*') || capabilities.includes(capability);
}
