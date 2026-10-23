import { CSSProperties, PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, WheelEvent as ReactWheelEvent } from 'react';
import { t } from '@/i18n';
import { Fill } from './List';
import { clock, esri, intensity, latLonAt, Place, RAIN_STOPS, rainColour, rainRate, rainWord, tilesFor, useJson, useTheme, utm33, valueForRate, worldPixel } from './weatherKit';

/*
 * Rain radar on a map. In a widget it is a still map around the place with
 * the last two hours playing. In the Weather app it is a tool: drag and zoom
 * the map, choose how many hours to play, scrub through them, set the rain's
 * strength on the map, and point at the rain to read how hard it falls.
 *
 * SMHI's frames are turned back into radar values once, then each frame is
 * drawn onto the map's own grid, blended between radar cells so the rain has
 * soft edges. RainViewer (outside SMHI's radar) comes as map tiles.
 */
type Radar = {
    provider: 'smhi' | 'rainviewer'; providerName: string; maxZoom?: number;
    grid?: { x0: number; y0: number; cell: number; width: number; height: number };
    frames: { time: string; url: string }[];
};
const SCALE = 0.5;

export function RadarMap({ place, zoom: startZoom, interactive = false, onClose }: { place: Place; zoom: number; interactive?: boolean; onClose?: () => void }) {
    const [hours, setHours] = useState(2);
    const { data: radar, error } = useJson<Radar>(`/weather/radar?lat=${place.lat}&lon=${place.lon}&hours=${hours}`, 300);
    if (!radar || radar.frames.length === 0) {
        return <div className="widget-radar__wait">{error || radar ? <Fill icon="bx-radar">{t('No radar right now.')}</Fill> : <i className="bx bx-loader-alt bx-spin" aria-hidden="true" />}</div>;
    }
    return <RadarView place={place} radar={radar} startZoom={Math.min(startZoom, radar.maxZoom ?? 10)} interactive={interactive} hours={hours} setHours={setHours} onClose={onClose} />;
}

