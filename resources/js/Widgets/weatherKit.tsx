import { CSSProperties, FormEvent, RefObject, useEffect, useLayoutEffect, useState } from 'react';
import { t, locale } from '@/i18n';

/*
 * What the weather widgets and the Weather app share: the forecast's shape,
 * names and icons, the place search, the sky, and the map arithmetic.
 * Core answers /weather/forecast and /weather/radar (App\Support\Weather):
 * SMHI in the Nordic countries, Open-Meteo and RainViewer elsewhere.
 */
export type Place = { name: string; region?: string; country?: string; countryCode?: string; lat: number; lon: number };
export type Condition = 'clear' | 'partly' | 'cloudy' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'heavy-rain' | 'sleet' | 'snow' | 'thunder';
export type Hour = { time: string; temp: number; condition: Condition; isDay: boolean; precip: number; chance: number | null; wind: number; windDir: number };
export type Day = { date: string; min: number; max: number; condition: Condition; precip: number; wind: number };
export type Forecast = {
    source: string; sourceName: string; timezone: string; updated: string; sunrise: string | null; sunset: string | null;
    current: { temp: number; feels: number | null; condition: Condition; isDay: boolean; wind: number; gust: number | null; windDir: number; humidity: number | null; pressure: number | null; precip: number; cloud: number | null };
    hours: Hour[]; days: Day[];
};

const LABELS: Record<Condition, string> = {
    clear: 'Clear', partly: 'Partly cloudy', cloudy: 'Cloudy', overcast: 'Overcast', fog: 'Fog', drizzle: 'Light rain',
    rain: 'Rain', 'heavy-rain': 'Heavy rain', sleet: 'Sleet', snow: 'Snow', thunder: 'Thunder',
};
export function label(condition: Condition): string {
    return t(LABELS[condition] ?? 'Cloudy');
}
/** One icon set for every condition: the outline weather icons, which all exist in the font. */
export function icon(condition: Condition, day: boolean): string {
    switch (condition) {
        case 'clear': return day ? 'bx-sun' : 'bx-moon';
        case 'fog': return 'bx-water';
        case 'drizzle': return 'bx-cloud-drizzle';
        case 'rain': return 'bx-cloud-light-rain';
        case 'heavy-rain': case 'sleet': return 'bx-cloud-rain';
        case 'snow': return 'bx-cloud-snow';
        case 'thunder': return 'bx-cloud-lightning';
        default: return 'bx-cloud';
    }
}
export const degrees = (value: number | null | undefined) => (value === null || value === undefined ? '' : `${Math.round(value)}°`);
export const samePlace = (a: Place | null | undefined, b: Place | null | undefined) => !!a && !!b && Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

/** How wide an element is, kept up to date. */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
    const [width, setWidth] = useState(0);
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const measure = () => setWidth(element.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);
    return width;
}

/* ---------- Data ---------- */
export function useJson<T>(url: string | null, refreshSeconds: number): { data: T | null; error: boolean } {
    const [state, setState] = useState<{ data: T | null; error: boolean; url: string | null }>({ data: null, error: false, url: null });
    useEffect(() => {
        if (!url) return;
        let alive = true;
        const load = () => fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
            .then((data: T) => { if (alive) setState({ data, error: false, url }); })
            .catch(() => { if (alive) setState((current) => ({ data: current.data, error: true, url })); });
        load();
        const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, refreshSeconds * 1000);
        return () => { alive = false; window.clearInterval(timer); };
    }, [url, refreshSeconds]);
    // An answer for an earlier address is not this address's answer.
    return state.url === url ? { data: state.data, error: state.error } : { data: null, error: false };
}

export function forecastUrl(place: Place | null) {
    return place ? `/weather/forecast?lat=${place.lat}&lon=${place.lon}` : null;
}
export function useForecast(place: Place | null) {
    return useJson<Forecast>(forecastUrl(place), 600);
}

function cookie(name: string): string {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : '';
}

/** A JSON request with Laravel's CSRF token; rejects on failure. */
export function send<T>(method: string, url: string, body?: unknown): Promise<T> {
    return fetch(url, {
        method, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': cookie('XSRF-TOKEN') },
        body: body === undefined ? undefined : JSON.stringify(body),
    }).then((response) => (response.ok ? response.json() as Promise<T> : Promise.reject(new Error(String(response.status)))));
}

