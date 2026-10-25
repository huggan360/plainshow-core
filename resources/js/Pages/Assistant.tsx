import AppShell from '@/Layouts/AppShell';
import { Avatar } from '@/Components/ui';
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
 * history to scroll. What you sent sits above the prompt, the work happens
 * above it, and the answer arrives as cards (an event, a task, the weather,
 * news, a file), now and then with a few words, a question or a page to go
 * to. A new request replaces the answer. App\Support\Assistant does the work.
 */
type CalendarEvent = { uid: string; title: string; place: string; start: string; end: string; allDay: boolean; calendar: string; color: string | null; url: string };
type Task = { uid: string; title: string; due: string | null; calendar: string; color: string | null; url: string };
type Story = { id: string; title: string; summary: string; url: string; image: string | null; time: string; sourceName: string; topicName: string };
type CloudFile = { id: number; name: string; folder: string | null; type: string; size: number; changed: string; url: string };
type Card =
    | { type: 'event'; event: CalendarEvent; state: 'added' | 'changed' | 'removed' }
    | { type: 'task'; task: Task }
    | { type: 'weather'; place: Place }
    | { type: 'news'; title: string; stories: Story[]; url: string }
    | { type: 'file'; file: CloudFile; sharedWith?: { name: string; avatar: string | null } }
    | { type: 'files'; files: CloudFile[] }
    | { type: 'link'; icon: string; title: string; text: string; url: string }
    | { type: 'error'; text: string };
type Answer = { cards: Card[]; message: string | null; question: { text: string; choices: string[] } | null; redirect: string | null; ms: number };

const IDEAS = [
    t('Add a study session on Saturday between 14 and 16'),
    t('What is the weather like in Stockholm?'),
    t('Show me the latest sports news'),
    t('Share my latest song with Andreas'),
];

