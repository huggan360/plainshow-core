import AppShell from '@/Layouts/AppShell';
import { relativeTime } from '@/Components/ui';
import { CSSProperties, ReactNode, useEffect, useMemo, useState } from 'react';
import { t, locale } from '@/i18n';
import { expanding, settleExpand } from '@/Widgets/expand';
import { Place, PlaceSearch, send } from '@/Widgets/weatherKit';

/*
 * The News app, inside the dashboard. Laid out like a paper rather than a
 * grid of cards: a lead story with large type, the next stories beside it,
 * the latest headlines in a narrow column, then a section per topic with a
 * feature and a column of headlines. Two editions: Top and Local (SVT's
 * regional desk and stories naming your town). Search on top, settings in the
 * corner, a short setup the first time, and a reader that opens over the
 * page with the story's summary and a way to the whole story.
 * Stories come from /news/stories (App\Support\News).
 */
export type Story = { id: string; title: string; summary: string; url: string; image: string | null; time: string; source: string; sourceName: string; topic: string; topicName: string };
type Preferences = { setup: boolean; topics: string[]; sources: string[]; place: Place | null };
type Catalogue = { topics: { id: string; name: string }[]; sources: { id: string; name: string; lang: string; topics: string[] }[] };
type Props = { preferences: Preferences; region: string | null; catalogue: Catalogue };
type Tab = 'top' | 'local';