export function placeUrl(place: Place, view?: string) {
    const query = new URLSearchParams({ name: place.name, lat: String(place.lat), lon: String(place.lon) });
    if (place.region) query.set('region', place.region);
    if (place.countryCode) query.set('countryCode', place.countryCode);
    if (view) query.set('view', view);
    return `/weather?${query.toString()}`;
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
    const pick = (place: Place) => { setQuery(''); setPlaces([]); onPick(place); };
    const submit = (event: FormEvent) => { event.preventDefault(); if (places[0]) pick(places[0]); };
    return (
        <form className={`wx-search${dark ? ' wx-search--glass' : ''}`} onSubmit={submit}>
            <div className="ps-input-wrap"><i className={`bx ${busy ? 'bx-loader-alt bx-spin' : 'bx-search'}`} aria-hidden="true" />
                <input className="ps-input" value={query} autoFocus={autoFocus} placeholder={t('Search for a town or city')} aria-label={t('Place')} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setQuery(''); setPlaces([]); } }} /></div>
            {places.length > 0 && (
                <ul className="wx-search__results">
                    {places.map((place, index) => (
                        <li key={`${place.lat},${place.lon}`}><button type="button" className={`${index === 0 ? 'is-first' : ''}${index === places.length - 1 ? ' is-last' : ''}`} onClick={() => pick(place)}>
                            <strong>{place.name}</strong><span>{[place.region, place.country].filter(Boolean).join(', ')}</span>
                        </button></li>
                    ))}
                </ul>
            )}
        </form>
    );
}

/* ---------- The sky ---------- */
export type Phase = 'dawn' | 'day' | 'dusk' | 'night';
export function phaseOf(forecast: Forecast | null): Phase {
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

/** A number from 0 to 1 that is the same for the same drop, so drops do not jump between renders. */
function seeded(index: number, salt: number) {
    const n = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
    return n - Math.floor(n);
}

/*
 * Rain and snow fall as single drops and flakes. How many follows the weather:
 * a few for light rain, a curtain for heavy rain, more as the millimetres
 * per hour go up.
 */
function fallCount(condition: Condition | undefined, precip: number): { drops: number; flakes: number } {
    const extra = Math.min(60, Math.round(precip * 12));
    switch (condition) {
        case 'drizzle': return { drops: 18 + extra, flakes: 0 };
        case 'rain': return { drops: 45 + extra, flakes: 0 };
        case 'heavy-rain': return { drops: 95 + extra, flakes: 0 };
        case 'thunder': return { drops: 80 + extra, flakes: 0 };
        case 'sleet': return { drops: 28 + extra / 2, flakes: 18 };
        case 'snow': return { drops: 0, flakes: 34 + extra };
        default: return { drops: 0, flakes: 0 };
    }
}

export function Sky({ phase, condition, precip = 0 }: { phase: Phase; condition?: Condition; precip?: number }) {
    const group = groupOf(condition);
    const night = phase === 'night';
    const clouds = group !== 'clear';
    const { drops, flakes } = fallCount(condition, precip);
    const heavy = condition === 'heavy-rain' || condition === 'thunder';
    return (
        <div className={`wx-sky wx-sky--${phase} wx-sky--${group}${heavy ? ' wx-sky--heavy' : ''}`} aria-hidden="true">
            {night && (group === 'clear' || group === 'partly') && <span className="wx-sky__stars" />}
            {(group === 'clear' || group === 'partly') && <span className={night ? 'wx-sky__moon' : 'wx-sky__sun'} />}
            {clouds && <><span className="wx-sky__cloud wx-sky__cloud--a" /><span className="wx-sky__cloud wx-sky__cloud--b" />{group !== 'partly' && <span className="wx-sky__cloud wx-sky__cloud--c" />}</>}
            {Array.from({ length: drops }, (_, index) => {
                const depth = seeded(index, 1);
                return <i key={`d${index}`} className="wx-drop" style={{
                    '--x': `${seeded(index, 2) * 115 - 5}%`,
                    '--len': `${Math.round(10 + depth * (heavy ? 16 : 12))}px`,
                    '--speed': `${(heavy ? 0.42 : 0.6) + (1 - depth) * 0.35}s`,
                    '--delay': `${-seeded(index, 3) * 2}s`,
                    '--alpha': (0.25 + depth * 0.5).toFixed(2),
                } as CSSProperties} />;
            })}
            {Array.from({ length: flakes }, (_, index) => {
                const depth = seeded(index, 4);
                return <i key={`f${index}`} className="wx-flake" style={{
                    '--x': `${seeded(index, 5) * 105 - 2}%`,
                    '--size': `${(2 + depth * 3).toFixed(1)}px`,
                    '--speed': `${6 + (1 - depth) * 6}s`,
                    '--delay': `${-seeded(index, 6) * 12}s`,
                    '--alpha': (0.45 + depth * 0.5).toFixed(2),
                } as CSSProperties} />;
            })}
            {group === 'thunder' && <span className="wx-sky__flash" />}
            {group === 'fog' && <><span className="wx-sky__fog" /><span className="wx-sky__fog wx-sky__fog--b" /></>}
        </div>
    );
}

/* ---------- Small pieces ---------- */
export function Wind({ speed, from }: { speed: number; from: number }) {
    return <span className="wx-wind" title={t('Wind from {degrees}°', { degrees: from })}><i className="bx bx-up-arrow-alt" style={{ transform: `rotate(${from + 180}deg)` }} aria-hidden="true" />{t('{speed} m/s', { speed: Math.round(speed) })}</span>;
}
export function hourLabel(iso: string, index: number) {
    return index === 0 ? t('Now') : clock(iso);
}
export function dayName(date: string, index: number, long = false) {
    if (index === 0) return t('Today');
    return new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: long ? 'long' : 'short' });
}