export default function Assistant({ ask }: { ask: string }) {
    const { props } = usePage<SharedProps>();
    const [text, setText] = useState('');
    const [sent, setSent] = useState<{ id: number; text: string } | null>(null);
    const [answer, setAnswer] = useState<(Answer & { id: number }) | null>(null);
    const [working, setWorking] = useState(false);
    const [leaving, setLeaving] = useState<string | null>(null);
    const field = useRef<HTMLTextAreaElement>(null);
    const prompt = useRef<HTMLFormElement>(null);
    const before = useRef<DOMRect | null>(null);
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
        if (!element || !from || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const to = element.getBoundingClientRect();
        element.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    }, [started]);

    const go = (request: string) => {
        const words = request.trim();
        if (!words || working) return;
        if (!started) before.current = prompt.current?.getBoundingClientRect() ?? null;
        setSent({ id: Date.now(), text: words });
        setText('');
        setAnswer(null);
        setWorking(true);
        send<Answer>('POST', '/assistant/ask', { text: words })
            .then((result) => {
                setAnswer({ ...result, id: Date.now() });
                if (result.redirect) {
                    const target = result.redirect;
                    setLeaving(target);
                    window.setTimeout(() => (target.startsWith('/') ? router.visit(target) : window.location.assign(target)), 1600);
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
        <AppShell title={t('Assistant')} wide heading={false}>
            <div className={`assistant${started ? ' is-started' : ''}${working ? ' is-working' : ''}`}>
                <div className="assistant__veil" aria-hidden="true" />

                {!started && (
                    <div className="assistant__hello">
                        <img className="assistant__logo" src="/ui/brand/plainshow-logo.webp" alt="PlainShow" />
                        <h1 className="assistant__headline">{name ? t('What should we do, {name}?', { name }) : t('What should we do?')}</h1>
                        <p className="assistant__lead">{t('Add to your calendar, share a file, check the weather or the news, or open any app. Just say it.')}</p>
                    </div>
                )}

                {started && (
                    <section className="assistant__stage" aria-live="polite">
                        {working ? <Working key={sent?.id} /> : answer && <AnswerView key={answer.id} answer={answer} leaving={leaving} onChoose={go} />}
                    </section>
                )}

                {sent && <div key={sent.id} className="assistant__said"><span>{sent.text}</span></div>}

                <form ref={prompt} className="assistant__prompt" onSubmit={submit}>
                    <div className="assistant__prompt-ring">
                        <i className="bx bx-chevron-right-square assistant__prompt-icon" aria-hidden="true" />
                        <textarea ref={field} className="assistant__field" rows={1} value={text} autoFocus maxLength={500}
                            placeholder={started ? t('Something else?') : t('Tell PlainShow what to do…')} aria-label={t('What should we do?')}
                            onChange={(event) => setText(event.target.value)} onKeyDown={keys} />
                        <button type="submit" className="assistant__send" disabled={!text.trim() || working} aria-label={t('Send')}>
                            <i className={`bx ${working ? 'bx-loader-alt bx-spin' : 'bx-up-arrow-alt'}`} />
                        </button>
                    </div>
                </form>

                {!started && (
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

/** While the Assistant works: an orb of the theme colour and what it is doing. */
function Working() {
    const steps = [t('Reading what you asked'), t('Working it out'), t('Talking to your apps'), t('Almost there')];
    const [step, setStep] = useState(0);
    useEffect(() => {
        const timer = window.setInterval(() => setStep((current) => Math.min(current + 1, steps.length - 1)), 1700);
        return () => window.clearInterval(timer);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <div className="assistant-working">
            <div className="assistant-orb" aria-hidden="true">
                <span className="assistant-orb__glow" />
                <span className="assistant-orb__ring" />
                <span className="assistant-orb__ring assistant-orb__ring--2" />
                <span className="assistant-orb__core" />
                {Array.from({ length: 6 }, (_, index) => <i key={index} className="assistant-orb__spark" style={{ '--i': index } as CSSProperties} />)}
            </div>
            <p key={step} className="assistant-working__step">{steps[step]}</p>
        </div>
    );
}

function AnswerView({ answer, leaving, onChoose }: { answer: Answer; leaving: string | null; onChoose: (text: string) => void }) {
    return (
        <div className="assistant-answer">
            {answer.cards.map((card, index) => (
                <div key={index} className="assistant-answer__card" style={{ '--i': index } as CSSProperties}>
                    <CardView card={card} leaving={leaving} />
                </div>
            ))}
            {answer.message && <Words text={answer.message} delay={answer.cards.length} />}
            {answer.question && (
                <div className="assistant-question" style={{ '--i': answer.cards.length } as CSSProperties}>
                    <Words text={answer.question.text} delay={answer.cards.length} />
                    {answer.question.choices.length > 0 && (
                        <div className="assistant-question__choices">
                            {answer.question.choices.map((choice, index) => <button key={choice} type="button" style={{ '--i': index } as CSSProperties} onClick={() => onChoose(choice)}>{choice}</button>)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/** A short message, its words arriving one after another. */
function Words({ text, delay }: { text: string; delay: number }) {
    return (
        <p className="assistant-words" style={{ '--i': delay } as CSSProperties}>
            {text.split(/(\s+)/).map((word, index) => (/\s+/.test(word) ? word : <span key={index} style={{ '--w': index } as CSSProperties}>{word}</span>))}
        </p>
    );
}

function CardView({ card, leaving }: { card: Card; leaving: string | null }) {
    switch (card.type) {
        case 'event': return <EventCard event={card.event} state={card.state} />;
        case 'task': return <TaskCard task={card.task} />;
        case 'weather': return <WeatherCard place={card.place} />;
        case 'news': return <NewsCard title={card.title} stories={card.stories} url={card.url} />;
        case 'file': return <FileCard file={card.file} sharedWith={card.sharedWith} />;
        case 'files': return <Shell icon="bx-folder" title={t('Files')}>{card.files.map((file) => <FileRow key={file.id} file={file} />)}</Shell>;
        case 'link': return <LinkCard icon={card.icon} title={card.title} text={card.text} url={card.url} going={leaving === card.url} />;
        case 'error': return <div className="ps-frame ps-frame--compact assistant-card assistant-card--error"><div className="ps-frame__panel"><i className="bx bx-error-circle" aria-hidden="true" /><span>{card.text}</span></div></div>;
    }
}

/** The box every card sits in: the glass frame with the theme gradient ring. */
function Shell({ icon, title, badge, action, children }: { icon: string; title: string; badge?: ReactNode; action?: ReactNode; children: ReactNode }) {
    return (
        <section className="ps-frame ps-frame--gradient assistant-card">
            <div className="ps-frame__panel">
                <header className="assistant-card__head">
                    <span className="assistant-card__icon"><i className={`bx ${icon}`} aria-hidden="true" /></span>
                    <h2 className="assistant-card__title">{title}</h2>
                    {badge}
                    {action && <span className="assistant-card__action">{action}</span>}
                </header>
                {children}
            </div>
        </section>
    );
}

const dayFormat = (iso: string) => new Date(iso).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
const timeFormat = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

function EventCard({ event, state }: { event: CalendarEvent; state: 'added' | 'changed' | 'removed' }) {
    const start = new Date(event.start);
    const label = { added: t('Added'), changed: t('Changed'), removed: t('Removed') }[state];
    return (
        <Shell icon="bx-calendar-plus" title={t('Calendar')} badge={<span className={`assistant-badge is-${state}`}>{label}</span>}
            action={state !== 'removed' && <a className="ps-btn ps-btn--sm ps-btn--ghost" href={event.url}>{t('Open')}<i className="bx bx-right-top-arrow-circle" /></a>}>
            <div className={`assistant-event${state === 'removed' ? ' is-removed' : ''}`}>
                <div className="assistant-event__date" style={{ '--tone': event.color ?? 'var(--ps-accent)' } as CSSProperties}>
                    <span>{start.toLocaleDateString(locale, { month: 'short' })}</span>
                    <strong>{start.getDate()}</strong>
                </div>
                <div className="assistant-event__text">
                    <strong>{event.title}</strong>
                    <span>{dayFormat(event.start)}{event.allDay ? `, ${t('all day')}` : `, ${timeFormat(event.start)}–${timeFormat(event.end)}`}</span>
                    <span className="assistant-event__calendar"><i style={{ background: event.color ?? 'var(--ps-accent)' }} />{event.calendar}{event.place && `, ${event.place}`}</span>
                </div>
            </div>
        </Shell>
    );
}

function TaskCard({ task }: { task: Task }) {
    const due = task.due ? (task.due.length === 10 ? dayFormat(`${task.due}T12:00:00`) : `${dayFormat(task.due)}, ${timeFormat(task.due)}`) : null;
    return (
        <Shell icon="bx-task" title={t('Task')} badge={<span className="assistant-badge is-added">{t('Added')}</span>}
            action={<a className="ps-btn ps-btn--sm ps-btn--ghost" href={task.url}>{t('Open')}<i className="bx bx-right-top-arrow-circle" /></a>}>
            <div className="assistant-task">
                <span className="assistant-task__box" aria-hidden="true" />
                <div><strong>{task.title}</strong>{due && <span>{t('Due {when}', { when: due })}</span>}<span className="assistant-event__calendar"><i style={{ background: task.color ?? 'var(--ps-accent)' }} />{task.calendar}</span></div>
            </div>
        </Shell>
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

function NewsCard({ title, stories, url }: { title: string; stories: Story[]; url: string }) {
    return (
        <Shell icon="bx-news" title={title} action={<a className="ps-btn ps-btn--sm ps-btn--ghost" href={url}>{t('All news')}<i className="bx bx-right-arrow-alt" /></a>}>
            <div className="assistant-news">
                {stories.map((story, index) => (
                    <a key={story.id} className={`assistant-news__story${index === 0 ? ' is-lead' : ''}`} href={`/news?read=${story.id}&q=${encodeURIComponent(story.title)}`}>
                        {story.image && <img src={story.image} alt="" loading="lazy" />}
                        <span className="assistant-news__text">
                            <strong>{story.title}</strong>
                            <small>{story.sourceName}, {new Date(story.time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</small>
                        </span>
                    </a>
                ))}
            </div>
        </Shell>
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

function FileRow({ file }: { file: CloudFile }) {
    return (
        <a className="assistant-file" href={file.url}>
            <span className="assistant-file__icon"><i className={`bx ${fileIcon(file.type)}`} aria-hidden="true" /></span>
            <span className="assistant-file__text"><strong>{file.name}</strong><small>{[file.folder, size(file.size), new Date(file.changed).toLocaleDateString(locale)].filter(Boolean).join(', ')}</small></span>
        </a>
    );
}

function FileCard({ file, sharedWith }: { file: CloudFile; sharedWith?: { name: string; avatar: string | null } }) {
    return (
        <Shell icon={sharedWith ? 'bx-share-alt' : 'bx-file'} title={sharedWith ? t('Shared') : t('File')} badge={sharedWith && <span className="assistant-badge is-added">{t('Done')}</span>}>
            <FileRow file={file} />
            {sharedWith && (
                <div className="assistant-shared">
                    <span className="assistant-shared__line" aria-hidden="true" />
                    <Avatar src={sharedWith.avatar} initials={sharedWith.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()} size="sm" />
                    <span>{t('Shared with {name}', { name: sharedWith.name })}</span>
                </div>
            )}
        </Shell>
    );
}

function LinkCard({ icon, title, text, url, going }: { icon: string; title: string; text: string; url: string; going: boolean }) {
    return (
        <a className={`ps-frame ps-frame--gradient assistant-card assistant-link${going ? ' is-going' : ''}`} href={url}>
            <div className="ps-frame__panel">
                <span className="assistant-card__icon assistant-link__icon"><i className={`bx ${icon}`} aria-hidden="true" /></span>
                <span className="assistant-link__text"><strong>{title}</strong><small>{text}</small></span>
                <i className="bx bx-right-arrow-alt assistant-link__arrow" aria-hidden="true" />
                {going && <span className="assistant-link__progress" aria-hidden="true" />}
            </div>
        </a>
    );
}
