<?php

namespace App\Support;

use Illuminate\Support\Facades\Cookie;
use PlainShow\Kit\Lang;
use PlainShow\Kit\Theme;

/**
 * The ps_accent cookie: the theme colour for every PlainShow site, on the
 * platform's domain like the language (not encrypted, so the other apps read it).
 */
class AccentCookie
{
    public static function queue(string $accent): void
    {
        $domain = Lang::cookieDomain((string) request()->getHost());
        Cookie::queue(cookie(Theme::COOKIE, $accent, 60 * 24 * 365, '/', $domain !== '' ? $domain : null, request()->isSecure(), false, false, 'lax'));
    }

    /** The account's colour wins: a new browser gets it on its first dashboard page. */
    public static function sync(?string $saved): void
    {
        $saved = Theme::valid($saved) ? $saved : Theme::DEFAULT;
        if ((request()->cookie(Theme::COOKIE) ?? Theme::DEFAULT) !== $saved) {
            self::queue($saved);
        }
    }
}
