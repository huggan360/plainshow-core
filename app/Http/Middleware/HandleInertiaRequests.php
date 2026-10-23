<?php

namespace App\Http\Middleware;

use App\Models\Extension;
use App\Support\Permissions;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    public function share(Request $request): array
    {
        $user = $request->user();
        $permissions = $user ? Permissions::for($user) : ['services' => [], 'capabilities' => []];

        return [
            ...parent::share($request),
            'uiVersion' => substr(md5((string) @filemtime(public_path('ui/css/plainshow.css'))), 0, 10),
            'auth' => [
                'user' => $user?->summary(),
                'capabilities' => $permissions['capabilities'],
            ],
            'apps' => $user ? fn () => Extension::where('enabled', true)
                ->orderBy('sort')
                ->get()
                ->filter(fn (Extension $extension) => $extension->id === 'core' || in_array($extension->id, $permissions['services'], true))
                ->map(fn (Extension $extension) => $extension->only(['id', 'name', 'icon', 'url']))
                ->values() : [],
            // Apps inside the dashboard (sidebar, widget expand), and the person's home for the weather widgets.
            'coreApps' => $user ? fn () => \App\Support\CoreApps::for($user) : [],
            'adminAreas' => $user ? fn () => \App\Support\AdminAreas::for($user) : [],
            'weatherHome' => $user ? fn () => $user->weather['home'] ?? null : null,
            'flash' => [
                'status' => fn () => $request->session()->get('status'),
                'error' => fn () => $request->session()->get('error'),
            ],
        ];
    }
}