export default function News({ preferences: start, region: startRegion, catalogue }: Props) {
    const [preferences, setPreferences] = useState(start);
    const [region, setRegion] = useState(startRegion);
    const [tab, setTab] = useState<Tab>('top');
    const [query, setQuery] = useState('');
    const [search, setSearch] = useState('');
    const [stories, setStories] = useState<Story[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [reading, setReading] = useState<Story | null>(null);
    const [settings, setSettings] = useState(false);
    const [version, setVersion] = useState(0);
    const [grown] = useState(expanding);

    // Typing searches after a short pause.
    useEffect(() => {
        const timer = window.setTimeout(() => setSearch(query.trim()), 350);
        return () => window.clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        if (!preferences.setup) { settleExpand(); return; }
        let alive = true;
        setFailed(false);
        const params = new URLSearchParams({ tab, limit: search ? '40' : '90' });
        if (search) params.set('q', search);
        fetch(`/news/stories?${params}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
            .then((data: { stories: Story[] }) => { if (alive) setStories(data.stories); })
            .catch(() => { if (alive) setFailed(true); })
            .finally(() => settleExpand());
        return () => { alive = false; };
    }, [tab, search, preferences.setup, version]);

    useEffect(() => {
        const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setReading(null); setSettings(false); } };
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
    }, []);

    const save = (patch: Partial<Preferences>) => send<{ preferences: Preferences; region: string | null }>('PUT', '/news/preferences', patch)
        .then((answer) => { setPreferences(answer.preferences); setRegion(answer.region); setStories(null); setVersion((value) => value + 1); });

    const town = preferences.place?.name;
    return (
        <AppShell title={t('News')} wide heading={false} app>
            <section className={`ps-frame nwa-frame${grown ? '' : ' is-entering'}`}>
                <div className="ps-frame__panel">
                    <Backdrop />
                    <div className="nwa">
                        <header className="nwa__bar">
                            <div className="nwa__search">
                                <div className="ps-input-wrap"><i className="bx bx-search" aria-hidden="true" />
                                    <input className="ps-input" type="search" value={query} placeholder={t('Search the news')} aria-label={t('Search the news')} onChange={(event) => setQuery(event.target.value)} /></div>
                            </div>
                            <nav className="nwa-tabs" aria-label={t('Edition')}>
                                <button type="button" className={tab === 'top' ? 'is-active' : undefined} aria-pressed={tab === 'top'} onClick={() => { setTab('top'); setStories(null); }}>{t('Top news')}</button>
                                <button type="button" className={tab === 'local' ? 'is-active' : undefined} aria-pressed={tab === 'local'} onClick={() => { setTab('local'); setStories(null); }}>{town ? t('Local, {town}', { town }) : t('Local')}</button>
                            </nav>
                            <button type="button" className="nwa__settings" onClick={() => setSettings(true)} aria-label={t('News settings')} title={t('News settings')}><i className="bx bx-cog" /></button>
                        </header>

                        <Masthead tab={tab} town={town} search={search} />

                        {!preferences.setup ? null
                            : failed && !stories ? <p className="nwa-note">{t('The news could not be fetched. Try again in a moment.')}</p>
                                : !stories ? <Skeleton />
                                    : search ? <Results stories={stories} search={search} onRead={setReading} />
                                        : tab === 'local' ? <Local stories={stories} town={town} region={region} onRead={setReading} onSettings={() => setSettings(true)} />
                                            : <Front stories={stories} order={preferences.topics} onRead={setReading} />}
                    </div>

                    {reading && <Reader story={reading} stories={stories ?? []} onRead={setReading} onClose={() => setReading(null)} />}
                    {settings && <Settings preferences={preferences} catalogue={catalogue} region={region} onSave={save} onClose={() => setSettings(false)} />}
                    {!preferences.setup && <Setup preferences={preferences} catalogue={catalogue} onSave={save} />}
                </div>
            </section>
        </AppShell>
    );
}

/** An evening paper's colours behind the page, following the time of day. */
function Backdrop() {
    const hour = new Date().getHours();
    const phase = hour < 6 || hour >= 22 ? 'night' : hour < 10 ? 'morning' : hour < 17 ? 'day' : 'evening';
    return <div className={`nwa-backdrop nwa-backdrop--${phase}`} aria-hidden="true"><span /><span /><span /></div>;
}

function Masthead({ tab, town, search }: { tab: Tab; town?: string; search: string }) {
    const today = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return (
        <div className="nwa-mast">
            <span className="nwa-mast__date">{today}</span>
            <h1 className="nwa-mast__title">{search ? t('Search') : tab === 'local' ? (town ?? t('Local news')) : t('The news')}</h1>
            <span className="nwa-mast__edition">{search ? t('“{query}”', { query: search }) : tab === 'local' ? t('Local edition') : t('Front page')}</span>
        </div>
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
function Open({ story, onRead, children, className }: { story: Story; onRead: (story: Story) => void; children: ReactNode; className: string }) {
    return <a href={story.url} className={className} onClick={(event) => { if (event.metaKey || event.ctrlKey) return; event.preventDefault(); onRead(story); }}>{children}</a>;
}

/* ---------- The front page ---------- */
function Front({ stories, order, onRead }: { stories: Story[]; order: string[]; onRead: (story: Story) => void }) {
    const layout = useMemo(() => {
        const used = new Set<string>();
        const take = (list: Story[], count: number) => { const picked = list.filter((story) => !used.has(story.id)).slice(0, count); picked.forEach((story) => used.add(story.id)); return picked; };
        const pictured = stories.filter((story) => story.image);
        const lead = take(pictured.filter((story) => story.topic === 'sweden' || story.topic === 'world'), 1)[0] ?? take(pictured, 1)[0] ?? take(stories, 1)[0];
        const second = take(pictured, 4);
        const latest = [...stories].sort((a, b) => b.time.localeCompare(a.time)).filter((story) => !used.has(story.id)).slice(0, 9);
        latest.forEach((story) => used.add(story.id));
        const sections = order.map((topic) => ({ topic, list: take(stories.filter((story) => story.topic === topic), 7) })).filter((section) => section.list.length > 0);
        return { lead, second, latest, sections };
    }, [stories, order]);
    if (!layout.lead) return <p className="nwa-note">{t('No news right now.')}</p>;
    return (
        <div className="nwa-front">
            <section className="nwa-top">
                <Open story={layout.lead} onRead={onRead} className="nwa-lead">
                    <Picture story={layout.lead} className="nwa-lead__picture" />
                    <Kicker story={layout.lead} />
                    <h2 className="nwa-lead__title">{layout.lead.title}</h2>
                    {layout.lead.summary && <p className="nwa-lead__summary">{layout.lead.summary}</p>}
                    <When story={layout.lead} />
                </Open>
                <div className="nwa-second">
                    {layout.second.map((story) => (
                        <Open key={story.id} story={story} onRead={onRead} className="nwa-second__story">
                            <span className="nwa-second__text"><Kicker story={story} /><strong>{story.title}</strong><When story={story} /></span>
                            <Picture story={story} className="nwa-second__picture" />
                        </Open>
                    ))}
                </div>
                <aside className="nwa-latest" aria-label={t('Latest')}>
                    <h3 className="nwa-label">{t('Latest')}</h3>
                    <ol>
                        {layout.latest.map((story) => (
                            <li key={story.id}><Open story={story} onRead={onRead} className="nwa-latest__story">
                                <span className="nwa-latest__time">{new Date(story.time).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}</span>
                                <span><strong>{story.title}</strong><small>{story.sourceName}</small></span>
                            </Open></li>
                        ))}
                    </ol>
                </aside>
            </section>
            {layout.sections.map(({ topic, list }) => <Section key={topic} title={list[0].topicName} stories={list} onRead={onRead} />)}
        </div>
    );
}

/** A topic: one feature with its picture, and a column of headlines beside it. */
function Section({ title, stories, onRead }: { title: string; stories: Story[]; onRead: (story: Story) => void }) {
    const [feature, ...rest] = stories;
    return (
        <section className="nwa-section">
            <h2 className="nwa-section__title">{title}</h2>
            <div className="nwa-section__body">
                <Open story={feature} onRead={onRead} className="nwa-feature">
                    <Picture story={feature} className="nwa-feature__picture" />
                    <span className="nwa-feature__text">
                        <Kicker story={feature} />
                        <strong className="nwa-feature__title">{feature.title}</strong>
                        {feature.summary && <span className="nwa-feature__summary">{feature.summary}</span>}
                        <When story={feature} />
                    </span>
                </Open>
                <ul className="nwa-lines">
                    {rest.map((story) => (
                        <li key={story.id}><Open story={story} onRead={onRead} className="nwa-line">
                            <strong>{story.title}</strong>
                            <span className="nwa-line__meta">{story.sourceName}, <When story={story} /></span>
                        </Open></li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

/* ---------- The local edition ---------- */
function Local({ stories, town, region, onRead, onSettings }: { stories: Story[]; town?: string; region: string | null; onRead: (story: Story) => void; onSettings: () => void }) {
    if (!town) {
        return <div className="nwa-empty"><i className="bx bx-map-pin" aria-hidden="true" /><strong>{t('Choose your town to get local news.')}</strong><button type="button" className="nwa-button" onClick={onSettings}>{t('Choose a town')}</button></div>;
    }
    if (stories.length === 0) {
        return <div className="nwa-empty"><i className="bx bx-news" aria-hidden="true" /><strong>{t('No local news for {town} right now.', { town })}</strong>{!region && <span>{t('Local news comes from SVT\'s regional desks, so it covers towns in Sweden.')}</span>}</div>;
    }
    const [lead, ...rest] = stories;
    return (
        <div className="nwa-front">
            <section className="nwa-top nwa-top--local">
                <Open story={lead} onRead={onRead} className="nwa-lead">
                    <Picture story={lead} className="nwa-lead__picture" />
                    <Kicker story={lead} />
                    <h2 className="nwa-lead__title">{lead.title}</h2>
                    {lead.summary && <p className="nwa-lead__summary">{lead.summary}</p>}
                    <When story={lead} />
                </Open>
                <div className="nwa-second">
                    {rest.slice(0, 4).map((story) => (
                        <Open key={story.id} story={story} onRead={onRead} className="nwa-second__story">
                            <span className="nwa-second__text"><Kicker story={story} /><strong>{story.title}</strong><When story={story} /></span>
                            <Picture story={story} className="nwa-second__picture" />
                        </Open>
                    ))}
                </div>
            </section>
            {rest.length > 4 && <Section title={t('More from {town}', { town })} stories={rest.slice(4, 16)} onRead={onRead} />}
        </div>
    );
}

/* ---------- Search ---------- */
function Results({ stories, search, onRead }: { stories: Story[]; search: string; onRead: (story: Story) => void }) {
    if (stories.length === 0) return <div className="nwa-empty"><i className="bx bx-search" aria-hidden="true" /><strong>{t('Nothing about “{query}” right now.', { query: search })}</strong></div>;
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
function Reader({ story, stories, onRead, onClose }: { story: Story; stories: Story[]; onRead: (story: Story) => void; onClose: () => void }) {
    const more = stories.filter((other) => other.topic === story.topic && other.id !== story.id).slice(0, 4);
    return (
        <div className="nwa-reader" role="dialog" aria-modal="true" aria-label={story.title}>
            <div className="nwa-reader__page" key={story.id}>
                <button type="button" className="nwa-reader__back" onClick={onClose}><i className="bx bx-arrow-back" aria-hidden="true" />{t('Back to the news')}</button>
                <Kicker story={story} />
                <h1 className="nwa-reader__title">{story.title}</h1>
                <p className="nwa-reader__meta">{new Date(story.time).toLocaleString(locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
                {story.image && <Picture story={story} className="nwa-reader__picture" />}
                {story.summary ? <p className="nwa-reader__summary">{story.summary}</p> : <p className="nwa-reader__summary">{t('{source} gives only the headline for this story.', { source: story.sourceName })}</p>}
                <a className="nwa-button nwa-button--primary" href={story.url} target="_blank" rel="noopener noreferrer">{t('Read the whole story at {source}', { source: story.sourceName })}<i className="bx bx-link-external" aria-hidden="true" /></a>
                {more.length > 0 && (
                    <section className="nwa-reader__more">
                        <h2 className="nwa-label">{t('More in {topic}', { topic: story.topicName })}</h2>
                        {more.map((other) => (
                            <button key={other.id} type="button" className="nwa-reader__other" onClick={() => onRead(other)}>
                                <Picture story={other} className="nwa-reader__thumb" />
                                <span><strong>{other.title}</strong><small>{other.sourceName}, {relativeTime(other.time)}</small></span>
                            </button>
                        ))}
                    </section>
                )}
            </div>
        </div>
    );
}

/* ---------- Choosing ---------- */
function Chips({ options, chosen, onChange }: { options: { id: string; name: string }[]; chosen: string[]; onChange: (next: string[]) => void }) {
    return (
        <div className="nwa-chips">
            {options.map((option) => {
                const on = chosen.includes(option.id);
                return <button key={option.id} type="button" className={on ? 'is-on' : undefined} aria-pressed={on}
                    onClick={() => onChange(on ? chosen.filter((id) => id !== option.id) : [...chosen, option.id])}>{on && <i className="bx bx-check" aria-hidden="true" />}{option.name}</button>;
            })}
        </div>
    );
}

const LANGUAGE_NAMES: Record<string, string> = { sv: 'Swedish', en: 'English', nl: 'Dutch' };
function Sources({ catalogue, chosen, onChange }: { catalogue: Catalogue; chosen: string[]; onChange: (next: string[]) => void }) {
    return <>{['sv', 'en', 'nl'].map((lang) => {
        const list = catalogue.sources.filter((source) => source.lang === lang);
        return list.length ? <div key={lang} className="nwa-sources"><span className="nwa-sources__lang">{t(LANGUAGE_NAMES[lang])}</span><Chips options={list} chosen={chosen} onChange={onChange} /></div> : null;
    })}</>;
}

function TownPicker({ place, onPick, onClear }: { place: Place | null; onPick: (place: Place) => void; onClear?: () => void }) {
    return (
        <div className="nwa-town">
            {place && <div className="nwa-town__current"><i className="bx bxs-map" aria-hidden="true" /><span><strong>{place.name}</strong>{place.region && <small>{place.region}</small>}</span>{onClear && <button type="button" onClick={onClear} aria-label={t('Clear the place')}><i className="bx bx-x" /></button>}</div>}
            <PlaceSearch onPick={onPick} dark />
        </div>
    );
}

function Settings({ preferences, catalogue, region, onSave, onClose }: { preferences: Preferences; catalogue: Catalogue; region: string | null; onSave: (patch: Partial<Preferences>) => Promise<void>; onClose: () => void }) {
    return (
        <div className="nwa-drawer" role="dialog" aria-modal="true" aria-label={t('News settings')}>
            <button type="button" className="nwa-drawer__shade" onClick={onClose} aria-label={t('Close')} />
            <div className="nwa-drawer__panel">
                <header className="nwa-drawer__head"><h2>{t('News settings')}</h2><button type="button" onClick={onClose} aria-label={t('Close')}><i className="bx bx-x" /></button></header>
                <section className="nwa-drawer__part">
                    <h3>{t('Your town')}</h3>
                    <p>{region ? t('Local news from SVT\'s regional desk and stories that name your town.') : t('Local news is stories that name your town.')}</p>
                    <TownPicker place={preferences.place} onPick={(place) => onSave({ place })} onClear={() => onSave({ place: null })} />
                </section>
                <section className="nwa-drawer__part">
                    <h3>{t('Topics')}</h3>
                    <Chips options={catalogue.topics} chosen={preferences.topics} onChange={(topics) => topics.length && onSave({ topics })} />
                </section>
                <section className="nwa-drawer__part">
                    <h3>{t('Sources')}</h3>
                    <Sources catalogue={catalogue} chosen={preferences.sources} onChange={(sources) => sources.length && onSave({ sources })} />
                </section>
            </div>
        </div>
    );
}

/** The first time: town, topics and sources in one go. */
function Setup({ preferences, catalogue, onSave }: { preferences: Preferences; catalogue: Catalogue; onSave: (patch: Partial<Preferences>) => Promise<void> }) {
    const [place, setPlace] = useState<Place | null>(preferences.place);
    const [topics, setTopics] = useState(preferences.topics);
    const [sources, setSources] = useState(preferences.sources);
    const [showSources, setShowSources] = useState(false);
    const [busy, setBusy] = useState(false);
    const start = () => { setBusy(true); onSave({ place, topics, sources }).catch(() => setBusy(false)); };
    return (
        <div className="nwa-setup" role="dialog" aria-modal="true" aria-labelledby="nwa-setup-title">
            <div className="nwa-setup__card" style={{ '--delay': '0s' } as CSSProperties}>
                <i className="bx bx-news nwa-setup__icon" aria-hidden="true" />
                <h2 id="nwa-setup-title">{t('Your news')}</h2>
                <p>{t('Choose your town and what you want to read. You can change it later with the cog in the corner.')}</p>
                <h3>{t('Your town')}</h3>
                <TownPicker place={place} onPick={setPlace} onClear={() => setPlace(null)} />
                <h3>{t('Topics')}</h3>
                <Chips options={catalogue.topics} chosen={topics} onChange={(next) => next.length && setTopics(next)} />
                <button type="button" className="nwa-setup__toggle" onClick={() => setShowSources((open) => !open)} aria-expanded={showSources}>
                    <i className={`bx ${showSources ? 'bx-chevron-up' : 'bx-chevron-down'}`} aria-hidden="true" />{t('Sources')}
                </button>
                {showSources && <Sources catalogue={catalogue} chosen={sources} onChange={(next) => next.length && setSources(next)} />}
                <button type="button" className="nwa-button nwa-button--primary nwa-setup__start" onClick={start} disabled={busy}>{t('Start reading')}<i className="bx bx-right-arrow-alt" aria-hidden="true" /></button>
            </div>
        </div>
    );
}
