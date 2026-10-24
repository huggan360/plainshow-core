import { router, usePage } from '@inertiajs/react';
import { CSSProperties, ReactNode, useRef, useState } from 'react';
import { t } from '@/i18n';
import { SharedProps } from '@/types';
import { Fill } from './List';
import { ExpandButton, useBorder, useHeight, useSetting, useSize, WidgetDefinition } from './base';
import { RadarMap } from './Radar';
import { Day, dayName, degrees, Forecast, Hour, hourLabel, label, phaseOf, Place, PlaceSearch, placeUrl, send, Sky, useForecast, useWidth, WeatherIcon, Wind } from './weatherKit';

export type { Place } from './weatherKit';
export { PlaceSearch } from './weatherKit';

/*
 * Weather, Forecast and Rain radar. Each shows the widget's own place, else
 * the person's home place (set in the Weather app, or here the first time).
 * Weather and Forecast open the Weather app with the expand button in the
 * corner; the radar opens it straight on the radar.
 */
function usePlace(definition: WidgetDefinition): Place | null {
    const own = useSetting<Place | undefined>(definition, 'place');
    const home = usePage<SharedProps>().props.weatherHome;
    if (own && typeof own.lat === 'number') return own;
    return home && typeof home.lat === 'number' ? home : null;
}

