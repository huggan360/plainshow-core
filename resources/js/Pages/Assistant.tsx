import AppShell from '@/Layouts/AppShell';
import { Avatar } from '@/Components/ui';
import { Swarm, SwarmHandle } from '@/Components/Swarm';
import { SharedProps } from '@/types';
import { t, locale } from '@/i18n';
import { router, usePage } from '@inertiajs/react';
import { CSSProperties, FormEvent, KeyboardEvent, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { settleExpand } from '@/Widgets/expand';
import { WidgetItem, WidgetDefinition } from '@/Widgets/base';
import { WeatherWidget } from '@/Widgets/Weather';
import { send, Place } from '@/Widgets/weatherKit';

/*
 * The Assistant: say what to do and it gets done. Not a chat: there is no
 * history to scroll. What you sent sits above the prompt; above that, in the
 * middle of the screen, a swarm of glowing dots works (Components/Swarm),
 * then flies into the shape of the answer, which takes its place: widgets in
 * the dashboard's own look (an event or a whole schedule, tasks, the weather,
 * news, a file), now and then with a few words, a question or a page to go
 * to. A new request replaces the answer. App\Support\Assistant does the work.
 */
type CalendarEvent = { uid: string; title: string; place: string; start: string; end: string; allDay: boolean; calendar: string; color: string | null; url: string };
type Task = { uid: string; title: string; due: string | null; calendar: string; color: string | null; url: string };
type Story = { id: string; title: string; summary: string; url: string; image: string | null; time: string; sourceName: string; topicName: string };
type CloudFile = { id: number; name: string; folder: string | null; type: string; size: number; changed: string; url: string };
type NewCalendar = { id: number; name: string; color: string | null; events: boolean; tasks: boolean; url: string };
type DayEvent = { title: string; place: string; start: string; end: string; allDay: boolean; calendar: string; color: string | null };
type Card =
    | { type: 'day'; date: string; events: DayEvent[]; url: string }
    | { type: 'calendar'; calendar: NewCalendar; state: 'added' | 'exists' }
    | { type: 'event'; event: CalendarEvent; state: 'added' | 'changed' | 'removed' }
    | { type: 'task'; task: Task }
    | { type: 'weather'; place: Place }
    | { type: 'news'; title: string; stories: Story[]; url: string }
    | { type: 'file'; file: CloudFile; sharedWith?: { name: string; avatar: string | null } }
    | { type: 'files'; files: CloudFile[] }
    | { type: 'link'; icon: string; title: string; text: string; url: string }
    | { type: 'error'; text: string };
type Answer = { cards: Card[]; message: string | null; question: { text: string; choices: string[] } | null; redirect: string | null; ms: number };

/** Suggestions to tap under the prompt. None for now; the chips appear again when this has some. */
const IDEAS: string[] = [];

const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Names this opening of the page: what "it" means, and open questions, last only as long as it does. */
const conversation = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, '0')).join('');

