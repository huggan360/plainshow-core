<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/** An account disabled by an admin is signed out on its next request. */
class EnsureActiveUser
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = Auth::user();
        if ($user && ! $user->isActive()) {
            Auth::logout();
            $request->session()->invalidate();

            return redirect('/auth/login');
        }

        return $next($request);
    }
}
