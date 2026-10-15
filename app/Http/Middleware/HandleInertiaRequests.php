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
            'uiVersion' => substr((string) \Composer\InstalledVersions::getReference('plainshow/kit'), 0, 8) ?: 'dev',
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
            'flash' => [
                'status' => fn () => $request->session()->get('status'),
                'error' => fn () => $request->session()->get('error'),
            ],
        ];
    }
}
