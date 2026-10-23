import { router } from '@inertiajs/react';
import { CSSProperties, FormEvent, ReactNode, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t, locale } from '@/i18n';
import { Fill } from './List';
import { useBorder, useHeight, useSetting, WidgetDefinition, WidgetItem } from './base';

/*
 * Weather, Forecast and Rain radar. Core answers /weather/forecast and
 * /weather/radar (App\Support\Weather): SMHI in the Nordic countries,
 * Open-Meteo and RainViewer elsewhere. The widgets draw a sky that follows
 * the time of day and the weather (sun, moon and stars, clouds, rain, snow,
 * fog, lightning), all in CSS. A widget without a place asks for one and
 * keeps it in its settings; the other weather widgets get it too.
 */
export type Place = { name: string; region?: string; country?: string; countryCode?: string; lat: number; lon: number };
type Condition = 'clear' | 'partly' | 'cloudy' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'heavy-rain' | 'sleet' | 'snow' | 'thunder';
type Hour = { time: string; temp: number; condition: Condition; isDay: boolean; precip: number; chance: number | null; wind: number; windDir: number };
type Day = { date: string; min: number; max: number; condition: Condition; precip: number; wind: number };
type Forecast = {
    source: string; sourceName: string; timezone: string; updated: string; sunrise: string | null; sunset: string | null;
    current: { temp: number; feels: number | null; condition: Condition; isDay: boolean; wind: number; gust: number | null; windDir: number; humidity: number | null; pressure: number | null; precip: number; cloud: number | null };
    hours: Hour[]; days: Day[];
};

const LABELS: Record<Condition, string> = {
    clear: 'Clear', partly: 'Partly cloudy', cloudy: 'Cloudy', overcast: 'Overcast', fog: 'Fog', drizzle: 'Light rain',
    rain: 'Rain', 'heavy-rain': 'Heavy rain', sleet: 'Sleet', snow: 'Snow', thunder: 'Thunder',
};
function label(condition: Condition): string {
    return t(LABELS[condition] ?? 'Cloudy');
}
function icon(condition: Condition, day: boolean): string {
    switch (condition) {
        case 'clear': return day ? 'bxs-sun' : 'bxs-moon';
        case 'partly': return day ? 'bxs-cloud' : 'bxs-cloud';
        case 'fog': return 'bx-water';
        case 'drizzle': return 'bxs-cloud-light-rain';
        case 'rain': case 'heavy-rain': case 'sleet': return 'bxs-cloud-rain';
        case 'snow': return 'bxs-cloud-snow';
        case 'thunder': return 'bxs-cloud-lightning';
        default: return 'bxs-cloud';
    }
}
const degrees = (value: number | null | undefined) => (value === null || value === undefined ? '' : `${Math.round(value)}°`);

/* ---------- Data ---------- */
function usePlace(definition: WidgetDefinition): Place | null {
    const place = useSetting<Place | undefined>(definition, 'place');
    return place && typeof place.lat === 'number' ? place : null;
}

function useJson<T>(url: string | null, refreshSeconds: number): { data: T | null; error: boolean } {
    const [state, setState] = useState<{ data: T | null; error: boolean }>({ data: null, error: false });
    useEffect(() => {
        if (!url) return;
        let alive = true;
        const load = () => fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
            .then((data: T) => { if (alive) setState({ data, error: false }); })
            .catch(() => { if (alive) setState((current) => ({ data: current.data, error: true })); });
        load();
        const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, refreshSeconds * 1000);
        return () => { alive = false; window.clearInterval(timer); };
    }, [url, refreshSeconds]);
    return state;
}

function useForecast(place: Place | null) {
    return useJson<Forecast>(place ? `/weather/forecast?lat=${place.lat}&lon=${place.lon}` : null, 600);
}

function cookie(name: string): string {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : '';
}

/** Keeps a place in the widget's settings (and in the other weather widgets that have none). */
function savePlace(key: string, place: Place): Promise<void> {
    return fetch(`/dashboard/widgets/${key}/settings`, {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': cookie('XSRF-TOKEN') },
        body: JSON.stringify({ settings: { place } }),
    }).then((response) => {
        if (!response.ok) throw new Error();
        router.reload({ only: ['layout'] });
    });
}

