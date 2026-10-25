import AppShell from '@/Layouts/AppShell';
import { relativeTime } from '@/Components/ui';
import { CSSProperties, ReactNode, Ref, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t, locale } from '@/i18n';
import { expanding, settleExpand } from '@/Widgets/expand';
import { Place, PlaceSearch, send } from '@/Widgets/weatherKit';

/*
 * The News app, inside the dashboard. Laid out like a paper rather than a
 * grid of cards: a lead story with large type, the next stories beside it,
 * the latest headlines in a narrow column, then a section per topic with a
 * feature and a column of headlines. A bar of sections under the search
 * opens one topic as its own page. Alerts from the authorities (VMA, SMHI,
 * Krisinformation) come before everything. The reader shows the whole
 * article where the source publishes it openly, else the summary.
 * Stories come from /news/stories (App\Support\News).
 */
export type Story = { id: string; title: string; summary: string; url: string; image: string | null; time: string; source: string; sourceName: string; topic: string; topicName: string; full?: boolean };
type Alert = { id: string; level: 'vma' | 'red' | 'orange' | 'yellow' | 'info'; title: string; summary: string; body: string[]; source: string; url: string | null; time: string; area: string };
type Preferences = { setup: boolean; levels: Record<string, number>; topics: string[]; sources: string[]; place: Place | null };
type Catalogue = { topics: { id: string; name: string }[]; sources: { id: string; name: string; lang: string; topics: string[] }[] };
type Props = { preferences: Preferences; region: string | null; catalogue: Catalogue };
type Tab = 'top' | 'local';
type Reading = { kind: 'story'; story: Story } | { kind: 'alert'; alert: Alert };

