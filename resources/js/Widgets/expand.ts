import { router } from '@inertiajs/react';

/*
 * Opening a core app from its widget: the widget grows into the space the
 * app will fill, then the app takes over beneath it and the copy fades away.
 * A copy is animated, never the widget itself, so the dashboard stays intact
 * if the visit fails.
 */
let ghost: HTMLElement | null = null;

/** Where an app's frame sits: the content area, from below its padding to the bottom of the window. */
export function appArea(): { left: number; top: number; width: number; height: number } {
    const content = document.querySelector<HTMLElement>('.ps-content');
    if (!content) return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const box = content.getBoundingClientRect();
    const style = getComputedStyle(content);
    const left = box.left + parseFloat(style.paddingLeft);
    // The app opens at the top of the page, wherever the dashboard was scrolled to.
    const top = box.top + window.scrollY + parseFloat(style.paddingTop);
    const width = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return { left, top, width, height: Math.max(420, window.innerHeight - top - 28) };
}

export function expandWidget(from: Element | null, href: string) {
    if (!(from instanceof HTMLElement) || window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.innerWidth <= 700) {
        router.visit(href);
        return;
    }
    settleExpand(true);
    const start = from.getBoundingClientRect();
    const copy = from.cloneNode(true) as HTMLElement;
    copy.classList.add('widget-ghost');
    copy.setAttribute('aria-hidden', 'true');
    Object.assign(copy.style, { left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px` });
    document.body.appendChild(copy);
    ghost = copy;
    const end = appArea();
    requestAnimationFrame(() => requestAnimationFrame(() => {
        copy.classList.add('is-growing');
        Object.assign(copy.style, { left: `${end.left}px`, top: `${end.top}px`, width: `${end.width}px`, height: `${end.height}px` });
    }));
    window.setTimeout(() => router.visit(href, { onError: () => settleExpand(true) }), 360);
    // Never leave a copy behind if the app does not come.
    window.setTimeout(() => settleExpand(), 4000);
}

/** The app is on screen: fade the growing copy away. */
export function settleExpand(now = false) {
    const copy = ghost;
    ghost = null;
    if (!copy) return;
    if (now) { copy.remove(); return; }
    copy.classList.add('is-leaving');
    window.setTimeout(() => copy.remove(), 380);
}