export default function Assistant({ ask }: { ask: string }) {
    const { props } = usePage<SharedProps>();
    const [text, setText] = useState('');
    const [sent, setSent] = useState<{ id: number; text: string } | null>(null);
    const [answer, setAnswer] = useState<(Answer & { id: number }) | null>(null);
    const [shown, setShown] = useState(false);
    const [working, setWorking] = useState(false);
    const [leaving, setLeaving] = useState<string | null>(null);
    const field = useRef<HTMLTextAreaElement>(null);
    const prompt = useRef<HTMLFormElement>(null);
    const stage = useRef<HTMLDivElement>(null);
    const answerBox = useRef<HTMLDivElement>(null);
    const swarm = useRef<SwarmHandle>(null);
    const before = useRef<DOMRect | null>(null);
    const talk = useRef(conversation());
    const started = sent !== null;

    useEffect(() => {
        settleExpand();
        // Wake the model now, so it is ready when the request is sent.
        if (!ask) send('POST', '/assistant/warm').catch(() => undefined);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // The prompt glides from the middle of the page to its place at the bottom.
    useLayoutEffect(() => {
        const element = prompt.current;
        const from = before.current;
        before.current = null;
        if (!element || !from || calm()) return;
        const to = element.getBoundingClientRect();
        element.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    }, [started]);

    // The answer is laid out unseen; the swarm flies into its shape (outlines, letters), then it shows.
    useLayoutEffect(() => {
        if (!answer || shown) return;
        if (!answerBox.current || !swarm.current || calm()) { setShown(true); return; }
        // Whatever happens to the dots, the answer is shown.
        const late = window.setTimeout(() => setShown(true), 2500);
        try {
            swarm.current.land(answerBox.current, () => { window.clearTimeout(late); setShown(true); });
        } catch (error) {
            console.error(error);
            setShown(true);
        }
        return () => window.clearTimeout(late);
    }, [answer, shown]);

    const go = (request: string) => {
        const words = request.trim();
        if (!words || working) return;
        if (!started) before.current = prompt.current?.getBoundingClientRect() ?? null;
        setSent({ id: Date.now(), text: words });
        setText('');
        setAnswer(null);
        setShown(false);
        setLeaving(null);
        setWorking(true);
        send<Answer>('POST', '/assistant/ask', { text: words, conversation: talk.current })
            .then((result) => {
                setAnswer({ ...result, id: Date.now() });
                if (result.redirect) {
                    const target = result.redirect;
                    setLeaving(target);
                    window.setTimeout(() => (target.startsWith('/') ? router.visit(target) : window.location.assign(target)), 2400);
                }
            })
            .catch((error: Error) => setAnswer({ id: Date.now(), cards: [], message: error.message === '429' ? t('That was a lot at once. Wait a moment and try again.') : t('The Assistant did not answer. Try again in a moment.'), question: null, redirect: null, ms: 0 }))
            .finally(() => { setWorking(false); field.current?.focus(); });
    };

    // A request from the Assistant widget is done as the page opens.
    useEffect(() => {
        if (ask) {
            window.history.replaceState(window.history.state, '', '/assistant');
            go(ask);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = (event: FormEvent) => { event.preventDefault(); go(text); };
    const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); go(text); }
    };
    const name = props.auth.user?.firstName || props.auth.user?.name || '';

    return (
        <AppShell title={t('Assistant')} wide heading={false} app>
            <div className={`assistant${started ? ' is-started' : ''}${working ? ' is-working' : ''}`}>
                <div className="assistant__veil" aria-hidden="true" />

                {!started && (
                    <div className="assistant__hello">
                        <img className="assistant__logo" src="/ui/brand/plainshow-logo.webp" alt="PlainShow" />
                        <h1 className="assistant__headline">{name ? t('What should we do, {name}?', { name }) : t('What should we do?')}</h1>
                    </div>
                )}

                {started && (
                    <div ref={stage} className="assistant__stage">
                        {sent && (working || (answer && !shown)) && <Swarm key={sent.id} ref={swarm} className="assistant__swarm" />}
                        <div className="assistant__scroll" aria-live="polite">
                            {working && <Status key={sent?.id} />}
                            {answer && (
                                <div ref={answerBox} key={answer.id} className={`assistant-answer${shown ? ' is-shown' : ''}`}>
                                    <AnswerView answer={answer} leaving={leaving} onChoose={go} />
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {sent && <div key={sent.id} className="assistant__said"><span>{sent.text}</span></div>}

                <form ref={prompt} className="assistant__prompt" onSubmit={submit}>
                    <div className="assistant__prompt-ring">
                        <textarea ref={field} className="assistant__field" rows={1} value={text} autoFocus maxLength={500}
                            placeholder={started ? t('Something else?') : t('Tell PlainShow what to do…')} aria-label={t('What should we do?')}
                            onChange={(event) => setText(event.target.value)} onKeyDown={keys} />
                        <button type="submit" className="assistant__send" disabled={!text.trim() || working} aria-label={t('Send')}>
                            <i className={`bx ${working ? 'bx-loader-alt bx-spin' : 'bx-up-arrow-alt'}`} />
                        </button>
                    </div>
                </form>

                {!started && IDEAS.length > 0 && (
                    <div className="assistant__ideas">
                        {IDEAS.map((idea, index) => (
                            <button key={idea} type="button" style={{ '--i': index } as CSSProperties} onClick={() => go(idea)}>{idea}</button>
                        ))}
                    </div>
                )}
            </div>
        </AppShell>
    );
}

/** What the Assistant is doing, under the swarm. */
function Status() {
    const steps = [t('Reading what you asked'), t('Working it out'), t('Talking to your apps'), t('Checking what was done'), t('Almost there')];
    const [step, setStep] = useState(0);
    useEffect(() => {
        const timer = window.setInterval(() => setStep((current) => Math.min(current + 1, steps.length - 1)), 2600);
        return () => window.clearInterval(timer);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return <p key={step} className="assistant-status">{steps[step]}</p>;
}

/** The cards, with events and tasks gathered into one widget each: a schedule, a task list. */
function AnswerView({ answer, leaving, onChoose }: { answer: Answer; leaving: string | null; onChoose: (text: string) => void }) {
    const events = answer.cards.filter((card): card is Extract<Card, { type: 'event' }> => card.type === 'event');
    const tasks = answer.cards.filter((card): card is Extract<Card, { type: 'task' }> => card.type === 'task');
    const blocks: ReactNode[] = [];
    let eventsShown = false, tasksShown = false;
    answer.cards.forEach((card, index) => {
        if (card.type === 'event') {
            if (!eventsShown) blocks.push(<Schedule key="events" items={events} />);
            eventsShown = true;
        } else if (card.type === 'task') {
            if (!tasksShown) blocks.push(<Tasks key="tasks" items={tasks.map((item) => item.task)} />);
            tasksShown = true;
        } else {
            blocks.push(<CardView key={index} card={card} leaving={leaving} />);
        }
    });
    return (
        <>
            {blocks.map((block, index) => <div key={index} className="assistant-answer__block" style={{ '--i': index } as CSSProperties}>{block}</div>)}
            {answer.message && <Words text={answer.message} big={!blocks.length} />}
            {answer.question && (
                <div className="assistant-question">
                    <Words text={answer.question.text} big={!blocks.length} />
                    {answer.question.choices.length > 0 && (
                        <div className="assistant-question__choices">
                            {answer.question.choices.map((choice, index) => <button key={choice} type="button" style={{ '--i': index } as CSSProperties} onClick={() => onChoose(choice)}>{choice}</button>)}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

/** A short message; the swarm writes it in dots first. On its own it is set larger, in the middle. */
function Words({ text, big }: { text: string; big: boolean }) {
    return <p className={`assistant-words${big ? ' is-big' : ''}`}>{text}</p>;
}

/* ---------- Widgets: the dashboard's own frame, head and rows ---------- */
function Widget({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
    return (
        <section className="ps-frame ps-widget assistant-widget" data-border="orange">
            <div className="ps-frame__panel">
                <header className="ps-widget__head">
                    <h2 className="ps-widget__title">{title}</h2>
                    {action && <span className="ps-widget__action">{action}</span>}
                </header>
                <div className="assistant-rows">{children}</div>
            </div>
        </section>
    );
}

/** One row of a widget list, as the dashboard draws them; the first and last take the rounded corners. */
function Row({ first, last, lead, title, meta, trail, href, className = '' }: { first: boolean; last: boolean; lead?: ReactNode; title: ReactNode; meta?: ReactNode; trail?: ReactNode; href?: string; className?: string }) {
    const classes = `widget-row${first ? ' is-first' : ''}${last ? ' is-last' : ''} ${className}`;
    const content = <>
        {lead && <span className="widget-row__lead">{lead}</span>}
        <span className="widget-row__text"><span className="widget-row__title">{title}</span>{meta && <span className="widget-row__meta">{meta}</span>}</span>
        {trail && <span className="widget-row__trail">{trail}</span>}
    </>;
    return href ? <a className={classes} href={href}>{content}</a> : <div className={classes}>{content}</div>;
}

const more = (href: string, label: string) => <a className="widget-more" href={href}>{label}<i className="bx bx-chevron-right" aria-hidden="true" /></a>;
const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
const weekday = (iso: string) => new Date(iso).toLocaleDateString(locale, { weekday: 'long' });

function Day({ iso, colour }: { iso: string; colour: string | null }) {
    const date = new Date(iso);
    return <span className="widget-day" style={colour ? { '--day': colour } as CSSProperties : undefined}><strong>{date.getDate()}</strong><span>{date.toLocaleDateString(locale, { month: 'short' })}</span></span>;
}

function State({ state }: { state: 'added' | 'changed' | 'removed' }) {
    return <span className={`assistant-state is-${state}`}>{{ added: t('Added'), changed: t('Changed'), removed: t('Removed') }[state]}</span>;
}

function Schedule({ items }: { items: Extract<Card, { type: 'event' }>[] }) {
    const sorted = [...items].sort((a, b) => a.event.start.localeCompare(b.event.start));
    return (
        <Widget title={items.length > 1 ? t('Your schedule') : t('Calendar')} action={more(sorted[0].event.url, t('Calendar'))}>
            {sorted.map(({ event, state }, index) => (
                <Row key={event.uid + index} first={index === 0} last={index === sorted.length - 1} className={state === 'removed' ? 'is-removed' : ''}
                    lead={<Day iso={event.start} colour={event.color} />}
                    title={event.title}
                    meta={[weekday(event.start), event.allDay ? t('All day') : `${time(event.start)}–${time(event.end)}`, event.place].filter(Boolean).join(', ')}
                    trail={<State state={state} />} />
            ))}
        </Widget>
    );
}

function Tasks({ items }: { items: Task[] }) {
    return (
        <Widget title={items.length > 1 ? t('Tasks') : t('Task')} action={more(items[0].url, t('Tasks'))}>
            {items.map((task, index) => (
                <Row key={task.uid} first={index === 0} last={index === items.length - 1}
                    lead={<span className="assistant-check" aria-hidden="true" />}
                    title={task.title}
                    meta={task.due ? t('Due {when}', { when: task.due.length === 10 ? weekday(`${task.due}T12:00:00`) : `${weekday(task.due)} ${time(task.due)}` }) : task.calendar}
                    trail={<State state="added" />} />
            ))}
        </Widget>
    );
}

/** A day's events as a timeline: times down the side, each event's calendar colour, now marked. */
function Timeline({ date, events, url }: { date: string; events: DayEvent[]; url: string }) {
    const day = new Date(`${date}T12:00:00`);
    const today = new Date().toDateString() === day.toDateString();
    const title = today ? t('Today') : day.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
    const now = Date.now();
    const sorted = [...events].sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
    return (
        <Widget title={title} action={more(url, t('Calendar'))}>
            {!sorted.length && <Row first last lead={<span className="assistant-tile"><i className="bx bx-coffee" aria-hidden="true" /></span>} title={t('Nothing planned')} />}
            {sorted.map((event, index) => {
                const past = today && !event.allDay && new Date(event.end).getTime() < now;
                const current = today && !event.allDay && new Date(event.start).getTime() <= now && !past;
                return (
                    <Row key={event.start + event.title + index} first={index === 0} last={index === sorted.length - 1}
                        className={`assistant-slot${past ? ' is-past' : ''}${current ? ' is-now' : ''}`}
                        lead={<span className="assistant-slot__time" style={event.color ? { '--slot': event.color } as CSSProperties : undefined}>
                            {event.allDay ? <strong>{t('All day')}</strong> : <><strong>{time(event.start)}</strong><span>{time(event.end)}</span></>}
                        </span>}
                        title={event.title}
                        meta={[event.place, event.calendar].filter(Boolean).join(', ')}
                        trail={current ? <span className="assistant-state is-now">{t('Now')}</span> : undefined} />
                );
            })}
        </Widget>
    );
}

/** The weather widget itself, for the place asked about. */
function WeatherCard({ place }: { place: Place }) {
    const definition: WidgetDefinition = {
        key: 'core.weather', extension: 'core', extensionName: 'Core', id: 'weather', title: t('Weather'), icon: 'bx-cloud', sizes: ['l'], default: 'l',
        admin: false, border: 'orange', min: [4, 3], w: 6, h: 4,
    };
    return (
        <div className="assistant-weather">
            <WidgetItem.Provider value={{ key: 'core.weather', w: 6, h: 4, settings: { place } }}>
                <WeatherWidget definition={definition} />
            </WidgetItem.Provider>
        </div>
    );
}

function fileIcon(type: string): string {
    if (type.startsWith('audio/')) return 'bx-music';
    if (type.startsWith('image/')) return 'bx-image';
    if (type.startsWith('video/')) return 'bx-movie';
    if (type === 'application/pdf') return 'bxs-file-pdf';
    return 'bx-file-blank';
}
const size = (bytes: number) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} kB`);
const fileLead = (file: CloudFile) => <span className="assistant-tile"><i className={`bx ${fileIcon(file.type)}`} aria-hidden="true" /></span>;
const fileMeta = (file: CloudFile) => [file.folder, size(file.size), new Date(file.changed).toLocaleDateString(locale)].filter(Boolean).join(', ');

function CardView({ card, leaving }: { card: Card; leaving: string | null }) {
    switch (card.type) {
        case 'weather': return <WeatherCard place={card.place} />;
        case 'day': return <Timeline date={card.date} events={card.events} url={card.url} />;
        case 'calendar': {
            const { calendar } = card;
            return (
                <Widget title={calendar.tasks ? t('Task list') : t('Calendar')} action={more(calendar.url, t('Calendar'))}>
                    <Row first last href={calendar.url} title={calendar.name}
                        lead={<span className="assistant-tile assistant-swatch" style={calendar.color ? { '--swatch': calendar.color } as CSSProperties : undefined}><i className={`bx ${calendar.tasks ? 'bx-list-check' : 'bx-calendar'}`} aria-hidden="true" /></span>}
                        meta={card.state === 'exists' ? t('You already have it') : calendar.tasks ? t('New task list') : t('New calendar')}
                        trail={card.state === 'added' ? <State state="added" /> : undefined} />
                </Widget>
            );
        }
        case 'news':
            return (
                <Widget title={card.title} action={more(card.url, t('All news'))}>
                    {card.stories.map((story, index) => (
                        <Row key={story.id} first={index === 0} last={index === card.stories.length - 1} href={`/news?read=${story.id}&q=${encodeURIComponent(story.title)}`}
                            lead={story.image ? <img className="assistant-thumb" src={story.image} alt="" loading="lazy" /> : <span className="assistant-tile"><i className="bx bx-news" aria-hidden="true" /></span>}
                            title={story.title} meta={`${story.sourceName}, ${time(story.time)}`} />
                    ))}
                </Widget>
            );
        case 'file':
            return (
                <Widget title={card.sharedWith ? t('Shared') : t('File')}>
                    <Row first last={!card.sharedWith} href={card.file.url} lead={fileLead(card.file)} title={card.file.name} meta={fileMeta(card.file)} />
                    {card.sharedWith && (
                        <Row first={false} last lead={<Avatar src={card.sharedWith.avatar} initials={card.sharedWith.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()} size="sm" />}
                            title={t('Shared with {name}', { name: card.sharedWith.name })} trail={<i className="bx bx-check assistant-done" aria-hidden="true" />} />
                    )}
                </Widget>
            );
        case 'files':
            return <Widget title={t('Files')}>{card.files.map((file, index) => <Row key={file.id} first={index === 0} last={index === card.files.length - 1} href={file.url} lead={fileLead(file)} title={file.name} meta={fileMeta(file)} />)}</Widget>;
        case 'link':
            return (
                <Widget title={card.title}>
                    <Row first last href={card.url} className={`assistant-go${leaving === card.url ? ' is-going' : ''}`}
                        lead={<span className="assistant-tile"><i className={`bx ${card.icon}`} aria-hidden="true" /></span>}
                        title={card.text} trail={<i className="bx bx-right-arrow-alt" aria-hidden="true" />} />
                </Widget>
            );
        case 'error':
            return <Widget title={t('Not done')}><Row first last className="assistant-error" lead={<span className="assistant-tile"><i className="bx bx-error-circle" aria-hidden="true" /></span>} title={card.text} /></Widget>;
        default:
            return null;
    }
}