/* ---------- Maps: Web Mercator tiles, Esri's grey canvas, SWEREF 99 TM ---------- */
export const TILE = 256;
export function worldPixel(lat: number, lon: number, zoom: number): [number, number] {
    const size = TILE * 2 ** zoom;
    const sin = Math.sin((lat * Math.PI) / 180);
    return [((lon + 180) / 360) * size, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size];
}
export function latLonAt(x: number, y: number, zoom: number): [number, number] {
    const size = TILE * 2 ** zoom;
    return [(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI, (x / size) * 360 - 180];
}
export type Tile = { key: string; x: number; y: number; tx: number; ty: number };
/** The tiles covering a view whose top left corner is at (left, top) in world pixels. */
export function tilesFor(left: number, top: number, width: number, height: number, zoom: number): Tile[] {
    if (!width) return [];
    const count = 2 ** zoom;
    const list: Tile[] = [];
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
        if (ty < 0 || ty >= count) continue;
        for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
            list.push({ key: `${zoom}:${tx}:${ty}`, x: tx * TILE - left, y: ty * TILE - top, tx: ((tx % count) + count) % count, ty });
        }
    }
    return list;
}
/** Esri's grey canvas: a quiet map, with its names as a separate layer. No key needed. */
export function esri(layer: 'Base' | 'Reference', theme: 'dark' | 'light', zoom: number, tile: Tile) {
    return `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${theme === 'dark' ? 'Dark' : 'Light'}_Gray_${layer}/MapServer/tile/${zoom}/${tile.ty}/${tile.tx}`;
}