export default function News({ preferences: start, region: startRegion, catalogue }: Props) {
    const [preferences, setPreferences] = useState(start);
    const [region, setRegion] = useState(startRegion);
    // The Composer and links can open a tab, a section, a search or a story: ?tab=local, ?topic=sweden, ?q=…, ?read=<id>.
    const [link] = useState(() => new URLSearchParams(window.location.search));
    const [tab, setTab] = useState<Tab>(() => (link.get('tab') === 'local' ? 'local' : 'top'));
    const [topic, setTopic] = useState<string | null>(() => (link.get('topic') && catalogue.topics.some((item) => item.id === link.get('topic')) ? link.get('topic') : null));
    const [query, setQuery] = useState(() => link.get('q') ?? '');
    const [search, setSearch] = useState(() => (link.get('q') ?? '').trim());
    const [readId, setReadId] = useState(() => link.get('read'));
    const [stories, setStories] = useState<Story[] | null>(null);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [failed, setFailed] = useState(false);
    const [reading, setReading] = useState<Reading | null>(null);
    const [settings, setSettings] = useState(false);
    const [version, setVersion] = useState(0);
    const [grown] = useState(expanding);
    const scroller = useRef<HTMLDivElement>(null);
    const [searching, setSearching] = useState(() => !!link.get('q'));
    const searchInput = useRef<HTMLInputElement>(null);
    useEffect(() => { if (searching) searchInput.current?.focus(); }, [searching]);

    // Typing searches after a short pause.
    useEffect(() => {
        const timer = window.setTimeout(() => setSearch(query.trim()), 350);
        return () => window.clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        if (!preferences.setup) { settleExpand(); return; }
        let alive = true;
        setFailed(false);
        const params = new URLSearchParams({ tab, limit: search ? '40' : topic ? '50' : '90' });
        if (search) params.set('q', search);
        if (topic && !search) params.set('topic', topic);
        fetch(`/news/stories?${params}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
            .then((data: { stories: Story[]; alerts: Alert[] }) => { if (alive) { setStories(data.stories); setAlerts(data.alerts ?? []); } })
            .catch(() => { if (alive) setFailed(true); })
            .finally(() => settleExpand());
        return () => { alive = false; };
    }, [tab, topic, search, preferences.setup, version]);

    useEffect(() => {
        const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setReading(null); setSettings(false); } };
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
    }, []);

    const save = (patch: Partial<Preferences>) => send<{ preferences: Preferences; region: string | null }>('PUT', '/news/preferences', patch)
        .then((answer) => { setPreferences(answer.preferences); setRegion(answer.region); setStories(null); setVersion((value) => value + 1); });
    const open = (next: { tab?: Tab; topic?: string | null }) => {
        if (next.tab) setTab(next.tab);
        if (next.topic !== undefined) setTopic(next.topic);
        setQuery(''); setSearch(''); setStories(null);
        scroller.current?.scrollTo({ top: 0, behavior: 'smooth' });
        if (window.innerWidth <= 991) window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const readStory = (story: Story) => setReading({ kind: 'story', story });
    // A story asked for in the address opens once it is among the loaded ones.
    useEffect(() => {
        if (window.location.search) window.history.replaceState(window.history.state, '', '/news');
    }, []);
    useEffect(() => {
        if (!readId || !stories) return;
        const story = stories.find((item) => item.id === readId);
        if (story) setReading({ kind: 'story', story });
        setReadId(null);
    }, [stories, readId]);

    const town = preferences.place?.name;
    const topicName = topic ? catalogue.topics.find((item) => item.id === topic)?.name ?? topic : null;
    return (
        <AppShell title={topicName ?? t('News')} wide heading={false} app>
            <section className={`ps-frame nwa-frame${grown ? '' : ' is-entering'}`}>
                <div className="ps-frame__panel">
                    <Backdrop />
                    <div className="nwa" ref={scroller}>
                        <header className={`nwa__bar${searching ? ' is-searching' : ''}`}>
                            {/* On phones the search is an icon that opens the field over the bar. */}
                            <button type="button" className="nwa__icon nwa__search-open" onClick={() => setSearching(true)} aria-label={t('Search the news')}><i className="bx bx-search" /></button>
                            <div className="nwa__search">
                                <div className="ps-input-wrap"><i className="bx bx-search" aria-hidden="true" />
                                    <input ref={searchInput} className="ps-input" type="search" value={query} placeholder={t('Search the news')} aria-label={t('Search the news')} onChange={(event) => setQuery(event.target.value)} /></div>
                                <button type="button" className="nwa__icon nwa__search-close" onClick={() => { setSearching(false); setQuery(''); }} aria-label={t('Close')}><i className="bx bx-x" /></button>
                            </div>
                            <nav className="nwa-tabs" aria-label={t('Edition')}>
                                <button type="button" className={tab === 'top' ? 'is-active' : undefined} aria-pressed={tab === 'top'} onClick={() => open({ tab: 'top' })}>{t('Top news')}</button>
                                <button type="button" className={tab === 'local' ? 'is-active' : undefined} aria-pressed={tab === 'local'} onClick={() => open({ tab: 'local', topic: null })}>{town ? t('Local, {town}', { town }) : t('Local')}</button>
                            </nav>
                            <button type="button" className="nwa__icon nwa__settings" onClick={() => setSettings(true)} aria-label={t('News settings')} title={t('News settings')}><i className="bx bx-cog" /></button>
                        </header>

                        {tab === 'top' && !search && <Sections catalogue={catalogue} order={preferences.topics} active={topic} onOpen={(next) => open({ topic: next })} />}
                        {(tab === 'local' || search) && <p className="nwa-date">{search ? t('Search for “{query}”', { query: search }) : new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>}

                        {preferences.setup && !search && !topic && alerts.length > 0 && <Alerts alerts={alerts} onRead={(alert) => setReading({ kind: 'alert', alert })} />}

                        {!preferences.setup ? null
                            : failed && !stories ? <p className="nwa-note">{t('The news could not be fetched. Try again in a moment.')}</p>
                                : !stories ? <Skeleton />
                                    : search ? <Results stories={stories} search={search} onRead={readStory} />
                                        : tab === 'local' ? <Local stories={stories} town={town} region={region} onRead={readStory} onSettings={() => setSettings(true)} />
                                            : topic ? <Edition stories={stories} title={topicName ?? ''} onRead={readStory} />
                                                : <Front stories={stories} order={preferences.topics} onRead={readStory} onTopic={(next) => open({ topic: next })} />}
                    </div>

                    {reading && <Layer><Reader reading={reading} stories={stories ?? []} onRead={readStory} onClose={() => setReading(null)} /></Layer>}
                    {settings && <Layer><Settings preferences={preferences} catalogue={catalogue} region={region} onSave={save} onClose={() => setSettings(false)} /></Layer>}
                    {!preferences.setup && <Layer><Setup preferences={preferences} catalogue={catalogue} onSave={save} /></Layer>}
                </div>
            </section>
        </AppShell>
    );
}

/**
 * The reader, the settings and the setup. On a computer they lie over the
 * frame, which fills the window. On phones and tablets the page scrolls, and
 * the frame's glass would hold them inside it (far up a long page, with square
 * corners over its round ones), so there they cover the whole screen from the
 * top, and the page behind them stays still.
 */
function Layer({ children }: { children: ReactNode }) {
    const [narrow] = useState(() => window.matchMedia('(max-width: 991px)').matches);
    useEffect(() => {
        if (!narrow) return;
        const before = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = before; };
    }, [narrow]);
    return narrow ? createPortal(<div className="nwa-layer">{children}</div>, document.body) : <>{children}</>;
}

/** The paper's colours behind the page, following the time of day. */
function Backdrop() {
    const hour = new Date().getHours();
    const phase = hour < 6 || hour >= 22 ? 'night' : hour < 10 ? 'morning' : hour < 17 ? 'day' : 'evening';
    return <div className={`nwa-backdrop nwa-backdrop--${phase}`} aria-hidden="true"><span /><span /><span /></div>;
}

/** The paper's sections, the front page first; a line slides to the one that is open. */
function Sections({ catalogue, order, active, onOpen }: { catalogue: Catalogue; order: string[]; active: string | null; onOpen: (topic: string | null) => void }) {
    const bar = useRef<HTMLDivElement>(null);
    const [line, setLine] = useState<{ left: number; width: number } | null>(null);
    // Their topics in the order they chose, then the rest.
    const items = [...order, ...catalogue.topics.map((item) => item.id).filter((id) => !order.includes(id))];
    const name = (id: string) => catalogue.topics.find((item) => item.id === id)?.name ?? id;
    useLayoutEffect(() => {
        const element = bar.current?.querySelector<HTMLElement>('.is-active');
        if (!element || !bar.current) return;
        setLine({ left: element.offsetLeft, width: element.offsetWidth });
        element.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }, [active, order.join()]);
    const today = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
    return (
        <div className="nwa-sections">
            <span className="nwa-date">{today}</span>
            <div ref={bar} className="nwa-sections__bar" role="tablist" aria-label={t('Sections')}>
                <button type="button" role="tab" aria-selected={!active} className={!active ? 'is-active' : undefined} onClick={() => onOpen(null)}>{t('Front page')}</button>
                {items.map((id) => (
                    <button key={id} type="button" role="tab" aria-selected={active === id} className={`${active === id ? 'is-active' : ''}${order.includes(id) ? '' : ' is-other'}`} onClick={() => onOpen(id)}>{name(id)}</button>
                ))}
                {line && <span className="nwa-sections__line" style={{ transform: `translateX(${line.left}px)`, width: line.width }} aria-hidden="true" />}
            </div>
        </div>
    );
}

/* ---------- Alerts ---------- */
const ALERT_LEVEL: Record<Alert['level'], string> = { vma: 'Important public announcement', red: 'Red warning', orange: 'Orange warning', yellow: 'Yellow warning', info: 'From the authorities' };
const DISMISSED = 'plainshow-news-dismissed';
function readDismissed(): string[] {
    try { return JSON.parse(localStorage.getItem(DISMISSED) ?? '[]') as string[]; } catch { return []; }
}
/** Alerts can be closed; a closed alert stays closed on this device (a VMA cannot be closed). */
function Alerts({ alerts, onRead }: { alerts: Alert[]; onRead: (alert: Alert) => void }) {
    const [dismissed, setDismissed] = useState<string[]>(readDismissed);
    const shown = alerts.filter((alert) => alert.level === 'vma' || !dismissed.includes(alert.id));
    const close = (id: string) => {
        const next = [...dismissed.filter((item) => item !== id), id].slice(-100);
        setDismissed(next);
        try { localStorage.setItem(DISMISSED, JSON.stringify(next)); } catch { /* private mode */ }
    };
    if (shown.length === 0) return null;
    return (
        <section className="nwa-alerts" aria-label={t('Alerts')}>
            {shown.map((alert) => (
                <div key={alert.id} className={`nwa-alert nwa-alert--${alert.level}`}>
                    <button type="button" className="nwa-alert__open" onClick={() => onRead(alert)}>
                        <i className={`bx ${alert.level === 'vma' ? 'bxs-megaphone' : alert.level === 'info' ? 'bx-info-circle' : 'bxs-error'}`} aria-hidden="true" />
                        <span className="nwa-alert__text">
                            <span className="nwa-alert__kind">{t(ALERT_LEVEL[alert.level])}{alert.area ? `, ${alert.area}` : ''}</span>
                            <strong>{alert.title}</strong>
                        </span>
                        <span className="nwa-alert__source">{alert.source}</span>
                    </button>
                    {alert.level !== 'vma' && <button type="button" className="nwa-alert__close" onClick={() => close(alert.id)} aria-label={t('Close')} title={t('Close')}><i className="bx bx-x" /></button>}
                </div>
            ))}
        </section>
    );
}

function Kicker({ story }: { story: Story }) {
    return <span className="nwa-kicker"><span>{story.topicName}</span><span className="nwa-kicker__source">{story.sourceName}</span></span>;
}
function When({ story }: { story: Story }) {
    return <time className="nwa-when" dateTime={story.time}>{relativeTime(story.time)}</time>;
}
function Picture({ story, className = '' }: { story: Story; className?: string }) {
    const [broken, setBroken] = useState(false);
    if (!story.image || broken) return <span className={`nwa-picture nwa-picture--none ${className}`} aria-hidden="true"><i className="bx bx-news" /></span>;
    return <span className={`nwa-picture ${className}`}><img src={story.image} alt="" loading="lazy" onError={() => setBroken(true)} /></span>;
}
function Open({ story, onRead, children, className, ref }: { story: Story; onRead: (story: Story) => void; children: ReactNode; className: string; ref?: Ref<HTMLAnchorElement> }) {
    return <a ref={ref} href={story.url} className={className} onClick={(event) => { if (event.metaKey || event.ctrlKey) return; event.preventDefault(); onRead(story); }}>{children}</a>;
}

/** The top of a page: the lead and the next stories beside it, and optionally the latest. */
function Top({ lead, second, latest, onRead }: { lead: Story; second: Story[]; latest?: Story[]; onRead: (story: Story) => void }) {
    return (
        <section className={`nwa-top${latest ? '' : ' nwa-top--two'}`}>
            <Open story={lead} onRead={onRead} className="nwa-lead">
                <Picture story={lead} className="nwa-lead__picture" />
                <Kicker story={lead} />
                <h2 className="nwa-lead__title">{lead.title}</h2>
                {lead.summary && <p className="nwa-lead__summary">{lead.summary}</p>}
                <When story={lead} />
            </Open>
            <div className="nwa-second">
                {second.map((story) => (
                    <Open key={story.id} story={story} onRead={onRead} className="nwa-second__story">
                        <span className="nwa-second__text"><Kicker story={story} /><strong>{story.title}</strong><When story={story} /></span>
                        <Picture story={story} className="nwa-second__picture" />
                    </Open>
                ))}
            </div>
            {latest && (
                <aside className="nwa-latest" aria-label={t('Latest')}>
                    <h3 className="nwa-label">{t('Latest')}</h3>
                    <ol>
                        {latest.map((story) => (
                            <li key={story.id}><Open story={story} onRead={onRead} className="nwa-latest__story">
                                <span className="nwa-latest__time">{new Date(story.time).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}</span>
                                <span><strong>{story.title}</strong><small>{story.sourceName}</small></span>
                            </Open></li>
                        ))}
                    </ol>
                </aside>
            )}
        </section>
    );
}

/* ---------- The front page ---------- */
function Front({ stories, order, onRead, onTopic }: { stories: Story[]; order: string[]; onRead: (story: Story) => void; onTopic: (topic: string) => void }) {
    const layout = useMemo(() => {
        const used = new Set<string>();
        const take = (list: Story[], count: number) => { const picked = list.filter((story) => !used.has(story.id)).slice(0, count); picked.forEach((story) => used.add(story.id)); return picked; };
        const pictured = stories.filter((story) => story.image);
        // The lead comes from the topic they want most, if it has a picture.
        const lead = take(pictured.filter((story) => story.topic === order[0]), 1)[0] ?? take(pictured, 1)[0] ?? take(stories, 1)[0];
        const second = take(pictured, 4);
        const latest = [...stories].sort((a, b) => b.time.localeCompare(a.time)).filter((story) => !used.has(story.id)).slice(0, 9);
        latest.forEach((story) => used.add(story.id));
        const sections = order.map((topic) => ({ topic, list: take(stories.filter((story) => story.topic === topic), 7) })).filter((section) => section.list.length > 0);
        return { lead, second, latest, sections };
    }, [stories, order]);
    if (!layout.lead) return <p className="nwa-note">{t('No news right now.')}</p>;
    return (
        <div className="nwa-front">
            <Top lead={layout.lead} second={layout.second} latest={layout.latest} onRead={onRead} />
            {layout.sections.map(({ topic, list }) => <Section key={topic} title={list[0].topicName} stories={list} onRead={onRead} onOpen={() => onTopic(topic)} />)}
        </div>
    );
}

/** One topic as its own page. */
function Edition({ stories, title, onRead }: { stories: Story[]; title: string; onRead: (story: Story) => void }) {
    if (stories.length === 0) return <div className="nwa-empty"><strong>{t('Nothing in {topic} right now.', { topic: title })}</strong></div>;
    const pictured = stories.filter((story) => story.image);
    const lead = pictured[0] ?? stories[0];
    const rest = stories.filter((story) => story.id !== lead.id);
    const second = rest.filter((story) => story.image).slice(0, 4);
    const more = rest.filter((story) => !second.includes(story));
    return (
        <div className="nwa-front">
            <Top lead={lead} second={second} onRead={onRead} />
            {more.length > 0 && <Section title={t('More in {topic}', { topic: title })} stories={more.slice(0, 13)} onRead={onRead} />}
            {more.length > 13 && <Section title={t('Earlier')} stories={more.slice(13, 26)} onRead={onRead} />}
        </div>
    );
}

/**
 * A topic: one feature with its picture, and beside it a column of headlines
 * in rows like the widgets' (rounder at the top and bottom). The column is as
 * tall as the feature: as many headlines as fit, then a row to the section.
 */
function Section({ title, stories, onRead, onOpen }: { title: string; stories: Story[]; onRead: (story: Story) => void; onOpen?: () => void }) {
    const [feature, ...rest] = stories;
    const featureRef = useRef<HTMLAnchorElement>(null);
    const linesRef = useRef<HTMLUListElement>(null);
    const [fit, setFit] = useState(rest.length);
    useLayoutEffect(() => {
        const measure = () => {
            const column = linesRef.current;
            const lead = featureRef.current;
            if (!column || !lead) return;
            // One column on narrow screens: four headlines, then the row to the section.
            if (window.innerWidth <= 991) { setFit(Math.min(rest.length, 4)); return; }
            const room = lead.offsetHeight;
            const rows = Array.from(column.children) as HTMLElement[];
            let used = onOpen ? 52 : 0; // the "more" row
            let count = 0;
            for (const row of rows) {
                if (row.dataset.more) continue;
                used += row.offsetHeight + 3;
                if (used > room) break;
                count++;
            }
            setFit(Math.max(2, count));
        };
        measure();
        const observer = new ResizeObserver(measure);
        if (featureRef.current) observer.observe(featureRef.current);
        return () => observer.disconnect();
    }, [rest.length, onOpen]);
    return (
        <section className="nwa-section">
            <h2 className="nwa-section__title">
                {onOpen ? <button type="button" onClick={onOpen}>{title}<i className="bx bx-chevron-right" aria-hidden="true" /></button> : title}
            </h2>
            <div className="nwa-section__body">
                <Open story={feature} onRead={onRead} className="nwa-feature" ref={featureRef}>
                    <Picture story={feature} className="nwa-feature__picture" />
                    <span className="nwa-feature__text">
                        <Kicker story={feature} />
                        <strong className="nwa-feature__title">{feature.title}</strong>
                        {feature.summary && <span className="nwa-feature__summary">{feature.summary}</span>}
                        <When story={feature} />
                    </span>
                </Open>
                <ul className="nwa-lines" ref={linesRef}>
                    {/* Every headline is measured; only those that fit are shown. */}
                    {rest.map((story, index) => (
                        <li key={story.id} className={index < fit ? undefined : 'is-hidden'} aria-hidden={index >= fit || undefined}><Open story={story} onRead={onRead} className="nwa-line">
                            <strong>{story.title}</strong>
                            <span className="nwa-line__meta">{story.sourceName}, <When story={story} /></span>
                        </Open></li>
                    ))}
                    {onOpen && <li data-more="1"><button type="button" className="nwa-line nwa-line--more" onClick={onOpen}>{t('More in {topic}', { topic: title })}<i className="bx bx-right-arrow-alt" aria-hidden="true" /></button></li>}
                </ul>
            </div>
        </section>
    );
}

/* ---------- The local edition ---------- */
function Local({ stories, town, region, onRead, onSettings }: { stories: Story[]; town?: string; region: string | null; onRead: (story: Story) => void; onSettings: () => void }) {
    if (!town) {
        return <div className="nwa-empty"><strong>{t('Choose your town to get local news.')}</strong><button type="button" className="nwa-button" onClick={onSettings}>{t('Choose a town')}</button></div>;
    }
    if (stories.length === 0) {
        return <div className="nwa-empty"><strong>{t('No local news for {town} right now.', { town })}</strong>{!region && <span>{t('Local news comes from SVT\'s regional desks, so it covers towns in Sweden.')}</span>}</div>;
    }
    const [lead, ...rest] = stories;
    return (
        <div className="nwa-front">
            <Top lead={lead} second={rest.slice(0, 4)} onRead={onRead} />
            {rest.length > 4 && <Section title={t('More from {town}', { town })} stories={rest.slice(4, 16)} onRead={onRead} />}
        </div>
    );
}

/* ---------- Search ---------- */
function Results({ stories, search, onRead }: { stories: Story[]; search: string; onRead: (story: Story) => void }) {
    if (stories.length === 0) return <div className="nwa-empty"><strong>{t('Nothing about “{query}” right now.', { query: search })}</strong></div>;
    return (
        <ul className="nwa-results">
            {stories.map((story) => (
                <li key={story.id}><Open story={story} onRead={onRead} className="nwa-result">
                    <span className="nwa-result__text"><Kicker story={story} /><strong>{story.title}</strong>{story.summary && <span>{story.summary}</span>}<When story={story} /></span>
                    <Picture story={story} className="nwa-result__picture" />
                </Open></li>
            ))}
        </ul>
    );
}

function Skeleton() {
    return <div className="nwa-skeleton" aria-busy="true"><span className="nwa-skeleton__lead" /><span /><span /><span /></div>;
}

/* ---------- Reading ---------- */
type Part = { type: 'heading' | 'paragraph'; text: string };
function Reader({ reading, stories, onRead, onClose }: { reading: Reading; stories: Story[]; onRead: (story: Story) => void; onClose: () => void }) {
    const story = reading.kind === 'story' ? reading.story : null;
    const alert = reading.kind === 'alert' ? reading.alert : null;
    const [parts, setParts] = useState<Part[] | null | 'loading'>(story?.full ? 'loading' : null);
    const page = useRef<HTMLDivElement>(null);
    useEffect(() => {
        page.current?.parentElement?.scrollTo({ top: 0 });
        if (!story?.full) { setParts(null); return; }
        let alive = true;
        setParts('loading');
        fetch(`/news/article/${story.id}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
            .then((data: { parts: Part[] | null }) => { if (alive) setParts(data.parts && data.parts.length ? data.parts : null); })
            .catch(() => { if (alive) setParts(null); });
        return () => { alive = false; };
    }, [story?.id, story?.full]);

    const more = story ? stories.filter((other) => other.topic === story.topic && other.id !== story.id).slice(0, 5) : [];
    const latest = [...stories].sort((x, y) => y.time.localeCompare(x.time)).filter((other) => other.id !== story?.id && !more.includes(other)).slice(0, 6);
    const title = story?.title ?? alert!.title;
    const time = story?.time ?? alert!.time;
    const [copied, setCopied] = useState(false);
    const link = story?.url ?? alert?.url ?? '';
    const copy = () => { navigator.clipboard?.writeText(link).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); }).catch(() => undefined); };
    return (
        <div className="nwa-reader" role="dialog" aria-modal="true" aria-label={title}>
            <div className="nwa-reader__layout" key={story?.id ?? alert!.id}>
                {/* Left: where it is from, and what to do with it. */}
                <aside className="nwa-reader__side nwa-reader__side--left">
                    <button type="button" className="nwa-reader__back" onClick={onClose}><i className="bx bx-arrow-back" aria-hidden="true" />{t('Back to the news')}</button>
                    <div className="nwa-reader__facts">
                        <span><small>{t('Source')}</small><strong>{story?.sourceName ?? alert!.source}</strong></span>
                        <span><small>{story ? t('Section') : t('Area')}</small><strong>{story?.topicName ?? (alert!.area || t('Sweden'))}</strong></span>
                        <span><small>{t('Published')}</small><strong>{relativeTime(time)}</strong></span>
                    </div>
                    {link && <div className="nwa-reader__actions">
                        <a className="nwa-button" href={link} target="_blank" rel="noopener noreferrer"><i className="bx bx-link-external" aria-hidden="true" />{t('Open the original')}</a>
                        <button type="button" className="nwa-button" onClick={copy}><i className={`bx ${copied ? 'bx-check' : 'bx-copy'}`} aria-hidden="true" />{copied ? t('Copied') : t('Copy the link')}</button>
                    </div>}
                </aside>

                {/* The article, on its own page. */}
                <article ref={page} className="nwa-reader__page">
                    {story ? <Kicker story={story} /> : <span className={`nwa-kicker nwa-kicker--${alert!.level}`}><span>{t(ALERT_LEVEL[alert!.level])}</span><span className="nwa-kicker__source">{alert!.source}</span></span>}
                    <h1 className="nwa-reader__title">{title}</h1>
                    <p className="nwa-reader__meta">{new Date(time).toLocaleString(locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}{alert?.area ? `, ${alert.area}` : ''}</p>
                    {story?.image && <Picture story={story} className="nwa-reader__picture" />}
                    {alert ? (
                        <div className="nwa-reader__text">{(alert.body.length ? alert.body : [alert.summary]).map((line, at) => <p key={at}>{line}</p>)}</div>
                    ) : parts === 'loading' ? (
                        <div className="nwa-reader__loading" aria-busy="true">{story!.summary && <p className="nwa-reader__lede">{story!.summary}</p>}<span /><span /><span /></div>
                    ) : parts ? (
                        <div className="nwa-reader__text">{parts.map((part, at) => part.type === 'heading' ? <h2 key={at}>{part.text}</h2> : <p key={at} className={at === 0 ? 'nwa-reader__lede' : undefined}>{part.text}</p>)}</div>
                    ) : (
                        <div className="nwa-reader__text"><p className="nwa-reader__lede">{story!.summary || t('{source} gives only the headline for this story.', { source: story!.sourceName })}</p></div>
                    )}
                    {link && (
                        <a className="nwa-button nwa-button--primary nwa-reader__whole" href={link} target="_blank" rel="noopener noreferrer">
                            {story ? (parts && parts !== 'loading' ? t('Open at {source}', { source: story.sourceName }) : t('Read the whole story at {source}', { source: story.sourceName })) : t('More at {source}', { source: alert!.source })}
                            <i className="bx bx-link-external" aria-hidden="true" />
                        </a>
                    )}
                </article>

                {/* Right: more on the same subject, and the latest. */}
                <aside className="nwa-reader__side nwa-reader__side--right">
                    {more.length > 0 && <section className="nwa-reader__more">
                        <h2 className="nwa-label">{t('More in {topic}', { topic: story!.topicName })}</h2>
                        {more.map((other) => <ReaderLink key={other.id} story={other} onRead={onRead} />)}
                    </section>}
                    {latest.length > 0 && <section className="nwa-reader__more">
                        <h2 className="nwa-label">{t('Latest')}</h2>
                        {latest.map((other) => <ReaderLink key={other.id} story={other} onRead={onRead} />)}
                    </section>}
                </aside>
            </div>
        </div>
    );
}

