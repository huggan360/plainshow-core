import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/*
 * The Assistant at work, as a drone show: glowing dots in the theme colour
 * rise from the prompt into a grid, wheel round in a ring once, then
 * rearrange from one icon straight into the next (a calendar, a cloud,
 * news, a folder, a file) while they work.
 * When the answer is ready, land() flies them into the exact shape of what is
 * about to appear: the outline of each widget, and the very letters of any
 * words, read from the page's own font where the text will stand. More dots
 * split off when the shape needs them. They fade as the answer fades in.
 * Drawn on one canvas, additively, with a pre-rendered glow per colour.
 */
export type SwarmHandle = {
    /** Fly into the shape of this (laid out, still unseen) element, then call done. */
    land: (element: HTMLElement, done: () => void) => void;
};

type Dot = { x: number; y: number; tx: number; ty: number; delay: number; size: number; colour: number; phase: number };
type Shape = { points: Point[]; fine: boolean[] };
type Point = [number, number];

const ICONS = ['bx-calendar', 'bx-cloud-light-rain', 'bx-news', 'bx-folder', 'bx-file', 'bx-chevron-right-square'];
const HOLD = 1500;

/** Points inside a Boxicons glyph, centred on 0,0 and `size` across, read from the font itself. */
function glyph(icon: string, size: number): Point[] {
    const probe = document.createElement('i');
    probe.className = `bx ${icon}`;
    probe.style.cssText = 'position:absolute;visibility:hidden;font-size:16px';
    document.body.appendChild(probe);
    const content = getComputedStyle(probe, '::before').content.replace(/^["']|["']$/g, '');
    const family = getComputedStyle(probe).fontFamily;
    probe.remove();
    const pixels = Math.round(size);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = pixels;
    const context = canvas.getContext('2d');
    if (!context || !content || content === 'none') return [];
    context.font = `${pixels * 0.92}px ${family}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(content, pixels / 2, pixels / 2);
    const data = context.getImageData(0, 0, pixels, pixels).data;
    const points: Point[] = [];
    const step = Math.max(3, Math.round(pixels / 34));
    for (let y = 0; y < pixels; y += step) {
        for (let x = 0; x < pixels; x += step) {
            if (data[(y * pixels + x) * 4 + 3] > 140) points.push([x - pixels / 2, y - pixels / 2]);
        }
    }
    return points;
}

/** n points spread over a set: every point once, then again, evenly. */
function spread(points: Point[], n: number): Point[] {
    if (!points.length) return Array.from({ length: n }, () => [0, 0]);
    return Array.from({ length: n }, (_, index) => points[Math.floor((index * points.length) / n) % points.length]);
}

/** The outline of a rounded box and a light fill inside it: the shape of what is coming. */
function boxShape(width: number, height: number, n: number): Point[] {
    const radius = Math.min(22, width / 6, height / 3);
    const outline = Math.round(n * 0.62);
    const perimeter = 2 * (width + height);
    const points: Point[] = [];
    for (let index = 0; index < outline; index++) {
        let d = (index / outline) * perimeter;
        let x: number, y: number;
        if (d < width) { x = d; y = 0; } else if ((d -= width) < height) { x = width; y = d; } else if ((d -= height) < width) { x = width - d; y = height; } else { d -= width; x = 0; y = height - d; }
        // Round the corners in.
        const cx = Math.min(Math.max(x, radius), width - radius), cy = Math.min(Math.max(y, radius), height - radius);
        const dx = x - cx, dy = y - cy, length = Math.hypot(dx, dy);
        if (length > radius) { x = cx + (dx / length) * radius; y = cy + (dy / length) * radius; }
        points.push([x, y]);
    }
    const inner = n - outline;
    const columns = Math.max(2, Math.round(Math.sqrt(inner * (width / Math.max(height, 1)))));
    const rows = Math.max(1, Math.ceil(inner / columns));
    for (let index = 0; index < inner; index++) {
        const column = index % columns, row = Math.floor(index / columns);
        points.push([16 + ((column + 0.5) / columns) * (width - 32), 18 + ((row + 0.5) / rows) * Math.max(0, height - 36)]);
    }
    return points;
}

/** The most dots a landing may use; past this, text is sampled more sparsely. */
const MOST = 900;

/** Points on the letters of an element's text, where they stand on the page, relative to origin. */
function letters(element: HTMLElement, originX: number, originY: number): Point[] {
    const box = element.getBoundingClientRect();
    const width = Math.ceil(box.width), height = Math.ceil(box.height);
    if (!width || !height) return [];
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return [];
    const style = getComputedStyle(element);
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.textBaseline = 'middle';
    // Each character where the browser put it, wrapped lines and all.
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        for (let index = 0; index < text.length; index++) {
            if (/\s/.test(text[index])) continue;
            const wide = text.codePointAt(index)! > 0xffff ? 2 : 1;
            range.setStart(node, index); range.setEnd(node, index + wide);
            const rect = range.getClientRects()[0];
            if (rect) context.fillText(text.slice(index, index + wide), rect.left - box.left, rect.top - box.top + rect.height / 2);
            index += wide - 1;
        }
    }
    const data = context.getImageData(0, 0, width, height).data;
    const points: Point[] = [];
    const step = Math.max(2, Math.round(parseFloat(style.fontSize) / 12));
    for (let y = 0; y < height; y += step) {
        for (let x = (y / step) % 2 ? step / 2 : 0; x < width; x += step) {
            if (data[(y * width + Math.floor(x)) * 4 + 3] > 110) points.push([box.left - originX + x, box.top - originY + y]);
        }
    }
    return points;
}

/** Every widget's outline and every word's letters inside an answer, relative to origin. */
function shapeOf(element: HTMLElement, originX: number, originY: number, fallback: number): Shape {
    const shape: Shape = { points: [], fine: [] };
    const add = (points: Point[], fine: boolean) => points.forEach((point) => { shape.points.push(point); shape.fine.push(fine); });
    const outline = (target: Element, fine: boolean, density: number) => {
        const rect = target.getBoundingClientRect();
        const n = Math.round(Math.min(200, Math.max(24, (2 * (rect.width + rect.height)) / density)));
        add(boxShape(rect.width, rect.height, n).map(([x, y]) => [rect.left - originX + x, rect.top - originY + y]), fine);
    };
    element.querySelectorAll('.assistant-answer__block').forEach((block) => outline(block, false, 9));
    element.querySelectorAll('.assistant-question__choices button').forEach((button) => outline(button, true, 6));
    const text: Point[] = [];
    element.querySelectorAll<HTMLElement>('.assistant-words').forEach((words) => text.push(...letters(words, originX, originY)));
    // Too many points for the dots there are: keep an even share of them.
    const room = Math.max(120, MOST - shape.points.length);
    add(text.length > room ? text.filter((_, index) => Math.floor((index * room) / text.length) !== Math.floor(((index + 1) * room) / text.length)) : text, true);
    if (!shape.points.length) {
        const rect = element.getBoundingClientRect();
        add(boxShape(rect.width, rect.height, fallback).map(([x, y]) => [rect.left - originX + x, rect.top - originY + y]), false);
    }
    return shape;
}

/** A theme colour (#rrggbb, as the kit defines them) with an alpha. */
function rgba(colour: string, alpha: number): string {
    const hex = colour.replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return colour;
    return `rgba(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}, ${alpha})`;
}

function sprite(colour: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d')!;
    const glow = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, rgba(colour, 1));
    glow.addColorStop(0.3, rgba(colour, 1));
    glow.addColorStop(0.5, rgba(colour, 0.22));
    glow.addColorStop(1, rgba(colour, 0));
    context.fillStyle = glow;
    context.fillRect(0, 0, 32, 32);
    return canvas;
}

/** `icon`: what is being done now (a Boxicons name from ICONS); the dots form it. Without one they go through them all. */
export const Swarm = forwardRef<SwarmHandle, { className?: string; icon?: string }>(function Swarm({ className, icon }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wanted = useRef(icon);
    wanted.current = icon;
    const landing = useRef<{ shape: Shape; done: () => void; at: number; settled: number | null; called: boolean } | null>(null);

    useImperativeHandle(ref, () => ({
        land: (element, done) => {
            const origin = canvasRef.current?.getBoundingClientRect();
            if (!origin) { done(); return; }
            landing.current = { shape: shapeOf(element, origin.left, origin.top, 150), done, at: performance.now(), settled: null, called: false };
        },
    }), []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        let width = 0, height = 0;
        const resize = () => {
            width = canvas.clientWidth; height = canvas.clientHeight;
            canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);

        const root = getComputedStyle(document.documentElement);
        const colours = ['--ps-g1', '--ps-g2', '--ps-g3', '--ps-g4'].map((name) => root.getPropertyValue(name).trim() || '#fc5000');
        const sprites = colours.map(sprite);
        const count = width < 600 ? 110 : 150;
        const size = () => Math.max(120, Math.min(220, Math.min(width, height) * 0.36));
        const centre = (): Point => [width / 2, height * 0.46];
        const dots: Dot[] = Array.from({ length: count }, (_, index) => ({
            // They rise from the prompt below.
            x: width / 2 + (Math.random() - 0.5) * 240, y: height + 30 + Math.random() * 60, tx: 0, ty: 0,
            delay: Math.random() * 0.35, size: 1.4 + Math.random() * 1.8, colour: index % 4, phase: Math.random() * Math.PI * 2,
        }));
        const icons: Point[][] = [];
        document.fonts?.ready.then(() => ICONS.forEach((name) => icons.push(glyph(name, size()))));

        const started = performance.now();
        let fade = 1;
        let frame = 0;
        let last = started;

        const draw = (now: number) => {
            try {
                paint(now);
            } catch (error) {
                // Never stuck: hand the answer over, and stop drawing.
                console.error(error);
                const land = landing.current;
                if (land && !land.called) { land.called = true; land.done(); }
                context.clearRect(0, 0, width, height);
                return;
            }
            if (fade > 0) frame = requestAnimationFrame(draw);
        };

        const paint = (now: number) => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            const [cx, cy] = centre();
            const s = size();
            const land = landing.current;
            let targets: Point[];
            let fine: boolean[] = [];
            if (land) {
                // The shape needs more dots than there are: split some off where they fly.
                while (dots.length < land.shape.points.length) {
                    const parent = dots[Math.floor(Math.random() * count)];
                    dots.push({ ...parent, delay: 0, size: 1.4 + Math.random() * 1.8, colour: dots.length % 4, phase: Math.random() * Math.PI * 2 });
                }
                // Fewer points than dots: the rest double up on the same shape.
                targets = dots.map((_, index) => land.shape.points[index % land.shape.points.length]);
                fine = dots.map((_, index) => land.shape.fine[index % land.shape.fine.length]);
            } else {
                // The first frame's time can be a moment before the start: never a step below zero.
                const step = Math.max(0, Math.floor((now - started) / HOLD));
                // grid, ring, then icon after icon
                const kind = step === 0 ? 'grid' : step === 1 ? 'ring' : 'icon';
                if (kind === 'grid') {
                    const columns = Math.ceil(Math.sqrt(count));
                    targets = dots.map((_, index): Point => [cx - s / 2 + ((index % columns) + 0.5) * (s / columns), cy - s / 2 + (Math.floor(index / columns) + 0.5) * (s / columns)]);
                } else if (kind === 'ring' || !icons.length) {
                    const turn = (now - started) / 1000 * 1.4;
                    targets = dots.map((_, index): Point => {
                        const angle = (index / count) * Math.PI * 2 + turn;
                        const radius = s / 2 * (index % 3 === 0 ? 0.72 : 1);
                        return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
                    });
                } else {
                    const chosen = wanted.current ? ICONS.indexOf(wanted.current) : -1;
                    const shape = spread(icons[chosen >= 0 && icons[chosen] ? chosen : (step - 2) % icons.length] ?? [], count);
                    targets = shape.map(([x, y]) => [cx + x, cy + y]);
                }
            }

            const age = (now - started) / 1000;
            let settled = 0;
            dots.forEach((dot, index) => {
                const [tx, ty] = targets[index];
                const wobble = land ? 0 : 1.6;
                dot.tx = tx + Math.cos(age * 2 + dot.phase) * wobble;
                dot.ty = ty + Math.sin(age * 2.3 + dot.phase) * wobble;
                const ready = age > dot.delay;
                const pull = 1 - Math.exp(-dt * (land ? 9 : 6) * (ready ? 1 : 0.2));
                dot.x += (dot.tx - dot.x) * pull;
                dot.y += (dot.ty - dot.y) * pull;
                if (Math.hypot(dot.tx - dot.x, dot.ty - dot.y) < 3) settled++;
            });

            // Formed: hold the shape a moment, so the letters can be read, then hand over.
            if (land && land.settled === null && (settled > dots.length * 0.9 || now - land.at > 1300)) land.settled = now;
            if (land && !land.called && land.settled !== null && now - land.settled > 280) {
                land.called = true;
                land.done();
            }
            if (land?.called) fade = Math.max(0, fade - dt * 1.8);

            context.clearRect(0, 0, width, height);
            context.globalCompositeOperation = 'lighter';
            dots.forEach((dot, index) => {
                const small = fine[index] ?? false;
                const twinkle = small ? 0.85 + 0.1 * Math.sin(age * 4 + dot.phase) : 0.55 + 0.25 * Math.sin(age * 4 + dot.phase);
                const boost = land ? 1.1 : 1;
                context.globalAlpha = Math.min(1, twinkle * boost) * fade;
                // On letters the dots shrink to the size of a stroke, so the words can be read.
                const r = small ? 2.2 + dot.size * 0.35 : dot.size * 3.2 * (land ? 1.1 : 1);
                context.drawImage(sprites[dot.colour], dot.x - r, dot.y - r, r * 2, r * 2);
            });
            context.globalAlpha = 1;
            context.globalCompositeOperation = 'source-over';
        };
        frame = requestAnimationFrame(draw);
        return () => { cancelAnimationFrame(frame); observer.disconnect(); };
    }, []);

    return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
});