function RadarView({ place, radar, startZoom, interactive, hours, setHours, onClose }: {
    place: Place; radar: Radar; startZoom: number; interactive: boolean; hours: number; setHours: (hours: number) => void; onClose?: () => void;
}) {
    const box = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const theme = useTheme();
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [center, setCenter] = useState({ lat: place.lat, lon: place.lon });
    const [zoom, setZoom] = useState(startZoom);
    const [drag, setDrag] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
    const [frame, setFrame] = useState(radar.frames.length - 1);
    const [playing, setPlaying] = useState(true);
    const [speed, setSpeed] = useState(1);
    const [strength, setStrength] = useState(1);
    const [levels, setLevels] = useState<Uint8Array[]>([]);
    const [hover, setHover] = useState<{ x: number; y: number; rate: number } | null>(null);
    const minZoom = 4;
    const maxZoom = radar.provider === 'rainviewer' ? (radar.maxZoom ?? 7) : 10;

    useLayoutEffect(() => {
        const element = box.current;
        if (!element) return;
        const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    // A new place recentres the map.
    useEffect(() => { setCenter({ lat: place.lat, lon: place.lon }); }, [place.lat, place.lon]);
    useEffect(() => { setFrame((current) => Math.min(current, radar.frames.length - 1)); }, [radar.frames.length]);

    const [cx, cy] = worldPixel(center.lat, center.lon, zoom);
    const left = cx - size.width / 2;
    const top = cy - size.height / 2;
    const tiles = useMemo(() => tilesFor(left, top, size.width, size.height, zoom), [left, top, size.width, size.height, zoom]);
    const [px, py] = worldPixel(place.lat, place.lon, zoom);

    // SMHI: every frame back to radar values, once per set of frames.
    useEffect(() => {
        if (radar.provider !== 'smhi' || !radar.grid) return;
        let alive = true;
        const grid = radar.grid;
        const source = document.createElement('canvas');
        source.width = grid.width; source.height = grid.height;
        const read = source.getContext('2d', { willReadFrequently: true })!;
        Promise.all(radar.frames.map((item) => new Promise<Uint8Array>((resolve) => {
            const image = new Image();
            image.onload = () => {
                read.clearRect(0, 0, grid.width, grid.height);
                read.drawImage(image, 0, 0);
                const pixels = read.getImageData(0, 0, grid.width, grid.height).data;
                const values = new Uint8Array(grid.width * grid.height);
                for (let i = 0; i < values.length; i++) values[i] = intensity(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2], pixels[i * 4 + 3]);
                resolve(values);
            };
            image.onerror = () => resolve(new Uint8Array(grid.width * grid.height));
            image.src = item.url;
        }))).then((result) => { if (alive) setLevels(result); });
        return () => { alive = false; };
    }, [radar]);

    // Where each pixel of the view falls in the radar grid, worked out once per view.
    const out = { width: Math.ceil(size.width * SCALE), height: Math.ceil(size.height * SCALE) };
    const lookup = useMemo(() => {
        if (radar.provider !== 'smhi' || !radar.grid || !out.width || !out.height) return null;
        const grid = radar.grid;
        const cols = new Float32Array(out.width * out.height);
        const rows = new Float32Array(out.width * out.height);
        for (let y = 0; y < out.height; y++) {
            for (let x = 0; x < out.width; x++) {
                const [lat, lon] = latLonAt(left + x / SCALE, top + y / SCALE, zoom);
                const [east, north] = utm33(lat, lon);
                cols[y * out.width + x] = (east - grid.x0) / grid.cell - 0.5;
                rows[y * out.width + x] = (grid.y0 - north) / grid.cell - 0.5;
            }
        }
        return { cols, rows };
    }, [radar, left, top, zoom, out.width, out.height]);

    // Draw the frame on screen.
    useEffect(() => {
        const element = canvas.current;
        const values = levels[frame];
        if (!element || !lookup || !values || !radar.grid) return;
        const grid = radar.grid;
        const image = new ImageData(out.width, out.height);
        for (let i = 0; i < lookup.cols.length; i++) {
            const value = sample(values, grid.width, grid.height, lookup.cols[i], lookup.rows[i]);
            if (value < 2) continue;
            const [r, g, b, a] = rainColour(value);
            image.data[i * 4] = r; image.data[i * 4 + 1] = g; image.data[i * 4 + 2] = b; image.data[i * 4 + 3] = a;
        }
        element.width = out.width; element.height = out.height;
        element.getContext('2d')!.putImageData(image, 0, 0);
    }, [levels, frame, lookup, out.width, out.height, radar.grid]);

    // Play the hours on a loop, resting a moment on the newest.
    useEffect(() => {
        if (!playing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        let rest = 0;
        const timer = window.setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            setFrame((current) => {
                if (current === radar.frames.length - 1 && rest < 3) { rest++; return current; }
                rest = 0;
                return (current + 1) % radar.frames.length;
            });
        }, 650 / speed);
        return () => window.clearInterval(timer);
    }, [playing, speed, radar.frames.length]);

    /* ---------- Moving the map ---------- */
    const down = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!interactive || (event.target as HTMLElement).closest('button, input, select, label')) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ x: event.clientX, y: event.clientY, dx: 0, dy: 0 });
        setHover(null);
    };
    const move = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (drag) { setDrag({ ...drag, dx: event.clientX - drag.x, dy: event.clientY - drag.y }); return; }
        if (!interactive || radar.provider !== 'smhi' || !radar.grid || event.pointerType === 'touch') return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left, y = event.clientY - rect.top;
        const values = levels[frame];
        if (!values) return;
        const [lat, lon] = latLonAt(left + x, top + y, zoom);
        const [east, north] = utm33(lat, lon);
        const grid = radar.grid;
        const value = sample(values, grid.width, grid.height, (east - grid.x0) / grid.cell - 0.5, (grid.y0 - north) / grid.cell - 0.5);
        setHover({ x, y, rate: rainRate(value) });
    };
    const up = () => {
        if (!drag) return;
        if (drag.dx || drag.dy) {
            const [lat, lon] = latLonAt(cx - drag.dx, cy - drag.dy, zoom);
            setCenter({ lat, lon });
        }
        setDrag(null);
    };
    const zoomBy = (step: number, anchor?: { x: number; y: number }) => {
        const next = Math.max(minZoom, Math.min(maxZoom, zoom + step));
        if (next === zoom) return;
        // Keep the point under the pointer where it is.
        const ax = anchor ? anchor.x - size.width / 2 : 0, ay = anchor ? anchor.y - size.height / 2 : 0;
        const factor = 2 ** (next - zoom);
        const [lat, lon] = latLonAt((cx + ax) * factor - ax, (cy + ay) * factor - ay, next);
        setZoom(next);
        setCenter({ lat, lon });
    };
    const wheelLock = useRef(0);
    const wheel = (event: ReactWheelEvent<HTMLDivElement>) => {
        if (!interactive || Math.abs(event.deltaY) < 4 || Date.now() < wheelLock.current) return;
        wheelLock.current = Date.now() + 250;
        const rect = event.currentTarget.getBoundingClientRect();
        zoomBy(event.deltaY < 0 ? 1 : -1, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    useEffect(() => {
        // The page must not scroll while the wheel zooms the map.
        const element = box.current;
        if (!element || !interactive) return;
        const stop = (event: WheelEvent) => event.preventDefault();
        element.addEventListener('wheel', stop, { passive: false });
        return () => element.removeEventListener('wheel', stop);
    }, [interactive]);

    const current = radar.frames[frame];
    const offset = drag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined;
    const tile = (layer: 'Base' | 'Reference') => tiles.map((item) => <img key={item.key} className="radar__tile" src={esri(layer, theme, zoom, item)} alt="" style={{ left: item.x, top: item.y }} draggable={false} />);
    const layerOpacity = Math.min(1, 0.8 * strength);

    return (
        <div ref={box} className={`radar${interactive ? ' radar--tool' : ''}${drag ? ' is-dragging' : ''}`}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => setHover(null)} onWheel={wheel}>
            <div className="radar__world" style={{ transform: offset }}>
                {tile('Base')}
                {radar.provider === 'smhi'
                    ? <canvas ref={canvas} className="radar__rain" style={{ opacity: Math.min(1, strength) }} />
                    : radar.frames.map((item, index) => (
                        <div key={item.time} className="radar__layer" style={{ opacity: index === frame ? layerOpacity : 0 }}>
                            {tiles.map((one) => <img key={one.key} className="radar__tile" src={item.url.replace('{z}', String(zoom)).replace('{x}', String(one.tx)).replace('{y}', String(one.ty))} alt="" style={{ left: one.x, top: one.y }} draggable={false} />)}
                        </div>
                    ))}
                <div className="radar__labels">{tile('Reference')}</div>
                <span className="radar__you" style={{ left: px - left, top: py - top }} aria-hidden="true" />
            </div>

            {hover && hover.rate > 0 && !drag && (
                <div className="radar__hover" style={{ left: hover.x, top: hover.y } as CSSProperties}>
                    <strong>{t('{rate} mm/h', { rate: hover.rate < 1 ? hover.rate.toFixed(1) : Math.round(hover.rate) })}</strong><span>{rainWord(hover.rate)}</span>
                </div>
            )}

            <div className="radar__bar">
                <span className="radar__place"><i className="bx bxs-map" aria-hidden="true" />{place.name}</span>
                {interactive
                    ? onClose && <button type="button" className="radar__chip radar__chip--button" onClick={onClose}><i className="bx bx-x" aria-hidden="true" />{t('Close radar')}</button>
                    : <span className="radar__time">{current ? clock(current.time) : ''}</span>}
            </div>

            {interactive ? <>
                <div className="radar__tools" role="toolbar" aria-label={t('Map')}>
                    <button type="button" onClick={() => zoomBy(1)} aria-label={t('Zoom in')} disabled={zoom >= maxZoom}><i className="bx bx-plus" /></button>
                    <button type="button" onClick={() => zoomBy(-1)} aria-label={t('Zoom out')} disabled={zoom <= minZoom}><i className="bx bx-minus" /></button>
                    <button type="button" onClick={() => { setCenter({ lat: place.lat, lon: place.lon }); setZoom(startZoom); }} aria-label={t('Back to the place')}><i className="bx bx-current-location" /></button>
                </div>
                <div className="radar__panel">
                    <label className="radar__setting"><span>{t('Hours')}</span>
                        <select value={hours} onChange={(event) => setHours(Number(event.target.value))} disabled={radar.provider !== 'smhi'}>
                            {[1, 2, 3, 6].map((value) => <option key={value} value={value}>{value === 1 ? t('1 hour') : t('{n} hours', { n: value })}</option>)}
                        </select>
                    </label>
                    <label className="radar__setting"><span>{t('Rain on the map')}</span>
                        <input type="range" min={0.3} max={1.25} step={0.05} value={strength} onChange={(event) => setStrength(Number(event.target.value))} />
                    </label>
                    <Legend />
                </div>
                <div className="radar__timeline">
                    <button type="button" className="radar__play" onClick={() => setPlaying((value) => !value)} aria-label={playing ? t('Pause') : t('Play')}><i className={`bx ${playing ? 'bx-pause' : 'bx-play'}`} /></button>
                    <button type="button" className="radar__speed" onClick={() => setSpeed((value) => (value === 1 ? 2 : value === 2 ? 0.5 : 1))} aria-label={t('Speed')}>{speed === 0.5 ? '½×' : `${speed}×`}</button>
                    <div className="radar__scrub">
                        <input type="range" min={0} max={radar.frames.length - 1} value={frame} aria-label={t('Time')}
                            onChange={(event) => { setPlaying(false); setFrame(Number(event.target.value)); }} />
                        <div className="radar__ticks"><span>{clock(radar.frames[0].time)}</span><span>{clock(radar.frames[radar.frames.length - 1].time)}</span></div>
                    </div>
                    <span className="radar__now">{current ? clock(current.time) : ''}</span>
                </div>
                <span className="radar__credit">{radar.providerName}, Esri{radar.provider !== 'smhi' ? `, ${t('rain amounts only over Sweden')}` : ''}</span>
            </> : <>
                <div className="radar__progress" aria-hidden="true">{radar.frames.map((item, index) => <span key={item.time} className={index <= frame ? 'is-done' : undefined} />)}</div>
                <span className="radar__credit">{radar.providerName}, Esri</span>
            </>}
        </div>
    );
}

