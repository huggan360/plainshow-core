<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;
use Illuminate\Support\Str;
use PlainShow\Kit\Platform;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $nonce = Str::random(24);
        Vite::useCspNonce($nonce);
        $request->attributes->set('csp_nonce', $nonce);

        $response = $next($request);
        if ($response->headers->has('Content-Security-Policy')) {
            return $response;
        }

        // Pictures may come from any app of this PlainShow; forms go to Login.
        $apps = implode(' ', array_values(Platform::urls()));
        $response->headers->set('Content-Security-Policy', implode('; ', [
            "default-src 'self'",
            "script-src 'self' 'nonce-$nonce'",
            // React sets inline style attributes (widths of meters and the like).
            "style-src 'self' 'unsafe-inline'",
            // Map tiles for the rain radar widget (Esri's grey canvas, and RainViewer outside SMHI's radar).
            "img-src 'self' data: blob: $apps https://server.arcgisonline.com https://tilecache.rainviewer.com",
            "font-src 'self'",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "form-action 'self' ".Platform::require('login'),
            "base-uri 'none'",
            "object-src 'none'",
        ]));
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
        if ($request->isSecure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000');
        }

        return $response;
    }
}
