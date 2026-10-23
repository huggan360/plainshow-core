import { router } from '@inertiajs/react';

/*
 * Opening a core app from its widget. The widget's sky (or its box) grows
 * into the place the app's frame will take, while its text fades; the app
 * then opens beneath it and the copy fades away once the app has drawn its
 * own sky. Only a copy moves, scaled with a transform so it stays smooth.
 * On phones and tablets (where the app is a normal scrolling page), and with
 * reduced motion, the app simply opens.
 */
let ghost: HTMLElement | null = null;
let face: HTMLElement | null = null;
let fallback = 0;

/** Matches .ps-shell--app .ps-content's padding at the top and bottom (resources/css/app.css). */
const APP_GAP = 16;

/** Where an app's frame sits: across the content area, from just below the top bar to just above the bottom. */
export function appArea(): { left: number; top: number; width: number; height: number } {
    const content = document.querySelector<HTMLElement>('.ps-content');
    if (!content) return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const box = content.getBoundingClientRect();
    const style = getComputedStyle(content);
    const left = box.left + parseFloat(style.paddingLeft);
    // The app opens at the top of the page, wherever the dashboard was scrolled to.
    const top = box.top + window.scrollY + APP_GAP;
    const width = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return { left, top, width, height: window.innerHeight - top - APP_GAP };
}

export function expandWidget(from: Element | null, href: string) {
    if (!(from instanceof HTMLElement) || window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.innerWidth <= 991) {
        router.visit(href);
        return;
    }
    settleExpand(true);
    const start = from.getBoundingClientRect();
    const end = appArea();
    const copy = document.createElement('div');
    copy.className = 'widget-ghost';
    copy.setAttribute('aria-hidden', 'true');
    // The sky if the widget has one, else the widget's own box; its text fades out as it grows.
    const sky = from.querySelector('.wx-sky');
    if (sky) copy.appendChild(sky.cloneNode(true));
    else copy.classList.add('widget-ghost--plain');
    // The widget as it looks, left where it is, fading as its sky grows out from under it.
    const still = from.cloneNode(true) as HTMLElement;
    still.className = `${from.className} widget-ghost__face`;
    still.setAttribute('aria-hidden', 'true');
    Object.assign(still.style, { left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px` });
    Object.assign(copy.style, {
        left: `${end.left}px`, top: `${end.top}px`, width: `${end.width}px`, height: `${end.height}px`,
        transform: `translate(${start.left - end.left}px, ${start.top - end.top}px) scale(${start.width / end.width}, ${start.height / end.height})`,
    });
    document.body.append(copy, still);
    ghost = copy;
    face = still;
    requestAnimationFrame(() => requestAnimationFrame(() => { copy.classList.add('is-growing'); still.classList.add('is-growing'); }));
    window.setTimeout(() => router.visit(href, { onError: () => settleExpand(true) }), 420);
    // Never leave a copy behind if the app does not come.
    window.clearTimeout(fallback);
    fallback = window.setTimeout(() => settleExpand(), 2500);
}

/** True while a widget is growing into its app, so the app can skip its own fade. */
export function expanding(): boolean {
    return ghost !== null;
}

/** The app has drawn itself: fade the growing copy away. */
export function settleExpand(now = false) {
    const copy = ghost;
    face?.remove();
    ghost = null;
    face = null;
    if (!copy) return;
    if (now) { copy.remove(); return; }
    copy.classList.add('is-leaving');
    window.setTimeout(() => copy.remove(), 450);
}