/** A radar value at a fractional cell, blended from the four cells around it. */
function sample(values: Uint8Array, width: number, height: number, x: number, y: number): number {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    if (x0 < 0 || y0 < 0 || x0 + 1 >= width || y0 + 1 >= height) return 0;
    const fx = x - x0, fy = y - y0, at = y0 * width + x0;
    return (values[at] * (1 - fx) + values[at + 1] * fx) * (1 - fy) + (values[at + width] * (1 - fx) + values[at + width + 1] * fx) * fy;
}

/** How hard it rains, in the map's own colours. */
function Legend() {
    const low = RAIN_STOPS[1][0], high = RAIN_STOPS[RAIN_STOPS.length - 1][0];
    const stops = RAIN_STOPS.slice(1).map(([value, r, g, b]) => `rgb(${r}, ${g}, ${b}) ${((value - low) / (high - low)) * 100}%`).join(', ');
    const marks = [0.5, 2, 10, 50];
    return (
        <div className="radar__legend">
            <span className="radar__legend-title">{t('Rain, mm/h')}</span>
            <span className="radar__legend-bar" style={{ background: `linear-gradient(90deg, ${stops})` }} />
            <span className="radar__legend-marks">
                {marks.map((rate) => <span key={rate} style={{ left: `${Math.max(0, Math.min(100, ((valueForRate(rate) - low) / (high - low)) * 100))}%` }}>{rate}</span>)}
            </span>
        </div>
    );
}