/** Shown in a weather widget when there is no place at all: the place chosen becomes home. */
function AskPlace() {
    const [error, setError] = useState(false);
    const pick = (place: Place) => {
        setError(false);
        send('PUT', '/weather/home', { place }).then(() => router.reload({ only: ['weatherHome'] })).catch(() => setError(true));
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

function WeatherFrame({ definition, forecast, className, place, children }: { definition: WidgetDefinition; forecast: Forecast | null; className: string; place: Place | null; children: ReactNode }) {
    const border = useBorder(definition.border);
    const { tiny } = useSize(definition);
    return (
        <section className={`ps-frame ps-widget widget-weather${tiny ? ' is-tiny' : ''} ${className}`} data-border={border}>
            <div className="ps-frame__panel">
                <Sky phase={phaseOf(forecast)} condition={forecast?.current.condition} precip={forecast?.current.precip ?? 0} />
                {place && <ExpandButton href={placeUrl(place)} />}
                <div className="wx">{children}</div>
            </div>
        </section>
    );
}

/** As many hours as fit at a readable size (about 64 px each), at most `count`. */
export function Hours({ hours, count: most }: { hours: Hour[]; count: number }) {
    const box = useRef<HTMLDivElement>(null);
    const width = useWidth(box);
    const count = width ? Math.max(3, Math.min(most, Math.floor((width + 3) / 67))) : most;
    return (
        <div ref={box} className="wx-hours" style={{ '--count': count } as CSSProperties}>
            {hours.slice(0, count).map((hour, index) => (
                <div key={hour.time} className={`wx-hour${index === 0 ? ' is-first' : ''}${index === count - 1 ? ' is-last' : ''}`}>
                    <span className="wx-hour__time">{hourLabel(hour.time, index)}</span>
                    <WeatherIcon condition={hour.condition} day={hour.isDay} name={label(hour.condition)} />
                    <strong>{degrees(hour.temp)}</strong>
                    <span className="wx-hour__rain">{hour.precip >= 0.1 ? t('{mm} mm', { mm: hour.precip.toFixed(1) }) : ' '}</span>
                </div>
            ))}
        </div>
    );
}

function Waiting({ error }: { error: boolean }) {
    return error ? <Fill icon="bx-error-circle">{t('The weather service did not answer.')}</Fill> : <div className="wx-wait"><i className="bx bx-loader-alt bx-spin" aria-hidden="true" /></div>;
}

/* ---------- Weather: now, and the next hours when there is room ---------- */
/** A tiny weather widget: the temperature and the sky, and the place. */
function TinyWeather({ place, data }: { place: Place; data: Forecast }) {
    return (
        <div className="wx-tiny">
            <WeatherIcon condition={data.current.condition} day={data.current.isDay} name={label(data.current.condition)} />
            <span className="wx-tiny__temp">{degrees(data.current.temp)}</span>
            <span className="wx-tiny__place">{place.name}</span>
        </div>
    );
}

export function WeatherWidget({ definition }: { definition: WidgetDefinition }) {
    const place = usePlace(definition);
    const height = useHeight(definition);
    const { tiny } = useSize(definition);
    const { data, error } = useForecast(place);
    const today = data?.days[0];
    return (
        <WeatherFrame definition={definition} forecast={data} place={place} className="widget-weather--now">
            {!place ? <AskPlace /> : !data ? <Waiting error={error} /> : tiny ? <TinyWeather place={place} data={data} /> : <>
                <div className="wx__top">
                    <span className="wx__place"><i className="bx bxs-map" aria-hidden="true" />{place.name}</span>
                </div>
                <div className="wx__now">
                    <span className="wx__temp">{degrees(data.current.temp)}</span>
                    <span className="wx__what">
                        <WeatherIcon condition={data.current.condition} day={data.current.isDay} className="wx__icon" />
                        <span>{label(data.current.condition)}</span>
                        {today && <span className="wx__range">{t('{max} / {min}', { max: degrees(today.max), min: degrees(today.min) })}</span>}
                    </span>
                </div>
                <div className="wx__facts">
                    <Wind speed={data.current.wind} from={data.current.windDir} />
                    {data.current.feels !== null && <span>{t('Feels like {temp}', { temp: degrees(data.current.feels) })}</span>}
                    {data.current.humidity !== null && height !== 'short' && <span><i className="bx bx-droplet" aria-hidden="true" />{data.current.humidity}%</span>}
                </div>
                {height !== 'short' && <Hours hours={data.hours} count={8} />}
            </>}
        </WeatherFrame>
    );
}

/* ---------- Forecast: now, the hours and the week ---------- */
export function ForecastWidget({ definition }: { definition: WidgetDefinition }) {
    const place = usePlace(definition);
    const height = useHeight(definition);
    const { tiny } = useSize(definition);
    const { data, error } = useForecast(place);
    return (
        <WeatherFrame definition={definition} forecast={data} place={place} className={`widget-weather--forecast widget-weather--${height}`}>
            {!place ? <AskPlace /> : !data ? <Waiting error={error} /> : tiny ? <TinyWeather place={place} data={data} /> : <>
                <div className="wx__head">
                    <div className="wx__now">
                        <span className="wx__temp">{degrees(data.current.temp)}</span>
                        <span className="wx__what">
                            <span className="wx__place"><i className="bx bxs-map" aria-hidden="true" />{place.name}</span>
                            <span><WeatherIcon condition={data.current.condition} day={data.current.isDay} /> {label(data.current.condition)}</span>
                        </span>
                    </div>
                    <div className="wx__facts wx__facts--column">
                        <Wind speed={data.current.wind} from={data.current.windDir} />
                        {data.current.feels !== null && <span>{t('Feels like {temp}', { temp: degrees(data.current.feels) })}</span>}
                        {data.current.humidity !== null && <span><i className="bx bx-droplet" aria-hidden="true" />{data.current.humidity}%</span>}
                    </div>
                </div>
                {height !== 'short' && <Hours hours={data.hours} count={12} />}
                <Days days={data.days} rows={height === 'tall'} />
                <span className="wx__credit">{data.sourceName}</span>
            </>}
        </WeatherFrame>
    );
}

export function Days({ days: all, rows }: { days: Day[]; rows: boolean }) {
    const box = useRef<HTMLDivElement>(null);
    const width = useWidth(box);
    // Tiles need about 58 px each; rows always show the whole week.
    const days = rows || !width ? all : all.slice(0, Math.max(3, Math.floor((width + 3) / 61)));
    const low = Math.min(...days.map((day) => day.min));
    const high = Math.max(...days.map((day) => day.max));
    const span = Math.max(1, high - low);
    if (!rows) {
        return (
            <div ref={box} className="wx-days" style={{ '--count': days.length } as CSSProperties}>
                {days.map((day, index) => (
                    <div key={day.date} className={`wx-day${index === 0 ? ' is-first' : ''}${index === days.length - 1 ? ' is-last' : ''}`}>
                        <span>{dayName(day.date, index)}</span>
                        <WeatherIcon condition={day.condition} name={label(day.condition)} />
                        <strong>{degrees(day.max)}</strong>
                        <span className="wx-day__low">{degrees(day.min)}</span>
                    </div>
                ))}
            </div>
        );
    }
    return (
        <div ref={box} className="wx-week">
            {days.map((day, index) => (
                <div key={day.date} className={`wx-week__row${index === 0 ? ' is-first' : ''}${index === days.length - 1 ? ' is-last' : ''}`}>
                    <span className="wx-week__name">{dayName(day.date, index)}</span>
                    <WeatherIcon condition={day.condition} name={label(day.condition)} />
                    <span className="wx-week__rain">{day.precip >= 0.5 ? t('{mm} mm', { mm: Math.round(day.precip) }) : ''}</span>
                    <span className="wx-week__low">{degrees(day.min)}</span>
                    <span className="wx-week__bar"><span style={{ left: `${((day.min - low) / span) * 100}%`, right: `${100 - ((day.max - low) / span) * 100}%` }} /></span>
                    <span className="wx-week__high">{degrees(day.max)}</span>
                </div>
            ))}
        </div>
    );
}

/* ---------- Rain radar ---------- */
const ZOOM: Record<string, number> = { near: 8, region: 7, wide: 6 };
export function RadarWidget({ definition }: { definition: WidgetDefinition }) {
    const place = usePlace(definition);
    const area = useSetting<string>(definition, 'area') ?? 'region';
    const border = useBorder(definition.border);
    const { tiny } = useSize(definition);
    return (
        <section className={`ps-frame ps-widget widget-radar${tiny ? ' is-tiny' : ''}`} data-border={border}>
            <div className="ps-frame__panel">
                {!place ? <><Sky phase="day" condition="rain" /><div className="wx"><AskPlace /></div></> : <>
                    <RadarMap place={place} zoom={ZOOM[area] ?? 7} />
                    <ExpandButton href={placeUrl(place, 'radar')} />
                </>}
            </div>
        </section>
    );
}
