import AppShell from '@/Layouts/AppShell';
import { Badge, Button, Empty, Frame, FrameHead, relativeTime } from '@/Components/ui';
import { router } from '@inertiajs/react';
import { Fragment, ReactNode, useEffect, useState } from 'react';

type Release = { name: string; ref: string; at: string | null; current: boolean };
type Component = {
    id: string; name: string; kind: 'release' | 'checkout' | 'library'; installed: string | null; installedRef: string | null; latest: string | null;
    updateAvailable: boolean; changelog: string | null; releases: Release[]; error: string | null; checkedAt: string | null;
};
type Job = { id: number; component: string; action: 'check' | 'update' | 'rollback'; target: string | null; status: 'queued' | 'running' | 'done' | 'failed'; log: string | null; requestedBy: string | null; createdAt: string; finishedAt: string | null };

const STATUS: Record<Job['status'], { tone: 'green' | 'amber' | 'red' | 'accent' | undefined; label: string }> = {
    queued: { tone: undefined, label: 'Waiting' }, running: { tone: 'accent', label: 'Running' }, done: { tone: 'green', label: 'Done' }, failed: { tone: 'red', label: 'Failed' },
};
const KIND: Record<Component['kind'], string> = { release: 'Releases', checkout: 'Checkout', library: 'Library' };

export default function Updates({ components, jobs, runnerSeen }: { components: Component[]; jobs: Job[]; runnerSeen: boolean }) {
    const active = jobs.some((job) => job.status === 'queued' || job.status === 'running');
    const busy = (id: string) => jobs.some((job) => (job.component === id || job.action === 'check') && (job.status === 'queued' || job.status === 'running'));

    // While the dashboard installs itself, it shows the "updating" page to
    // everyone (this page too), so wait until it answers again.
    const coreBusy = jobs.some((job) => job.component === 'core' && job.action === 'update' && (job.status === 'queued' || job.status === 'running'));
    useEffect(() => {
        if (!active) return;
        const timer = window.setInterval(() => {
            if (!coreBusy) { router.reload({ only: ['components', 'jobs'] }); return; }
            fetch('/up', { cache: 'no-store' }).then((response) => { if (response.status !== 503) router.reload({ only: ['components', 'jobs'] }); }).catch(() => undefined);
        }, 3000);
        return () => window.clearInterval(timer);
    }, [active, coreBusy]);

    const request = (component: string, action: Job['action'], target?: string, question?: string) => {
        if (question && !window.confirm(question)) return;
        router.post('/admin/updates', { component, action, target: target ?? null }, { preserveScroll: true });
    };
    const available = components.filter((component) => component.updateAvailable).length;

    return (
        <AppShell title="Updates" wide description="Installed and available versions of every part of PlainShow, from GitHub. An update is built, checked and switched in one step; visitors see an updating page meanwhile, the old version is removed afterwards, and it goes back by itself if the new version does not answer."
            actions={<Button icon="bx-refresh" onClick={() => request('all', 'check')} disabled={busy('all')}>Check now</Button>}>
            {coreBusy && <div className="ps-alert"><i className="bx bx-loader-alt bx-spin" /><span>The dashboard is updating itself. It is unavailable for a minute or two, and this page carries on by itself.</span></div>}
            {!runnerSeen && <div className="ps-alert"><i className="bx bx-time-five" /><span>The update runner has not checked yet. It runs every minute; press Check now.</span></div>}
            <div className="updates">
                <div className="updates__list">
                    {available > 0 && <p className="ps-small ps-muted">{available === 1 ? 'One update is' : `${available} updates are`} ready to install.</p>}
                    {components.map((component) => (
                        <ComponentCard key={component.id} component={component} busy={busy(component.id)}
                            onUpdate={() => request(component.id, 'update', component.latest!, `Install ${component.name} ${component.latest}?`)}
                            onSwitch={(release) => request(component.id, 'rollback', release.name, `Switch ${component.name} to ${release.ref}?`)} />
                    ))}
                </div>
                <Frame compact className="updates__jobs">
                    <FrameHead title="Activity" />
                    {jobs.length === 0
                        ? <Empty icon="bx-history">Nothing has run yet.</Empty>
                        : <ul className="updates-jobs">{jobs.map((job) => <JobRow key={job.id} job={job} name={components.find((component) => component.id === job.component)?.name ?? 'Everything'} open={job.status === 'running' || job.status === 'failed'} />)}</ul>}
                </Frame>
            </div>
        </AppShell>
    );
}

