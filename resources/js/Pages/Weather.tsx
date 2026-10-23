import AppShell from '@/Layouts/AppShell';
import { CSSProperties, forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t, locale } from '@/i18n';
import { expanding, settleExpand } from '@/Widgets/expand';
import { RadarMap } from '@/Widgets/Radar';
import {
    clock, Day, dayName, degrees, esri, Forecast, Hour, hourLabel, icon, label, Phase, phaseOf, Place, PlaceSearch, placeUrl,
    samePlace, send, Sky, tilesFor, useForecast, useJson, useTheme, Wind, worldPixel, Condition,
} from '@/Widgets/weatherKit';

type Warning = { id: string; level: 'yellow' | 'orange' | 'red'; event: string; title: string; text: string[]; areas: string[]; here: boolean; km: number; start: string | null; end: string | null };

/*
 * The Weather app, inside the dashboard: one large frame with the sky of the
 * place behind everything, a quiet map of the place in the hero, the hours
 * as a timeline that steps one hour at a time, and the full report by hour
 * or by day. The search sits on top, with the saved places as dots beneath
 * it. A heart saves a place; the house makes it home, which every weather
 * widget shows unless it has a place of its own. The radar opens over the
 * whole frame from the place.
 */
type Props = { home: Place | null; saved: Place[]; initial: Place | null };
type Places = { home: Place | null; saved: Place[] };
type Layer = { id: number; phase: Phase; condition: Condition; precip: number; leaving?: boolean; instant?: boolean };

