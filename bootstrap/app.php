<?php

use App\Http\Middleware\EnsureActiveUser;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\RequireCapability;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api/core/v1',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function () {
            Illuminate\Support\Facades\Route::group([], base_path('routes/gateway.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // The language cookie is set by scripts on every PlainShow site, so it is not encrypted.
        $middleware->encryptCookies(except: ['ps_lang', 'ps_accent']);
        $middleware->web(prepend: [\App\Http\Middleware\SetLanguage::class]);
        $middleware->web(append: [SecurityHeaders::class, EnsureActiveUser::class, HandleInertiaRequests::class]);
        $middleware->alias(['can.do' => RequireCapability::class]);
        $middleware->redirectGuestsTo(fn (Request $request) => '/auth/login?return='.rawurlencode($request->getRequestUri()));
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Errors on pages render inside the app shell instead of a bare page.
        $exceptions->respond(function (Response $response, Throwable $error, Request $request) {
            $status = $response->getStatusCode();
            if (! app()->environment('local') && in_array($status, [403, 404, 419, 500, 503], true) && ! $request->expectsJson() && $request->user()) {
                $titles = [403 => 'Not allowed', 404 => 'Not found', 419 => 'Page expired', 500 => 'Something went wrong', 503 => 'Unavailable'];
                $message = $status === 403 && $error->getMessage() !== '' ? $error->getMessage() : null;

                return Inertia::render('Problem', ['title' => $titles[$status], 'message' => $message, 'status' => $status])
                    ->toResponse($request)
                    ->setStatusCode($status);
            }

            return $response;
        });
    })->create();