/* ---------- Finding a place ---------- */
export function PlaceSearch({ onPick, autoFocus, dark }: { onPick: (place: Place) => void; autoFocus?: boolean; dark?: boolean }) {
    const [query, setQuery] = useState('');
    const [places, setPlaces] = useState<Place[]>([]);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (query.trim().length < 2) { setPlaces([]); return; }
        setBusy(true);
        const timer = window.setTimeout(() => {
            fetch(`/weather/places?q=${encodeURIComponent(query.trim())}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
                .then((response) => response.json()).then((data: { places?: Place[] }) => setPlaces((data.places ?? []).slice(0, 5)))
                .catch(() => setPlaces([])).finally(() => setBusy(false));
        }, 280);
        return () => window.clearTimeout(timer);
    }, [query]);
    const submit = (event: FormEvent) => { event.preventDefault(); if (places[0]) onPick(places[0]); };
    return (
        <form className={`wx-search${dark ? ' wx-search--glass' : ''}`} onSubmit={submit}>
            <div className="ps-input-wrap"><i className={`bx ${busy ? 'bx-loader-alt bx-spin' : 'bx-search'}`} aria-hidden="true" />
                <input className="ps-input" value={query} autoFocus={autoFocus} placeholder={t('Search for a town or city')} aria-label={t('Place')} onChange={(event) => setQuery(event.target.value)} /></div>
            {places.length > 0 && (
                <ul className="wx-search__results">
                    {places.map((place, index) => (
                        <li key={`${place.lat},${place.lon}`}><button type="button" className={`${index === 0 ? 'is-first' : ''}${index === places.length - 1 ? ' is-last' : ''}`} onClick={() => onPick(place)}>
                            <strong>{place.name}</strong><span>{[place.region, place.country].filter(Boolean).join(', ')}</span>
                        </button></li>
                    ))}
                </ul>
            )}
        </form>
    );
}

/** Shown in a weather widget without a place. */
function AskPlace() {
    const item = useContext(WidgetItem);
    const [error, setError] = useState(false);
    const pick = (place: Place) => {
        if (!item) return;
        setError(false);
        savePlace(item.key, place).catch(() => setError(true));
    };
    return (
        <div className="wx-ask">
            <i className="bx bx-map-pin" aria-hidden="true" />
            <strong>{t('Where is your weather?')}</strong>
            <PlaceSearch onPick={pick} dark />
            {error && <span className="wx-ask__error">{t('Could not save. Try again.')}</span>}
        </div>
    );
}

/* ---------- The sky ---------- */
type Phase = 'dawn' | 'day' | 'dusk' | 'night';
function phaseOf(forecast: Forecast | null): Phase {
    const now = Date.now();
    if (!forecast) { const hour = new Date().getHours(); return hour < 6 || hour >= 21 ? 'night' : 'day'; }
    const rise = forecast.sunrise ? new Date(forecast.sunrise).getTime() : null;
    const set = forecast.sunset ? new Date(forecast.sunset).getTime() : null;
    if (rise && Math.abs(now - rise) < 50 * 60000) return 'dawn';
    if (set && Math.abs(now - set) < 50 * 60000) return 'dusk';
    return forecast.current.isDay ? 'day' : 'night';
}
function groupOf(condition: Condition | undefined): string {
    switch (condition) {
        case 'clear': return 'clear';
        case 'partly': return 'partly';
        case 'fog': return 'fog';
        case 'drizzle': case 'rain': case 'heavy-rain': case 'sleet': return 'rain';
        case 'snow': return 'snow';
        case 'thunder': return 'thunder';
        case undefined: return 'clear';
        default: return 'cloudy';
    }
}

function Sky({ phase, condition }: { phase: Phase; condition?: Condition }) {
    const group = groupOf(condition);
    const night = phase === 'night';
    const clouds = group !== 'clear';
    return (
        <div className={`wx-sky wx-sky--${phase} wx-sky--${group}${condition === 'heavy-rain' ? ' wx-sky--heavy' : ''}`} aria-hidden="true">
            {night && (group === 'clear' || group === 'partly') && <span className="wx-sky__stars" />}
            {(group === 'clear' || group === 'partly') && <span className={night ? 'wx-sky__moon' : 'wx-sky__sun'} />}
            {clouds && <><span className="wx-sky__cloud wx-sky__cloud--a" /><span className="wx-sky__cloud wx-sky__cloud--b" />{group !== 'partly' && <span className="wx-sky__cloud wx-sky__cloud--c" />}</>}
            {(group === 'rain' || group === 'thunder') && <><span className="wx-sky__rain" /><span className="wx-sky__rain wx-sky__rain--far" /></>}
            {group === 'snow' && <><span className="wx-sky__snow" /><span className="wx-sky__snow wx-sky__snow--far" /></>}
            {group === 'thunder' && <span className="wx-sky__flash" />}
            {group === 'fog' && <><span className="wx-sky__fog" /><span className="wx-sky__fog wx-sky__fog--b" /></>}
        </div>
    );
}

function WeatherFrame({ definition, forecast, className, children }: { definition: WidgetDefinition; forecast: Forecast | null; className: string; children: ReactNode }) {
    const border = useBorder(definition.border);
    return (
        <section className={`ps-frame ps-widget widget-weather ${className}`} data-border={border}>
            <div className="ps-frame__panel">
                <Sky phase={phaseOf(forecast)} condition={forecast?.current.condition} />
                <div className="wx">{children}</div>
            </div>
        </section>
    );
}

function Wind({ speed, from }: { speed: number; from: number }) {
    return <span className="wx-wind" title={t('Wind from {degrees}°', { degrees: from })}><i className="bx bx-up-arrow-alt" style={{ transform: `rotate(${from + 180}deg)` }} aria-hidden="true" />{t('{speed} m/s', { speed: Math.round(speed) })}</span>;
}
function hourLabel(iso: string, index: number) {
    return index === 0 ? t('Now') : new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}
function dayName(date: string, index: number) {
    if (index === 0) return t('Today');
    return new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: 'short' });
}

function Hours({ hours, count }: { hours: Hour[]; count: number }) {
    return (
        <div className="wx-hours" style={{ '--count': count } as CSSProperties}>
            {hours.slice(0, count).map((hour, index) => (
                <div key={hour.time} className={`wx-hour${index === 0 ? ' is-first' : ''}${index === count - 1 ? ' is-last' : ''}`}>
                    <span className="wx-hour__time">{hourLabel(hour.time, index)}</span>
                    <i className={`bx ${icon(hour.condition, hour.isDay)}`} aria-label={label(hour.condition)} />
                    <strong>{degrees(hour.temp)}</strong>
                    <span className="wx-hour__rain">{hour.precip >= 0.1 ? t('{mm} mm', { mm: hour.precip.toFixed(1) }) : ' '}</span>
                </div>
            ))}
        </div>
    );
}

/* ---------- Weather: now, and the next hours when there is room ---------- */
export function WeatherWidget({ definition }: { definition: WidgetDefinition }) {
    const place = usePlace(definition);
    const height = useHeight(definition);
    const size = useContext(WidgetItem)?.size ?? definition.default;
    const { data, error } = useForecast(place);
    const today = data?.days[0];
    return (
        <WeatherFrame definition={definition} forecast={data} className="widget-weather--now">
            {!place ? <AskPlace /> : !data ? (error ? <Fill icon="bx-error-circle">{t('The weather service did not answer.')}</Fill> : <div className="wx-wait"><i className="bx bx-loader-alt bx-spin" aria-hidden="true" /></div>) : <>
                <div className="wx__top">
                    <span className="wx__place"><i className="bx bxs-map" aria-hidden="true" />{place.name}</span>
                    {height !== 'short' && <span className="wx__source">{data.sourceName}</span>}
                </div>
                <div className="wx__now">
                    <span className="wx__temp">{degrees(data.current.temp)}</span>
                    <span className="wx__what">
                        <i className={`bx ${icon(data.current.condition, data.current.isDay)} wx__icon`} aria-hidden="true" />
                        <span>{label(data.current.condition)}</span>
                        {today && <span className="wx__range">{t('{max} / {min}', { max: degrees(today.max), min: degrees(today.min) })}</span>}
                    </span>
                </div>
                <div className="wx__facts">
                    <Wind speed={data.current.wind} from={data.current.windDir} />
                    {data.current.feels !== null && <span>{t('Feels like {temp}', { temp: degrees(data.current.feels) })}</span>}
                    {data.current.humidity !== null && height !== 'short' && <span><i className="bx bx-droplet" aria-hidden="true" />{data.current.humidity}%</span>}
                </div>
                {height !== 'short' && <Hours hours={data.hours} count={size === 's' ? 4 : size === 'l' ? 8 : 5} />}
            </>}
        </WeatherFrame>
    );
}

/* ---------- Forecast: now, the hours and the week ---------- */
export function ForecastWidget({ definition }: { definition: WidgetDefinition }) {
    const place = usePlace(definition);
    const height = useHeight(definition);
    const size = useContext(WidgetItem)?.size ?? definition.default;
    const { data, error } = useForecast(place);
    const hours = size === 'full' ? 12 : size === 'xl' ? 10 : 7;
    return (
        <WeatherFrame definition={definition} forecast={data} className={`widget-weather--forecast widget-weather--${height}`}>
            {!place ? <AskPlace /> : !data ? (error ? <Fill icon="bx-error-circle">{t('The weather service did not answer.')}</Fill> : <div className="wx-wait"><i className="bx bx-loader-alt bx-spin" aria-hidden="true" /></div>) : <>
                <div className="wx__head">
                    <div className="wx__now">
                        <span className="wx__temp">{degrees(data.current.temp)}</span>
                        <span className="wx__what">
                            <span className="wx__place"><i className="bx bxs-map" aria-hidden="true" />{place.name}</span>
                            <span><i className={`bx ${icon(data.current.condition, data.current.isDay)}`} aria-hidden="true" /> {label(data.current.condition)}</span>
                        </span>
                    </div>
                    <div className="wx__facts wx__facts--column">
                        <Wind speed={data.current.wind} from={data.current.windDir} />
                        {data.current.feels !== null && <span>{t('Feels like {temp}', { temp: degrees(data.current.feels) })}</span>}
                        {data.current.humidity !== null && <span><i className="bx bx-droplet" aria-hidden="true" />{data.current.humidity}%</span>}
                    </div>
                </div>
                {height !== 'short' && <Hours hours={data.hours} count={hours} />}
                <Days days={data.days} rows={height === 'tall'} />
                <span className="wx__credit">{data.sourceName}</span>
            </>}
        </WeatherFrame>
    );
}

function Days({ days, rows }: { days: Day[]; rows: boolean }) {
    const low = Math.min(...days.map((day) => day.min));
    const high = Math.max(...days.map((day) => day.max));
    const span = Math.max(1, high - low);
    if (!rows) {
        return (
            <div className="wx-days" style={{ '--count': days.length } as CSSProperties}>
                {days.map((day, index) => (
                    <div key={day.date} className={`wx-day${index === 0 ? ' is-first' : ''}${index === days.length - 1 ? ' is-last' : ''}`}>
                        <span>{dayName(day.date, index)}</span>
                        <i className={`bx ${icon(day.condition, true)}`} aria-label={label(day.condition)} />
                        <strong>{degrees(day.max)}</strong>
                        <span className="wx-day__low">{degrees(day.min)}</span>
                    </div>
                ))}
            </div>
        );
    }
    return (
        <div className="wx-week">
            {days.map((day, index) => (
                <div key={day.date} className={`wx-week__row${index === 0 ? ' is-first' : ''}${index === days.length - 1 ? ' is-last' : ''}`}>
                    <span className="wx-week__name">{dayName(day.date, index)}</span>
                    <i className={`bx ${icon(day.condition, true)}`} aria-label={label(day.condition)} />
                    <span className="wx-week__rain">{day.precip >= 0.5 ? t('{mm} mm', { mm: Math.round(day.precip) }) : ''}</span>
                    <span className="wx-week__low">{degrees(day.min)}</span>
                    <span className="wx-week__bar"><span style={{ left: `${((day.min - low) / span) * 100}%`, right: `${100 - ((day.max - low) / span) * 100}%` }} /></span>
                    <span className="wx-week__high">{degrees(day.max)}</span>
                </div>
            ))}
        </div>
    );
}

/* ---------- Rain radar: the last two hours on a map around the place ---------- */
type Radar = {
    provider: 'smhi' | 'rainviewer'; providerName: string; maxZoom?: number;
    grid?: { x0: number; y0: number; cell: number; width: number; height: number };
    frames: { time: string; url: string }[];
};
const ZOOM: Record<string, number> = { near: 8, region: 7, wide: 6 };
const TILE = 256;

function useTheme(): 'dark' | 'light' {
    const read = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    const [theme, setTheme] = useState<'dark' | 'light'>(read);
    useEffect(() => {
        const observer = new MutationObserver(() => setTheme(read()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);
    return theme;
}

function worldPixel(lat: number, lon: number, zoom: number): [number, number] {
    const size = TILE * 2 ** zoom;
    const sin = Math.sin((lat * Math.PI) / 180);
    return [((lon + 180) / 360) * size, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size];
}

/** Latitude and longitude to SWEREF 99 TM, as App\Support\Weather::utm33. */
function utm33(lat: number, lon: number): [number, number] {
    const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996;
    const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const phi = (lat * Math.PI) / 180, lambda = ((lon - 15) * Math.PI) / 180;
    const n = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    const tt = Math.tan(phi) ** 2, c = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * lambda;
    const m = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi)
        + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) - ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));
    const east = 500000 + k0 * n * (A + ((1 - tt + c) * A ** 3) / 6 + ((5 - 18 * tt + tt ** 2 + 72 * c - 58 * ep2) * A ** 5) / 120);
    const north = k0 * (m + n * Math.tan(phi) * (A ** 2 / 2 + ((5 - tt + 9 * c + 4 * c ** 2) * A ** 4) / 24 + ((61 - 58 * tt + tt ** 2 + 600 * c - 330 * ep2) * A ** 6) / 720));
    return [east, north];
}

export function RadarWidget({ definition }: { definition: WidgetDefinition }) {
    const place = usePlace(definition);
    const area = useSetting<string>(definition, 'area') ?? 'region';
    const border = useBorder(definition.border);
    const { data, error } = useJson<Radar>(place ? `/weather/radar?lat=${place.lat}&lon=${place.lon}` : null, 300);
    return (
        <section className="ps-frame ps-widget widget-radar" data-border={border}>
            <div className="ps-frame__panel">
                {!place ? <><Sky phase="day" condition="rain" /><div className="wx"><AskPlace /></div></>
                    : data && data.frames.length > 0 ? <RadarMap place={place} radar={data} zoom={Math.min(ZOOM[area] ?? 7, data.maxZoom ?? 9)} />
                        : <div className="widget-radar__wait">{error || data ? <Fill icon="bx-radar">{t('No radar right now.')}</Fill> : <i className="bx bx-loader-alt bx-spin" aria-hidden="true" />}</div>}
            </div>
        </section>
    );
}

function RadarMap({ place, radar, zoom }: { place: Place; radar: Radar; zoom: number }) {
    const box = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [frame, setFrame] = useState(radar.frames.length - 1);
    const [layers, setLayers] = useState<ImageData[]>([]);
    const theme = useTheme();

    useLayoutEffect(() => {
        const element = box.current;
        if (!element) return;
        const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const [cx, cy] = worldPixel(place.lat, place.lon, zoom);
    const left = cx - size.width / 2;
    const top = cy - size.height / 2;

    // The map: CARTO's tiles without names, the rain, then the names on top.
    const tiles = useMemo(() => {
        if (!size.width) return [];
        const count = 2 ** zoom;
        const list: { key: string; x: number; y: number; tx: number; ty: number }[] = [];
        for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + size.height) / TILE); ty++) {
            if (ty < 0 || ty >= count) continue;
            for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + size.width) / TILE); tx++) {
                list.push({ key: `${tx}:${ty}`, x: tx * TILE - left, y: ty * TILE - top, tx: ((tx % count) + count) % count, ty });
            }
        }
        return list;
    }, [left, top, size.width, size.height, zoom]);
    const retina = window.devicePixelRatio > 1 ? '@2x' : '';
    const carto = (style: string, tile: { tx: number; ty: number }) => `https://${'abcd'[(tile.tx + tile.ty) % 4]}.basemaps.cartocdn.com/${theme === 'dark' ? 'dark' : 'light'}_${style}/${zoom}/${tile.tx}/${tile.ty}${retina}.png`;

    // SMHI: each frame redrawn onto the map's own grid, at half resolution and smoothed.
    const scale = 0.5;
    const outWidth = Math.ceil(size.width * scale);
    const outHeight = Math.ceil(size.height * scale);
    useEffect(() => {
        if (radar.provider !== 'smhi' || !radar.grid || !outWidth || !outHeight) return;
        let alive = true;
        const grid = radar.grid;
        const world = TILE * 2 ** zoom;
        const index = new Int32Array(outWidth * outHeight);
        for (let py = 0; py < outHeight; py++) {
            const y = top + py / scale;
            const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / world))) * 180) / Math.PI;
            for (let px = 0; px < outWidth; px++) {
                const lon = ((left + px / scale) / world) * 360 - 180;
                const [east, north] = utm33(lat, lon);
                const col = Math.floor((east - grid.x0) / grid.cell);
                const row = Math.floor((grid.y0 - north) / grid.cell);
                index[py * outWidth + px] = col >= 0 && col < grid.width && row >= 0 && row < grid.height ? row * grid.width + col : -1;
            }
        }
        const source = document.createElement('canvas');
        source.width = grid.width; source.height = grid.height;
        const read = source.getContext('2d', { willReadFrequently: true })!;
        Promise.all(radar.frames.map((item) => new Promise<ImageData | null>((resolve) => {
            const image = new Image();
            image.onload = () => {
                read.clearRect(0, 0, grid.width, grid.height);
                read.drawImage(image, 0, 0);
                const pixels = read.getImageData(0, 0, grid.width, grid.height).data;
                const out = new ImageData(outWidth, outHeight);
                for (let i = 0; i < index.length; i++) {
                    const from = index[i];
                    if (from < 0) continue;
                    const p = from * 4;
                    const alpha = pixels[p + 3];
                    // Transparent outside the radar, faint where there is no rain, black on borders: leave out.
                    if (alpha < 128 || (pixels[p] + pixels[p + 1] + pixels[p + 2] === 0)) continue;
                    out.data[i * 4] = pixels[p]; out.data[i * 4 + 1] = pixels[p + 1]; out.data[i * 4 + 2] = pixels[p + 2]; out.data[i * 4 + 3] = 200;
                }
                resolve(out);
            };
            image.onerror = () => resolve(null);
            image.src = item.url;
        }))).then((result) => { if (alive) setLayers(result.map((layer) => layer ?? new ImageData(outWidth, outHeight))); });
        return () => { alive = false; };
    }, [radar, zoom, left, top, outWidth, outHeight]);

    // Play the two hours on a loop, resting a moment on the newest.
    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setFrame(radar.frames.length - 1); return; }
        let rest = 0;
        const timer = window.setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            setFrame((current) => {
                if (current === radar.frames.length - 1 && rest < 3) { rest++; return current; }
                rest = 0;
                return (current + 1) % radar.frames.length;
            });
        }, 650);
        return () => window.clearInterval(timer);
    }, [radar.frames.length]);

    useEffect(() => {
        const element = canvas.current;
        const layer = layers[frame];
        if (!element || !layer) return;
        element.width = layer.width; element.height = layer.height;
        element.getContext('2d')!.putImageData(layer, 0, 0);
    }, [layers, frame]);

    const current = radar.frames[frame];
    return (
        <div ref={box} className="radar">
            {tiles.map((tile) => <img key={`b${tile.key}`} className="radar__tile" src={carto('nolabels', tile)} alt="" style={{ left: tile.x, top: tile.y }} />)}
            {radar.provider === 'smhi'
                ? <canvas ref={canvas} className="radar__rain" />
                : radar.frames.map((item, index) => (
                    <div key={item.time} className="radar__layer" style={{ opacity: index === frame ? 0.8 : 0 }}>
                        {tiles.map((tile) => <img key={tile.key} className="radar__tile" src={item.url.replace('{z}', String(zoom)).replace('{x}', String(tile.tx)).replace('{y}', String(tile.ty))} alt="" style={{ left: tile.x, top: tile.y }} />)}
                    </div>
                ))}
            {tiles.map((tile) => <img key={`l${tile.key}`} className="radar__tile radar__tile--labels" src={carto('only_labels', tile)} alt="" style={{ left: tile.x, top: tile.y }} />)}
            <span className="radar__you" aria-hidden="true" />
            <div className="radar__bar">
                <span className="radar__place"><i className="bx bxs-map" aria-hidden="true" />{place.name}</span>
                <span className="radar__time">{current ? new Date(current.time).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
            </div>
            <div className="radar__progress" aria-hidden="true">{radar.frames.map((item, index) => <span key={item.time} className={index <= frame ? 'is-done' : undefined} />)}</div>
            <span className="radar__credit">{radar.providerName}, © OpenStreetMap, © CARTO</span>
        </div>
    );
}