export default function Weather({ home: startHome, saved: startSaved, initial }: Props) {
    const [places, setPlaces] = useState<Places>({ home: startHome, saved: startSaved });
    const [place, setPlace] = useState<Place | null>(initial);
    const [view, setView] = useState<'weather' | 'radar'>(() => (new URLSearchParams(window.location.search).get('view') === 'radar' ? 'radar' : 'weather'));
    const [mode, setMode] = useState<'hours' | 'days'>('hours');
    const [busy, setBusy] = useState(false);
    const { data, error } = useForecast(place);
    const warnings = useJson<{ warnings: Warning[] }>(place && (!place.countryCode || place.countryCode === 'SE') ? `/weather/warnings?lat=${place.lat}&lon=${place.lon}` : null, 300).data?.warnings ?? [];
    const warningsRef = useRef<HTMLElement>(null);
    const hereWarning = warnings.find((warning) => warning.here);
    // Opened from a widget: no fade of our own, and the growing widget fades once the sky is drawn.
    const [grown] = useState(expanding);
    useEffect(() => {
        if (data || error || !place || view === 'radar') settleExpand();
    }, [data, error, place, view]);

    // The address follows the place and the view, so it can be shared and reloaded.
    useEffect(() => {
        if (!place) return;
        window.history.replaceState(window.history.state, '', placeUrl(place, view === 'radar' ? 'radar' : undefined));
    }, [place, view]);

    // Home first, then the saved places, each once.
    const list = useMemo(() => {
        const all = [places.home, ...places.saved].filter(Boolean) as Place[];
        return all.filter((item, index) => all.findIndex((other) => samePlace(other, item)) === index);
    }, [places]);
    const index = list.findIndex((item) => samePlace(item, place));
    const isHome = samePlace(places.home, place);
    const isSaved = places.saved.some((item) => samePlace(item, place));

    // Arrow keys step through the saved places.
    useEffect(() => {
        const key = (event: KeyboardEvent) => {
            if (view !== 'weather' || list.length < 2 || (event.target as HTMLElement).closest('input, textarea, select')) return;
            if (event.key === 'ArrowRight') setPlace(list[(index + 1) % list.length]);
            if (event.key === 'ArrowLeft') setPlace(list[(index - 1 + list.length) % list.length]);
        };
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
    }, [list, index, view]);

    const change = (request: Promise<Places>) => {
        setBusy(true);
        request.then(setPlaces).catch(() => undefined).finally(() => setBusy(false));
    };
    const toggleSaved = () => place && change(isSaved ? send<Places>('DELETE', '/weather/saved', { lat: place.lat, lon: place.lon }) : send<Places>('POST', '/weather/saved', { place }));
    const toggleHome = () => place && change(isHome ? send<Places>('DELETE', '/weather/home') : send<Places>('PUT', '/weather/home', { place }));

    return (
        <AppShell title={place ? t('Weather in {place}', { place: place.name }) : t('Weather')} wide heading={false} app>
            <section className={`ps-frame wxa-frame${view === 'radar' ? ' is-radar' : ''}${grown ? '' : ' is-entering'}`}>
                <div className="ps-frame__panel">
                    <Skies forecast={data} instant={grown} />
                    {view === 'radar' && place
                        ? <RadarMap place={place} zoom={7} interactive onClose={() => setView('weather')} />
                        : <div className="wxa">
                            <header className="wxa__bar">
                                <PlaceSearch onPick={setPlace} dark autoFocus={!place} />
                                {(list.length > 1 || (list.length > 0 && index === -1)) && (
                                    <nav className="wxa-dots" aria-label={t('Your places')}>
                                        {list.map((item, at) => (
                                            <button key={`${item.lat},${item.lon}`} type="button" className={at === index ? 'is-active' : undefined} onClick={() => setPlace(item)}
                                                aria-label={item.name} aria-current={at === index || undefined} title={item.name} />
                                        ))}
                                        {index === -1 && place && <button type="button" className="is-active is-other" aria-label={place.name} aria-current title={place.name} />}
                                    </nav>
                                )}
                            </header>

                            {!place ? (
                                <div className="wxa__empty"><i className="bx bx-map-pin" aria-hidden="true" /><strong>{t('Search for a place to see its weather.')}</strong></div>
                            ) : (
                                <div key={`${place.lat},${place.lon}`} className="wxa__body">
                                    <section className="wxa-hero">
                                        <PlaceMap place={place} />
                                        <div className="wxa-hero__text">
                                            <div className="wxa-hero__name">
                                                <h1>{place.name}</h1>
                                                <button type="button" className={`wxa-icon wxa-icon--heart${isSaved ? ' is-on' : ''}`} onClick={toggleSaved} disabled={busy}
                                                    aria-pressed={isSaved} aria-label={isSaved ? t('Remove from your places') : t('Save to your places')} title={isSaved ? t('Remove from your places') : t('Save to your places')}>
                                                    <i className={`bx ${isSaved ? 'bxs-heart' : 'bx-heart'}`} />
                                                </button>
                                                <button type="button" className={`wxa-icon wxa-icon--home${isHome ? ' is-on' : ''}`} onClick={toggleHome} disabled={busy}
                                                    aria-pressed={isHome} aria-label={isHome ? t('Your home place') : t('Make this your home place')} title={isHome ? t('Your home place') : t('Make this your home place')}>
                                                    <i className={`bx ${isHome ? 'bxs-home' : 'bx-home'}`} />
                                                </button>
                                                <button type="button" className="wxa-radar-button" onClick={() => setView('radar')}><i className="bx bx-radar" aria-hidden="true" />{t('Radar')}</button>
                                            </div>
                                            {(place.region || place.country) && <p className="wxa-hero__where">{[place.region, place.country].filter(Boolean).join(', ')}</p>}
                                            {!data ? (
                                                <div className="wxa-hero__wait">{error ? t('The weather service did not answer.') : <i className="bx bx-loader-alt bx-spin" aria-hidden="true" />}</div>
                                            ) : <>
                                                <div className="wxa-hero__temp">{degrees(data.current.temp)}</div>
                                                <p className="wxa-hero__condition"><i className={`bx ${icon(data.current.condition, data.current.isDay)}`} aria-hidden="true" />{label(data.current.condition)}</p>
                                                {hereWarning && (
                                                    <button type="button" className={`wxa-warning-pill is-${hereWarning.level}`} onClick={() => warningsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                                                        <i className="bx bxs-error" aria-hidden="true" />{t(WARNING_LEVEL[hereWarning.level])}: {hereWarning.event}
                                                    </button>
                                                )}
                                                {data.days[0] && <p className="wxa-hero__range">{t('High {max}, low {min}', { max: degrees(data.days[0].max), min: degrees(data.days[0].min) })}{data.current.feels !== null ? `, ${t('feels like {temp}', { temp: degrees(data.current.feels) })}` : ''}</p>}
                                            </>}
                                        </div>
                                    </section>

                                    {data && <>
                                        <Timeline hours={data.hours} />
                                        {warnings.length > 0 && <Warnings ref={warningsRef} warnings={warnings} />}
                                        <Facts forecast={data} />
                                        <section className="wxa-report">
                                            <div className="wxa-report__head">
                                                <h2>{mode === 'hours' ? t('Hour by hour') : t('Day by day')}</h2>
                                                <div className="wxa-modes" role="tablist">
                                                    <button type="button" role="tab" aria-selected={mode === 'hours'} className={mode === 'hours' ? 'is-active' : undefined} onClick={() => setMode('hours')}>{t('Hours')}</button>
                                                    <button type="button" role="tab" aria-selected={mode === 'days'} className={mode === 'days' ? 'is-active' : undefined} onClick={() => setMode('days')}>{t('Days')}</button>
                                                </div>
                                            </div>
                                            {mode === 'hours' ? <HourRows hours={data.hours} /> : <DayRows days={data.days} />}
                                            <p className="wxa-report__source">{t('From {source}, updated {time}.', { source: data.sourceName, time: clock(data.updated) })}</p>
                                        </section>
                                    </>}
                                </div>
                            )}
                        </div>}
                </div>
            </section>
        </AppShell>
    );
}

/** The sky crossfades when the place or its weather changes. */
function Skies({ forecast, instant }: { forecast: Forecast | null; instant?: boolean }) {
    const [layers, setLayers] = useState<Layer[]>([]);
    useEffect(() => {
        if (!forecast) return;
        const next: Layer = { id: Date.now(), phase: phaseOf(forecast), condition: forecast.current.condition, precip: forecast.current.precip };
        // The first sky after growing from a widget is already showing in the widget's copy: no fade in.
        if (instant) next.instant = true;
        setLayers((current) => {
            const last = current[current.length - 1];
            if (last && !last.leaving && last.phase === next.phase && last.condition === next.condition && Math.round(last.precip) === Math.round(next.precip)) return current;
            return [...current.filter((layer) => !layer.leaving).map((layer) => ({ ...layer, leaving: true })), next];
        });
        const timer = window.setTimeout(() => setLayers((current) => current.filter((layer) => !layer.leaving)), 1000);
        return () => window.clearTimeout(timer);
    }, [forecast]); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <div className="wxa__skies">
            {layers.length === 0 && <div className="wxa__sky"><Sky phase={phaseOf(null)} /></div>}
            {layers.map((layer, at) => <div key={layer.id} className={`wxa__sky${layer.leaving ? ' is-leaving' : ''}${layer.instant && at === 0 ? ' is-instant' : ''}`}><Sky phase={layer.phase} condition={layer.condition} precip={layer.precip} /></div>)}
        </div>
    );
}

