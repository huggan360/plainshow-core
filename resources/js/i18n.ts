/*
 * Texts in the visitor's language: English (as written), Dutch or Swedish.
 * The server picks the language (ps_lang cookie, else the browser) and puts
 * it on <html lang>. Dictionaries are lang/<code>.json, shared with Laravel's
 * __(): {"English text": "Translation"}. {name} is filled in after translating.
 */
import nl from '../../lang/nl.json';
import sv from '../../lang/sv.json';

export const LANGS = [
    { code: 'en', name: 'English' },
    { code: 'nl', name: 'Nederlands' },
    { code: 'sv', name: 'Svenska' },
] as const;
export type Lang = (typeof LANGS)[number]['code'];

const dictionaries: Record<string, Record<string, string>> = { nl, sv };
const html = typeof document !== 'undefined' ? document.documentElement.lang : 'en';
export const lang: Lang = (LANGS.some((item) => item.code === html) ? html : 'en') as Lang;
const dictionary = dictionaries[lang] ?? {};

export function t(text: string | null | undefined, params?: Record<string, string | number>): string {
    if (!text) return '';
    let out = dictionary[text] || text;
    if (params) for (const [name, value] of Object.entries(params)) out = out.split(`{${name}}`).join(String(value));
    return out;
}

/** One text for exactly one, another for other counts; {n} is the count. */
export function tn(count: number, one: string, many: string, params?: Record<string, string | number>): string {
    return t(count === 1 ? one : many, { n: count, ...params });
}

/** Dates and numbers in the chosen language. */
export const locale = lang === 'sv' ? 'sv-SE' : lang === 'nl' ? 'nl-NL' : 'en-GB';

/** Remember a language for every PlainShow site and show this page in it. */
export function setLang(code: Lang) {
    const labels = location.hostname.split('.');
    const domain = /^[\d.]+$/.test(location.hostname) || labels.length < 2 ? '' : labels.length > 2 ? labels.slice(1).join('.') : location.hostname;
    document.cookie = `ps_lang=${code}; path=/; max-age=31536000; SameSite=Lax${domain ? `; domain=${domain}` : ''}${location.protocol === 'https:' ? '; Secure' : ''}`;
    location.reload();
}