function ReaderLink({ story, onRead }: { story: Story; onRead: (story: Story) => void }) {
    return (
        <button type="button" className="nwa-reader__other" onClick={() => onRead(story)}>
            <Picture story={story} className="nwa-reader__thumb" />
            <span><strong>{story.title}</strong><small>{story.sourceName}, {relativeTime(story.time)}</small></span>
        </button>
    );
}

/* ---------- Choosing ---------- */
const LEVELS = [{ value: 0, label: 'Skip' }, { value: 1, label: 'Show' }, { value: 2, label: 'More' }];
/** Every topic with how much of it to read: skip, show, or more of it (first on the page, more room). */
function TopicLevels({ catalogue, levels, onChange }: { catalogue: Catalogue; levels: Record<string, number>; onChange: (levels: Record<string, number>) => void }) {
    return (
        <ul className="nwa-levels">
            {catalogue.topics.map((topic) => {
                const level = levels[topic.id] ?? 1;
                return (
                    <li key={topic.id} className={`nwa-levels__row is-${level}`}>
                        <span>{topic.name}</span>
                        <span className="nwa-levels__choice" role="radiogroup" aria-label={topic.name}>
                            {LEVELS.map((option) => (
                                <button key={option.value} type="button" role="radio" aria-checked={level === option.value} className={level === option.value ? 'is-on' : undefined}
                                    onClick={() => {
                                        const next = { ...levels, [topic.id]: option.value };
                                        if (Object.values(next).some((value) => value > 0)) onChange(next);
                                    }}>{t(option.label)}</button>
                            ))}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}

function Chips({ options, chosen, onChange }: { options: { id: string; name: string }[]; chosen: string[]; onChange: (next: string[]) => void }) {
    return (
        <div className="nwa-chips">
            {options.map((option) => {
                const on = chosen.includes(option.id);
                return <button key={option.id} type="button" className={on ? 'is-on' : undefined} aria-pressed={on}
                    onClick={() => onChange(on ? chosen.filter((id) => id !== option.id) : [...chosen, option.id])}>{option.name}</button>;
            })}
        </div>
    );
}

const LANGUAGE_NAMES: Record<string, string> = { sv: 'Swedish', en: 'English', nl: 'Dutch' };
function Sources({ catalogue, chosen, onChange }: { catalogue: Catalogue; chosen: string[]; onChange: (next: string[]) => void }) {
    return <>{['sv', 'en', 'nl'].map((lang) => {
        const list = catalogue.sources.filter((source) => source.lang === lang);
        return list.length ? <div key={lang} className="nwa-sources"><span className="nwa-sources__lang">{t(LANGUAGE_NAMES[lang])}</span><Chips options={list} chosen={chosen} onChange={(next) => next.length && onChange(next)} /></div> : null;
    })}</>;
}

function TownPicker({ place, onPick, onClear }: { place: Place | null; onPick: (place: Place) => void; onClear?: () => void }) {
    return (
        <div className="nwa-town">
            {place && <div className="nwa-town__current"><span><strong>{place.name}</strong>{place.region && <small>{place.region}</small>}</span>{onClear && <button type="button" onClick={onClear} aria-label={t('Clear the place')}><i className="bx bx-x" /></button>}</div>}
            <PlaceSearch onPick={onPick} dark />
        </div>
    );
}

function Settings({ preferences, catalogue, region, onSave, onClose }: { preferences: Preferences; catalogue: Catalogue; region: string | null; onSave: (patch: Partial<Preferences>) => Promise<void>; onClose: () => void }) {
    return (
        <div className="nwa-drawer" role="dialog" aria-modal="true" aria-label={t('News settings')}>
            <button type="button" className="nwa-drawer__shade" onClick={onClose} aria-label={t('Close')} />
            <div className="nwa-drawer__panel">
                <header className="nwa-drawer__head"><h2>{t('Your paper')}</h2><button type="button" onClick={onClose} aria-label={t('Close')}><i className="bx bx-x" /></button></header>
                <section className="nwa-drawer__part">
                    <h3>{t('Your town')}</h3>
                    <p>{region ? t('Local news from SVT\'s regional desk and stories that name your town.') : t('Local news is stories that name your town.')}</p>
                    <TownPicker place={preferences.place} onPick={(place) => onSave({ place })} onClear={() => onSave({ place: null })} />
                </section>
                <section className="nwa-drawer__part">
                    <h3>{t('Topics')}</h3>
                    <p>{t('What you want more of comes first and gets more room.')}</p>
                    <TopicLevels catalogue={catalogue} levels={preferences.levels} onChange={(levels) => onSave({ levels })} />
                </section>
                <section className="nwa-drawer__part">
                    <h3>{t('Sources')}</h3>
                    <Sources catalogue={catalogue} chosen={preferences.sources} onChange={(sources) => onSave({ sources })} />
                </section>
            </div>
        </div>
    );
}

/** The first time: three short questions, one at a time. */
function Setup({ preferences, catalogue, onSave }: { preferences: Preferences; catalogue: Catalogue; onSave: (patch: Partial<Preferences>) => Promise<void> }) {
    const [step, setStep] = useState(0);
    const [place, setPlace] = useState<Place | null>(preferences.place);
    const [levels, setLevels] = useState(preferences.levels);
    const [sources, setSources] = useState(preferences.sources);
    const [busy, setBusy] = useState(false);
    const finish = () => { setBusy(true); onSave({ place, levels, sources }).catch(() => setBusy(false)); };
    const steps = [
        { title: t('Where do you live?'), text: t('Your town decides the local edition. SVT\'s regional desk covers every county in Sweden.'), body: <TownPicker place={place} onPick={setPlace} onClear={() => setPlace(null)} /> },
        { title: t('What do you want to read?'), text: t('Skip what bores you. What you want more of leads the front page and gets more room.'), body: <TopicLevels catalogue={catalogue} levels={levels} onChange={setLevels} /> },
        { title: t('Who do you want to hear from?'), text: t('Swedish sources come first. Add others as you like; you can change this at any time.'), body: <Sources catalogue={catalogue} chosen={sources} onChange={setSources} /> },
    ];
    const current = steps[step];
    return (
        <div className="nwa-setup" role="dialog" aria-modal="true" aria-labelledby="nwa-setup-title">
            <div className="nwa-setup__card">
                <div className="nwa-setup__steps" aria-hidden="true">{steps.map((_, at) => <span key={at} className={at <= step ? 'is-done' : undefined} />)}</div>
                <p className="nwa-setup__count">{t('{step} of {total}', { step: step + 1, total: steps.length })}</p>
                <div key={step} className="nwa-setup__step" style={{ '--step': step } as CSSProperties}>
                    <h2 id="nwa-setup-title">{current.title}</h2>
                    <p className="nwa-setup__text">{current.text}</p>
                    {current.body}
                </div>
                <div className="nwa-setup__foot">
                    {step > 0 ? <button type="button" className="nwa-setup__back" onClick={() => setStep(step - 1)}>{t('Back')}</button> : <span />}
                    {step < steps.length - 1
                        ? <button type="button" className="nwa-button nwa-button--primary" onClick={() => setStep(step + 1)}>{t('Next')}</button>
                        : <button type="button" className="nwa-button nwa-button--primary" onClick={finish} disabled={busy}>{t('Start reading')}</button>}
                </div>
            </div>
        </div>
    );
}