/** A quiet map of the place, fading into the sky on the right of the hero. */
function PlaceMap({ place }: { place: Place }) {
    const box = useRef<HTMLDivElement>(null);
    const theme = useTheme();
    const [size, setSize] = useState({ width: 0, height: 0 });
    useLayoutEffect(() => {
        const element = box.current;
        if (!element) return;
        const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const zoom = 10;
    const [cx, cy] = worldPixel(place.lat, place.lon, zoom);
    // The place sits a little left of the map's middle, towards the text.
    const left = cx - size.width * 0.55, top = cy - size.height * 0.5;
    const tiles = tilesFor(left, top, size.width, size.height, zoom);
    return (
        <div ref={box} className="wxa-map" aria-hidden="true">
            {tiles.map((tile) => <img key={`b${tile.key}`} src={esri('Base', theme, zoom, tile)} alt="" style={{ left: tile.x, top: tile.y }} />)}
            {tiles.map((tile) => <img key={`l${tile.key}`} src={esri('Reference', theme, zoom, tile)} alt="" style={{ left: tile.x, top: tile.y }} />)}
            <span className="wxa-map__pin" style={{ left: size.width * 0.55, top: size.height * 0.5 }} />
        </div>
    );
}

/*
 * The coming hours as a strip that moves one hour at a time, with the wheel,
 * the arrows or by swiping. The hours at the edges of the view take the
 * rounded corners as it moves.
 */
function Timeline({ hours }: { hours: Hour[] }) {
    const strip = useRef<HTMLDivElement>(null);
    const lock = useRef(false);
    const [width, setWidth] = useState(0);
    const [first, setFirst] = useState(0);
    const gap = 3;
    const least = width < 520 ? 70 : 88;
    const count = Math.max(3, Math.floor((width + gap) / (least + gap)));
    const item = width ? (width - gap * (count - 1)) / count : least;
    const step = item + gap;
    const maxFirst = Math.max(0, hours.length - count);

    useLayoutEffect(() => {
        const element = strip.current;
        if (!element) return;
        const measure = () => setWidth(element.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const go = (next: number) => {
        const element = strip.current;
        if (!element) return;
        element.scrollTo({ left: Math.max(0, Math.min(maxFirst, next)) * step, behavior: 'smooth' });
    };
    useEffect(() => {
        const element = strip.current;
        if (!element) return;
        const wheel = (event: WheelEvent) => {
            const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            if (Math.abs(delta) < 2) return;
            const current = Math.round(element.scrollLeft / step);
            const next = Math.max(0, Math.min(maxFirst, current + (delta > 0 ? 1 : -1)));
            if (next === current) return;
            event.preventDefault();
            if (lock.current) return;
            lock.current = true;
            element.scrollTo({ left: next * step, behavior: 'smooth' });
            window.setTimeout(() => { lock.current = false; }, 200);
        };
        element.addEventListener('wheel', wheel, { passive: false });
        return () => element.removeEventListener('wheel', wheel);
    }, [step, maxFirst]);

    const last = Math.min(hours.length - 1, first + count - 1);
    return (
        <section className="wxa-line" aria-label={t('The coming hours')}>
            <button type="button" className="wxa-line__arrow" onClick={() => go(first - 1)} disabled={first === 0} aria-label={t('Earlier')}><i className="bx bx-chevron-left" /></button>
            <div ref={strip} className="wxa-line__strip" style={{ '--item': `${item}px` } as CSSProperties}
                onScroll={(event) => setFirst(Math.min(maxFirst, Math.round(event.currentTarget.scrollLeft / step)))}>
                {hours.map((hour, at) => (
                    <div key={hour.time} className={`wxa-line__hour${at === first ? ' is-first' : ''}${at === last ? ' is-last' : ''}`}>
                        <span className="wxa-line__time">{hourLabel(hour.time, at)}</span>
                        <i className={`bx ${icon(hour.condition, hour.isDay)}`} aria-label={label(hour.condition)} />
                        <strong>{degrees(hour.temp)}</strong>
                        <span className="wxa-line__rain">{hour.precip >= 0.1 ? t('{mm} mm', { mm: hour.precip.toFixed(1) }) : hour.chance ? `${hour.chance}%` : ' '}</span>
                        <i className="bx bx-up-arrow-alt wxa-line__wind" style={{ transform: `rotate(${hour.windDir + 180}deg)` }} aria-hidden="true" />
                    </div>
                ))}
            </div>
            <button type="button" className="wxa-line__arrow" onClick={() => go(first + 1)} disabled={first >= maxFirst} aria-label={t('Later')}><i className="bx bx-chevron-right" /></button>
        </section>
    );
}

const WARNING_LEVEL: Record<Warning['level'], string> = { yellow: 'Yellow warning', orange: 'Orange warning', red: 'Red warning' };

/** SMHI's warnings here and nearby: the ones over this place first, then the nearest. A row opens to its text. */
const Warnings = forwardRef<HTMLElement, { warnings: Warning[] }>(function Warnings({ warnings }, ref) {
    const [open, setOpen] = useState<string | null>(null);
    const span = (warning: Warning) => [warning.start, warning.end].filter(Boolean).map((iso) => new Date(iso!).toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })).join(' – ');
    return (
        <section ref={ref} className="wxa-warnings" aria-label={t('Warnings')}>
            <h2 className="wxa-warnings__title">{t('Warnings')}<small>{t('From SMHI, here and within 80 km')}</small></h2>
            <div className="wxa-rows">
                {warnings.map((warning, at) => (
                    <div key={warning.id} className={`wxa-warning is-${warning.level}${at === 0 ? ' is-first' : ''}${at === warnings.length - 1 ? ' is-last' : ''}${open === warning.id ? ' is-open' : ''}`}>
                        <button type="button" className="wxa-warning__head" onClick={() => setOpen(open === warning.id ? null : warning.id)} aria-expanded={open === warning.id}>
                            <span className="wxa-warning__dot" aria-hidden="true" />
                            <span className="wxa-warning__text">
                                <strong>{warning.title || warning.event}</strong>
                                <small>{t(WARNING_LEVEL[warning.level])}, {warning.areas.join(', ')}</small>
                            </span>
                            <span className="wxa-warning__where">{warning.here ? t('Here') : t('{km} km away', { km: warning.km })}</span>
                            <i className={`bx ${open === warning.id ? 'bx-chevron-up' : 'bx-chevron-down'}`} aria-hidden="true" />
                        </button>
                        {open === warning.id && (
                            <div className="wxa-warning__body">
                                {span(warning) && <p className="wxa-warning__time">{span(warning)}</p>}
                                {warning.text.map((line, index) => <p key={index}>{line}</p>)}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
});

/** The weather now, in figures. */
function Facts({ forecast }: { forecast: Forecast }) {
    const now = forecast.current;
    const facts = [
        { icon: 'bx-wind', label: t('Wind'), value: <Wind speed={now.wind} from={now.windDir} />, note: now.gust !== null ? t('Gusts {speed} m/s', { speed: Math.round(now.gust) }) : undefined },
        { icon: 'bx-droplet', label: t('Humidity'), value: now.humidity !== null ? `${now.humidity}%` : '', note: undefined },
        { icon: 'bx-cloud-rain', label: t('Rain'), value: t('{mm} mm', { mm: now.precip.toFixed(1) }), note: t('This hour') },
        { icon: 'bx-tachometer', label: t('Pressure'), value: now.pressure !== null ? t('{hpa} hPa', { hpa: Math.round(now.pressure) }) : '', note: undefined },
        { icon: 'bx-sun', label: t('Sunrise'), value: forecast.sunrise ? clock(forecast.sunrise) : '', note: undefined },
        { icon: 'bx-moon', label: t('Sunset'), value: forecast.sunset ? clock(forecast.sunset) : '', note: undefined },
    ].filter((fact) => fact.value !== '');
    return (
        <section className="wxa-facts">
            {facts.map((fact) => (
                <div key={fact.label} className="wxa-fact">
                    <span className="wxa-fact__label"><i className={`bx ${fact.icon}`} aria-hidden="true" />{fact.label}</span>
                    <strong>{fact.value}</strong>
                    {fact.note && <span className="wxa-fact__note">{fact.note}</span>}
                </div>
            ))}
        </section>
    );
}

function HourRows({ hours }: { hours: Hour[] }) {
    let lastDay = '';
    return (
        <div className="wxa-rows">
            {hours.map((hour, at) => {
                const day = new Date(hour.time).toLocaleDateString(locale, { weekday: 'long' });
                const newDay = at > 0 && day !== lastDay;
                lastDay = day;
                return (
                    <div key={hour.time} className={`wxa-row wxa-row--hour${at === 0 ? ' is-first' : ''}${at === hours.length - 1 ? ' is-last' : ''}${newDay ? ' is-new-day' : ''}`}>
                        <span className="wxa-row__when">{at === 0 ? t('Now') : clock(hour.time)}{newDay && <small>{day}</small>}</span>
                        <span className="wxa-row__what" title={label(hour.condition)}><i className={`bx ${icon(hour.condition, hour.isDay)}`} aria-hidden="true" /><span>{label(hour.condition)}</span></span>
                        <strong className="wxa-row__temp">{degrees(hour.temp)}</strong>
                        <span className="wxa-row__rain">{hour.precip >= 0.1 ? t('{mm} mm', { mm: hour.precip.toFixed(1) }) : ''}{hour.chance !== null && hour.chance > 0 ? ` ${hour.chance}%` : ''}</span>
                        <span className="wxa-row__wind"><Wind speed={hour.wind} from={hour.windDir} /></span>
                    </div>
                );
            })}
        </div>
    );
}

function DayRows({ days }: { days: Day[] }) {
    const low = Math.min(...days.map((day) => day.min));
    const high = Math.max(...days.map((day) => day.max));
    const span = Math.max(1, high - low);
    return (
        <div className="wxa-rows">
            {days.map((day, at) => (
                <div key={day.date} className={`wxa-row wxa-row--day${at === 0 ? ' is-first' : ''}${at === days.length - 1 ? ' is-last' : ''}`}>
                    <span className="wxa-row__when">{dayName(day.date, at, true)}</span>
                    <span className="wxa-row__what" title={label(day.condition)}><i className={`bx ${icon(day.condition, true)}`} aria-hidden="true" /><span>{label(day.condition)}</span></span>
                    <span className="wxa-row__rain">{day.precip >= 0.5 ? t('{mm} mm', { mm: Math.round(day.precip) }) : ''}</span>
                    <span className="wxa-row__range">
                        <span className="wxa-row__low">{degrees(day.min)}</span>
                        <span className="wx-week__bar"><span style={{ left: `${((day.min - low) / span) * 100}%`, right: `${100 - ((day.max - low) / span) * 100}%` }} /></span>
                        <strong>{degrees(day.max)}</strong>
                    </span>
                    <span className="wxa-row__wind">{t('{speed} m/s', { speed: Math.round(day.wind) })}</span>
                </div>
            ))}
        </div>
    );
}
