<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Extension;
use App\Models\User;
use App\Support\Audit;
use App\Support\CoreWidgets;
use App\Support\Permissions;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ExtensionsController extends Controller
{
    public function index(): Response
    {
        $health = collect(CoreWidgets::services())->keyBy('id');

        return Inertia::render('Admin/Extensions', [
            'extensions' => Extension::orderBy('sort')->get()->map(fn (Extension $extension) => $extension->summary() + [
                'defaultAccess' => $extension->default_access,
                'capabilities' => count((array) ($extension->manifest['capabilities'] ?? [])),
                'health' => $health[$extension->id] ?? null,
            ]),
            'roles' => User::ROLES,
        ]);
    }

    public function update(Request $request, Extension $extension): RedirectResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'defaultAccess' => ['present', 'array'],
            'defaultAccess.*' => [Rule::in(User::ROLES)],
        ]);
        if ($extension->system) {
            $data['enabled'] = true;
        }
        $before = $extension->only(['enabled', 'default_access']);
        $access = array_values(array_unique(array_merge(['admin'], $data['defaultAccess'])));
        $extension->forceFill(['enabled' => $data['enabled'], 'default_access' => $access])->save();
        Cache::forget('core.service-health');
        Permissions::forget();
        Audit::record('extension.updated', ['extension' => $extension->id, 'before' => $before, 'after' => $extension->only(['enabled', 'default_access'])]);

        return back()->with('status', $extension->name.($extension->enabled ? ' is on.' : ' is off.'));
    }
}
