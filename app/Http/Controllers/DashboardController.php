<?php

namespace App\Http\Controllers;

use App\Models\DashboardLayout;
use App\Models\Extension;
use App\Models\RoleLayout;
use App\Support\Audit;
use App\Support\CoreWidgets;
use App\Support\Dashboard;
use App\Support\ExtensionWidgets;
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
            'customised' => $user->dashboard !== null,
        ]);
    }

    /** The Design studio: arrange widgets, and for admins each role's default. */
    public function studio(Request $request): Response
    {
        $user = $request->user();
        $roles = null;
        if (Permissions::can($user, 'core.permissions.manage')) {
            $roles = [];
            foreach (Dashboard::ROLES as $role) {
                $catalogue = Dashboard::catalogueForRole($role);
                $roles[$role] = [
                    'layout' => Dashboard::sanitize(Dashboard::roleLayout($role) ?? Dashboard::defaults(), $catalogue),
                    'catalogue' => $catalogue,
                    'saved' => Dashboard::roleLayout($role) !== null,
                ];
            }
        }

        return Inertia::render('Design', [
            'layout' => Dashboard::layout($user),
            'catalogue' => Dashboard::catalogue($user),
            'customised' => $user->dashboard !== null,
            'roles' => $roles,
        ]);
    }

    public function widget(Request $request, string $extension, string $widget): JsonResponse
    {
        $user = $request->user();
        $allowed = collect(Dashboard::catalogue($user))->firstWhere('key', $extension.'.'.$widget);
        abort_unless($allowed, 404);
        $data = match ($extension) {
            'core' => CoreWidgets::data($widget, $user),
            'cloud' => \App\Support\NextcloudWidgets::data($widget, $user),
            default => ExtensionWidgets::data(Extension::findOrFail($extension), $widget, $user),
        };
        abort_if($data === null, 404);

        return response()->json($data)->header('Cache-Control', 'no-store');
    }

    public function saveLayout(Request $request): RedirectResponse
    {
        $widgets = Dashboard::sanitize($this->validated($request), Dashboard::catalogue($request->user()));
        DashboardLayout::updateOrCreate(['user_id' => $request->user()->id], ['widgets' => $widgets]);

        return back()->with('status', 'Dashboard saved.');
    }

    public function resetLayout(Request $request): RedirectResponse
    {
        DashboardLayout::where('user_id', $request->user()->id)->delete();

        return back()->with('status', 'Dashboard reset.');
    }

    public function saveRoleLayout(Request $request, string $role): RedirectResponse
    {
        abort_unless(in_array($role, Dashboard::ROLES, true), 404);
        $widgets = Dashboard::sanitize($this->validated($request), Dashboard::catalogueForRole($role));
        RoleLayout::updateOrCreate(['role' => $role], ['widgets' => $widgets, 'updated_by' => $request->user()->id]);
        Audit::record('layout.role_saved', ['role' => $role, 'widgets' => count($widgets)]);

        return back()->with('status', 'Default dashboard for '.$role.'s saved.');
    }

    public function resetRoleLayout(string $role): RedirectResponse
    {
        abort_unless(in_array($role, Dashboard::ROLES, true), 404);
        RoleLayout::where('role', $role)->delete();
        Audit::record('layout.role_reset', ['role' => $role]);

        return back()->with('status', 'Default dashboard for '.$role.'s reset.');
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'widgets' => ['present', 'array', 'max:40'],
            'widgets.*.key' => ['required', 'string', 'max:80'],
            'widgets.*.size' => ['required', 'string', 'in:'.implode(',', Dashboard::SIZES)],
            'widgets.*.title' => ['nullable', 'string', 'max:60'],
            'widgets.*.glow' => ['nullable', 'string', 'in:'.implode(',', Dashboard::GLOWS)],
            'widgets.*.settings' => ['nullable', 'array'],
        ])['widgets'];
    }
}