function ComponentCard({ component, busy, onUpdate, onSwitch }: { component: Component; busy: boolean; onUpdate: () => void; onSwitch: (release: Release) => void }) {
    const [showReleases, setShowReleases] = useState(false);
    return (
        <Frame variant={component.updateAvailable ? 'gradient' : 'soft'}>
            <div className="update-card">
                <div className="update-card__head">
                    <div className="update-card__title">
                        <h2 className="ps-frame__title">{component.name}</h2>
                        <Badge>{KIND[component.kind]}</Badge>
                        {component.updateAvailable ? <Badge tone="accent">Update</Badge> : component.installed && component.kind !== 'library' && <Badge tone="green">Up to date</Badge>}
                    </div>
                    {component.updateAvailable && <Button variant="primary" size="sm" icon="bx-download" loading={busy} disabled={busy} onClick={onUpdate}>Install {component.latest}</Button>}
                </div>
                <dl className="update-card__facts">
                    <div><dt>Installed</dt><dd className="ps-mono">{component.installed ?? 'Unknown'}</dd></div>
                    <div><dt>Latest</dt><dd className="ps-mono">{component.latest ?? 'No tags yet'}</dd></div>
                    <div><dt>Checked</dt><dd>{component.checkedAt ? relativeTime(component.checkedAt) : 'Never'}</dd></div>
                </dl>
                {component.error && <div className="ps-alert"><i className="bx bx-error-circle" /><span>{component.error}</span></div>}
                {component.updateAvailable && component.changelog && (
                    <details className="update-card__notes" open>
                        <summary>What is new</summary>
                        <Changelog text={component.changelog} />
                    </details>
                )}
                {component.kind === 'release' && component.releases.length > 0 && (
                    <div className="update-card__releases">
                        <button type="button" className="update-card__toggle" aria-expanded={showReleases} onClick={() => setShowReleases((open) => !open)}>
                            <i className={`bx ${showReleases ? 'bx-chevron-down' : 'bx-chevron-right'}`} aria-hidden="true" />Kept releases ({component.releases.length})
                        </button>
                        {showReleases && (
                            <ul className="ps-list">
                                {component.releases.map((release) => (
                                    <li key={release.name} className="ps-row">
                                        <span className="ps-row__icon"><i className={`bx ${release.current ? 'bx-check-circle' : 'bx-archive'}`} aria-hidden="true" /></span>
                                        <span className="ps-row__body"><span className="ps-row__title ps-mono">{release.ref}</span><span className="ps-row__meta">{release.at ? new Date(release.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : release.name}</span></span>
                                        <span className="ps-row__action">{release.current ? <Badge tone="green">Live</Badge> : <Button size="sm" icon="bx-undo" disabled={busy} onClick={() => onSwitch(release)}>Switch</Button>}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </Frame>
    );
}

function JobRow({ job, name, open }: { job: Job; name: string; open: boolean }) {
    const status = STATUS[job.status];
    const what = job.action === 'check' ? 'Check for updates' : job.action === 'update' ? `${name} ${job.target}` : `${name} back to ${job.target?.replace(/^\d{14}-/, '')}`;
    return (
        <li className="updates-job">
            <details open={open}>
                <summary>
                    <span className="updates-job__what">{what}</span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <span className="ps-small ps-muted updates-job__when">{job.requestedBy ? `${job.requestedBy}, ` : ''}{relativeTime(job.finishedAt ?? job.createdAt)}</span>
                </summary>
                {job.log ? <pre className="updates-job__log">{job.log}</pre> : <p className="ps-small ps-muted">No output yet.</p>}
            </details>
        </li>
    );
}

/** The small part of Markdown changelogs use: headings, bullets and `code`. */
function Changelog({ text }: { text: string }) {
    const blocks: ReactNode[] = [];
    let list: string[] = [];
    const flush = () => {
        if (list.length) blocks.push(<ul key={`l${blocks.length}`}>{list.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>);
        list = [];
    };
    text.split('\n').forEach((line) => {
        if (line.startsWith('## ')) { flush(); blocks.push(<h3 key={`h${blocks.length}`} className="update-notes__version">{line.slice(3)}</h3>); }
        else if (/^\s*[-*] /.test(line)) list.push(line.replace(/^\s*[-*] /, ''));
        else if (/^\s+\S/.test(line) && list.length) list[list.length - 1] += ` ${line.trim()}`;
        else if (line.trim()) { flush(); blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>); }
    });
    flush();
    return <div className="update-notes">{blocks}</div>;
}

function inline(text: string): ReactNode {
    return text.split(/(`[^`]+`)/).map((part, index) => (part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : <Fragment key={index}>{part}</Fragment>));
}
