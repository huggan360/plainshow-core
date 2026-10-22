<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use PlainShow\Kit\Lang;
use Symfony\Component\HttpFoundation\Response;

/**
 * Speak the visitor's language: the ps_lang cookie every PlainShow site
 * shares, else the browser's. Texts come from lang/<code>.json (and
 * lang/<code>/*.php for validation messages).
 */
class SetLanguage
{
    public function handle(Request $request, Closure $next): Response
    {
        $lang = Lang::detect($request->cookies->get(Lang::COOKIE), $request->header('Accept-Language'));
        app()->setLocale($lang);
        Lang::use($lang);

        $response = $next($request);
        $response->headers->set('Content-Language', $lang);
        $vary = $response->headers->get('Vary');
        $response->headers->set('Vary', $vary ? "$vary, Accept-Language, Cookie" : 'Accept-Language, Cookie');

        return $response;
    }
}
