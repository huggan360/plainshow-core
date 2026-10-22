import { Avatar } from '@/Components/ui';
import { CSSProperties } from 'react';
import { t } from '@/i18n';

export type Access = 'none' | 'view' | 'edit';
export type Member = { id: number; name: string; username: string; status: string; permissions: Record<string, Access> };
export type Group = {
    id: number; name: string; color: string; ownerId: number; ownerName: string | null; createdAt: string | null;
    canManage: boolean; isMember: boolean; members: Member[];
};

export const COLORS = ['#fc5000', '#e5534b', '#f5b301', '#2ea043', '#14b8a6', '#3b82f6', '#8e7cf0', '#db2777', '#8a8a8a'];

export const groupStyle = (group: Pick<Group, 'color'>) => ({ '--group-color': group.color } as CSSProperties);

export function initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?';
}

/** The group's round mark: its first letter on its colour. */
export function GroupMark({ group, size = 'md' }: { group: Pick<Group, 'name' | 'color'>; size?: 'md' | 'lg' }) {
    return <span className={`group-mark group-mark--${size}`} style={groupStyle(group)} aria-hidden="true">{group.name.trim()[0]?.toUpperCase() ?? '?'}</span>;
}

export function MemberAvatar({ member, size = 'sm' }: { member: Pick<Member, 'id' | 'name'>; size?: 'xs' | 'sm' }) {
    return <Avatar src={`/avatars/${member.id}`} initials={initials(member.name)} size={size} alt="" />;
}

/** What a LaTeX access level means, in words. */
export const ACCESS_LABEL: Record<Access, string> = { none: t('No access'), view: t('Can view'), edit: t('Can edit') };

/** Colour swatches with a custom colour at the end. */
export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
    return <div className="group-swatches" role="radiogroup" aria-label={t('Colour')}>
        {COLORS.map((color) => <button key={color} type="button" role="radio" aria-checked={color === value.toLowerCase()} aria-label={color}
            className={`group-swatch${color === value.toLowerCase() ? ' is-active' : ''}`} style={{ '--group-color': color } as CSSProperties} onClick={() => onChange(color)} />)}
        <input type="color" className="group-swatch group-swatch--pick" value={value} aria-label={t('Another colour')} onChange={(event) => onChange(event.target.value)} />
    </div>;
}
