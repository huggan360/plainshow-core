<?php

namespace App\Http\Controllers;

use App\Models\DashboardLayout;
use App\Support\CoreWidgets;
use App\Support\Dashboard;
use App\Support\Permissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function show(Request $request): Response
    {
        $user = $request->user();

        return Inertia::render('Dashboard', [
            'layout' => Dashboard::layout($user),
            'catalogue' => Dashboard::catalogue($user),
        ]);
    }

    public function widget(Request $request, string $extension, string $widget): JsonResponse
    {
        $user = $request->user();
        $allowed = collect(Dashboard::catalogue($user))->firstWhere('key', $extension.'.'.$widget);
        abort_unless($allowed, 404);
        abort_unless($extension === 'core', 404); // Extension widgets arrive in pass 2.
        $data = CoreWidgets::data($widget, $user);
        abort_if($data === null, 404);

        return response()->json($data)->header('Cache-Control', 'no-store');
    }

    public function saveLayout(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'widgets' => ['present', 'array', 'max:40'],
            'widgets.*.key' => ['required', 'string', 'max:80'],
            'widgets.*.size' => ['required', 'string', 'in:s,m,l,xl,full'],
        ]);
        $allowed = collect(Dashboard::catalogue($request->user()))->keyBy('key');
        $widgets = collect($data['widgets'])
            ->filter(fn ($item) => $allowed->has($item['key']) && in_array($item['size'], $allowed[$item['key']]['sizes'], true))
            ->unique('key')
            ->values()
            ->all();
        DashboardLayout::updateOrCreate(['user_id' => $request->user()->id], ['widgets' => $widgets]);
        Permissions::forget($request->user());

        return back();
    }

    public function resetLayout(Request $request): RedirectResponse
    {
        DashboardLayout::where('user_id', $request->user()->id)->delete();

        return back()->with('status', 'Dashboard reset.');
    }
}
