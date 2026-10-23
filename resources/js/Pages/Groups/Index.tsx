import { Button, Empty, Field, Modal } from '@/Components/ui';
import AppShell from '@/Layouts/AppShell';
import { Link, useForm } from '@inertiajs/react';
import { FormEvent, useState } from 'react';
import { ColorPicker, Group, groupStyle, GroupMark, MemberAvatar } from './shared';
import { t } from '@/i18n';

/** All your groups as cards; a card opens the group. */
export default function GroupsIndex({ groups, canCreate, viewerId }: { groups: Group[]; canCreate: boolean; viewerId: number }) {
    const [creating, setCreating] = useState(false);
    const form = useForm({ name: '', color: '#fc5000' });
    const create = (event: FormEvent) => {
        event.preventDefault();
        form.post('/groups', { onSuccess: () => { form.reset(); setCreating(false); } });
    };

    return <AppShell title={t('Groups')} description={t('The people you share projects, files and calendars with.')} actions={canCreate && <Button variant="primary" icon="bx-plus" onClick={() => setCreating(true)}>{t('New group')}</Button>}>
        {groups.length === 0 ? (
            <Empty icon="bx-group">
                <p>{t('You are not in any group yet.')}</p>
                {canCreate && <Button variant="primary" icon="bx-plus" onClick={() => setCreating(true)}>{t('Make a group')}</Button>}
            </Empty>
        ) : (
            <div className="group-list">
                {groups.map((group) => {
                    const shown = group.members.slice(0, 5);
                    return <Link key={group.id} href={`/groups/${group.id}`} className="ps-frame ps-frame--compact group-card" style={groupStyle(group)}>
                        <span className="ps-frame__panel group-card__panel">
                            <GroupMark group={group} />
                            <span className="group-card__title">
                                <strong>{group.name}</strong>
                                <span>
                                    {group.members.length === 1 ? t('1 member') : t('{n} members', { n: group.members.length })}
                                    {', '}
                                    {group.ownerId === viewerId ? t('You own this group') : group.ownerName ? t('Owned by {ownerName}', { ownerName: group.ownerName }) : t('No owner')}
                                </span>
                            </span>
                            <span className="group-card__people">
                                {!group.isMember && <span className="group-card__tag">{t('Not a member')}</span>}
                                <span className="group-stack">{shown.map((member) => <MemberAvatar key={member.id} member={member} size="xs" />)}</span>
                                {group.members.length > shown.length && <span className="group-card__more">+{group.members.length - shown.length}</span>}
                            </span>
                            <i className="bx bx-chevron-right group-card__go" aria-hidden="true" />
                        </span>
                    </Link>;
                })}
            </div>
        )}
        <Modal open={creating} title={t('New group')} onClose={() => setCreating(false)} footer={<><Button variant="ghost" onClick={() => setCreating(false)}>{t('Cancel')}</Button><Button variant="primary" loading={form.processing} onClick={create}>{t('Create')}</Button></>}>
            <form className="ps-stack" onSubmit={create}>
                <Field label={t('Name')} htmlFor="group-name" error={form.errors.name}><input id="group-name" className="ps-input" value={form.data.name} autoFocus onChange={(event) => form.setData('name', event.target.value)} /></Field>
                <Field label={t('Colour')} error={form.errors.color}><ColorPicker value={form.data.color} onChange={(color) => form.setData('color', color)} /></Field>
                <p className="ps-small ps-muted">{t('You can add people right after.')}</p>
            </form>
        </Modal>
    </AppShell>;
}
