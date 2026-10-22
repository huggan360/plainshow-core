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

export type SharedProps = {
    auth: { user: UserSummary | null; capabilities: string[] };
    apps: AppLink[];
    flash: { status: string | null; error: string | null };
    errors: Record<string, string>;
    uiVersion: string;
};

export function can(capabilities: string[], capability: string): boolean {
    return capabilities.includes('*') || capabilities.includes(capability);
}
