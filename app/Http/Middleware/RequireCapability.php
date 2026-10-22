<?php

namespace App\Http\Middleware;

use App\Support\Permissions;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireCapability
{
    public function handle(Request $request, Closure $next, string $capability): Response
    {
        $user = $request->user();
        abort_unless($user && Permissions::can($user, $capability), 403, __('You do not have permission to do that.'));

        return $next($request);
    }
}