export function useTheme(): 'dark' | 'light' {
    const read = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    const [theme, setTheme] = useState<'dark' | 'light'>(read);
    useEffect(() => {
        const observer = new MutationObserver(() => setTheme(read()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);
    return theme;
}

/** Latitude and longitude to SWEREF 99 TM, as App\Support\Weather::utm33. */
export function utm33(lat: number, lon: number): [number, number] {
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

/* ---------- Rain: SMHI's radar values, our colours, millimetres per hour ---------- */
/*
 * SMHI's radar colours, back to the radar's own values (0.4 dBZ steps from
 * -30), worked out from its PNG and GeoTIFF of the same moment. Anything else
 * (no rain, outside the radar, borders) is 0.
 */
const SMHI_LEVELS: [number, number, number, number][] = [
    [0, 50, 255, 89], [0, 70, 255, 91], [0, 90, 255, 92], [0, 110, 255, 95], [0, 130, 255, 98], [0, 150, 255, 101], [0, 170, 255, 104],
    [0, 128, 0, 105], [0, 138, 0, 109], [0, 148, 0, 111], [0, 158, 0, 113], [0, 163, 0, 116], [0, 168, 0, 119], [0, 173, 0, 121], [0, 178, 0, 124],
    [10, 208, 10, 125], [10, 218, 10, 129], [10, 228, 10, 131], [10, 238, 10, 132], [10, 248, 10, 136],
    [255, 255, 15, 137], [255, 246, 15, 141], [255, 238, 15, 144], [255, 229, 15, 145], [255, 220, 15, 148],
    [255, 200, 0, 150], [255, 180, 0, 152], [255, 160, 0, 155], [255, 140, 0, 157], [255, 120, 0, 160],
    [255, 35, 35, 162], [255, 15, 15, 165], [255, 0, 0, 167], [235, 0, 0, 170], [215, 0, 0, 172], [195, 0, 0, 175], [175, 0, 0, 178], [155, 0, 0, 180], [135, 0, 0, 184], [115, 0, 0, 186],
    [175, 0, 175, 188], [184, 0, 184, 190], [211, 0, 211, 198], [219, 0, 219, 200],
];
const LEVEL_BY_COLOUR = new Map(SMHI_LEVELS.map(([r, g, b, value]) => [(r << 16) | (g << 8) | b, value]));
export function intensity(r: number, g: number, b: number, a: number): number {
    if (a < 128 || (r === g && g === b)) return 0;
    const exact = LEVEL_BY_COLOUR.get((r << 16) | (g << 8) | b);
    if (exact !== undefined) return exact;
    let best = 0, distance = Infinity;
    for (const [lr, lg, lb, value] of SMHI_LEVELS) {
        const d = (lr - r) ** 2 + (lg - g) ** 2 + (lb - b) ** 2;
        if (d < distance) { distance = d; best = value; }
    }
    return distance < 3000 ? best : 0;
}
/* Our own scale, calm blues to violet and pink for the heaviest rain; the faintest rain fades out. */
export const RAIN_STOPS: [number, number, number, number, number][] = [
    [60, 150, 205, 255, 0], [89, 150, 205, 255, 95], [104, 95, 170, 255, 140], [120, 60, 128, 250, 170],
    [137, 82, 92, 240, 190], [150, 128, 72, 232, 205], [165, 196, 72, 205, 220], [185, 255, 92, 150, 235],
];
export function rainColour(value: number): [number, number, number, number] {
    if (value <= RAIN_STOPS[0][0]) return [RAIN_STOPS[0][1], RAIN_STOPS[0][2], RAIN_STOPS[0][3], 0];
    for (let i = 1; i < RAIN_STOPS.length; i++) {
        const [at, r, g, b, a] = RAIN_STOPS[i];
        if (value <= at) {
            const [pat, pr, pg, pb, pa] = RAIN_STOPS[i - 1];
            const f = (value - pat) / (at - pat);
            return [pr + (r - pr) * f, pg + (g - pg) * f, pb + (b - pb) * f, pa + (a - pa) * f];
        }
    }
    const last = RAIN_STOPS[RAIN_STOPS.length - 1];
    return [last[1], last[2], last[3], last[4]];
}
/** A radar value as millimetres per hour (Marshall and Palmer: Z = 200 R^1.6). */
export function rainRate(value: number): number {
    if (value < 85) return 0;
    const dbz = value * 0.4 - 30;
    return (10 ** (dbz / 10) / 200) ** (1 / 1.6);
}
export function rainWord(rate: number): string {
    if (rate <= 0) return t('No rain');
    if (rate < 0.5) return t('Drizzle');
    if (rate < 2.5) return t('Light rain');
    if (rate < 10) return t('Moderate rain');
    if (rate < 50) return t('Heavy rain');
    return t('Violent rain');
}
/** The radar value for a rate, for placing the legend's marks. */
export function valueForRate(rate: number): number {
    return ((10 * Math.log10(200 * rate ** 1.6)) + 30) / 0.4;
}
