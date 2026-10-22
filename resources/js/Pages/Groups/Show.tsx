import { Badge, Button, ButtonLink, Frame, FrameHead } from '@/Components/ui';
import AppShell from '@/Layouts/AppShell';
import { router } from '@inertiajs/react';
import { ACCESS_LABEL, Group, GroupMark, MemberAvatar } from './shared';
import { t, tn } from '@/i18n';

/** One group: who is in it and what they can do. Editing is a button away. */
export default function GroupShow({ group, viewerId }: { group: Group; viewerId: number }) {
    const owner = group.ownerId === viewerId;
    const leave = () => {
        if (window.confirm(t('Leave {name}? You lose what is shared with the group.', { name: group.name }))) router.delete(`/groups/${group.id}/members/${viewerId}`);
    };

    return <AppShell title={group.name} heading={false}>
        <div className="group-page">
            <ButtonLink href="/groups" variant="ghost" size="sm" icon="bx-arrow-back">{t('All groups')}</ButtonLink>
            <div className="group-hero">
                <GroupMark group={group} size="lg" />
                <div className="group-hero__text">
                    <h1 className="ps-page-head__title">{group.name}</h1>
                    <p className="ps-page-head__text">{tn(group.members.length, '1 member', '{n} members')}{group.ownerName ? (owner ? t(', owned by you') : t(', owned by {name}', { name: group.ownerName })) : ''}</p>
                </div>
                <div className="group-hero__actions">
                    {group.isMember && !owner && <Button variant="ghost" icon="bx-log-out" onClick={leave}>{t('Leave')}</Button>}
                    {group.canManage && <ButtonLink href={`/groups/${group.id}/edit`} variant="primary" icon="bx-edit-alt">{t('Edit')}</ButtonLink>}
                </div>
            </div>
            <Frame>
                <FrameHead title={t('People')} text={t('LaTeX projects shared with the group open for each person as shown.')} />
                <ul className="ps-list">
                    {group.members.map((member) => (
                        <li key={member.id} className="ps-row group-member">
                            <MemberAvatar member={member} />
                            <span className="ps-row__body">
                                <span className="ps-row__title">{member.name}{member.id === viewerId && <span className="ps-muted"> {' '}{t('(you)')}</span>}</span>
                                <span className="ps-row__meta">@{member.username}</span>
                            </span>
                            <span className="group-member__badges">
                                {member.id === group.ownerId && <Badge tone="accent">{t('Owner')}</Badge>}
                                {member.status !== 'active' && <Badge tone="red">{t('Turned off')}</Badge>}
                                <span className="ps-small ps-muted">{t('LaTeX:')}{' '}{ACCESS_LABEL[member.permissions.latex ?? 'none'].toLowerCase()}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </Frame>
        </div>
    </AppShell>;
}
