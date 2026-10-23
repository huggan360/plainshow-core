<?php

namespace App\Http\Controllers;

use App\Models\DashboardLayout;
use App\Models\Extension;
use App\Models\RoleLayout;
use App\Models\Role;
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
        $layout = Dashboard::layout($user);

        return Inertia::render('Dashboard', [
            'layout' => $layout,
            'phone' => Dashboard::phone($user, $layout)['items'],
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
            foreach (Dashboard::roles() as $role) {
                $catalogue = Dashboard::catalogueForRole($role);
                $layout = Dashboard::sanitize(Dashboard::roleLayout($role) ?? Dashboard::defaults(), $catalogue);
                $phone = Dashboard::phoneFor(Dashboard::rolePhone($role), $layout, $catalogue);
                $roles[$role] = [
                    'name' => Role::find($role)?->name ?? ucfirst($role),
                    'layout' => $layout,
                    'phone' => $phone['items'],
                    'phoneCustom' => $phone['custom'],
                    'catalogue' => $catalogue,
                    'saved' => Dashboard::roleLayout($role) !== null,
                ];
            }
        }

        $layout = Dashboard::layout($user);
        $phone = Dashboard::phone($user, $layout);

        return Inertia::render('Design', [
            'layout' => $layout,
            'phone' => $phone['items'],
            'phoneCustom' => $phone['custom'],
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
        // Lists ask for more as they are scrolled; widgets that cannot page answer their usual amount.
        $limit = $request->filled('limit') ? max(1, min(50, (int) $request->query('limit'))) : null;
        $data = match ($extension) {
            'core' => CoreWidgets::data($widget, $user, $limit, $request->only(['topic', 'edition'])),
            'cloud' => \App\Support\CloudWidgets::data($widget, $user, $limit, $request->query('from'), $request->query('days')),
            default => ExtensionWidgets::data(Extension::findOrFail($extension), $widget, $user, null, $limit),
        };
        abort_if($data === null, 404);

        return response()->json($data)->header('Cache-Control', 'no-store');
    }

    public function saveLayout(Request $request): RedirectResponse
    {
        $catalogue = Dashboard::catalogue($request->user());
        [$items, $phone] = $this->validated($request);
        DashboardLayout::updateOrCreate(['user_id' => $request->user()->id], [
            'widgets' => Dashboard::sanitize($items, $catalogue),
            'phone' => $phone === null ? null : Dashboard::sanitizePhone($phone, $catalogue),
        ]);

        return back()->with('status', __('Dashboard saved.'));
    }

    /**
     * Settings changed from the widget itself (a weather place, say). The
     * person's layout is saved with it, starting from the one they see. A
     * place goes to every weather widget that has none yet.
     */
    public function saveWidgetSettings(Request $request, string $key): JsonResponse
    {
        $settings = $request->validate(['settings' => ['required', 'array']])['settings'];
        $user = $request->user();
        $catalogue = Dashboard::catalogue($user);
        $layout = Dashboard::layout($user);
        $phone = Dashboard::phone($user, $layout);
        abort_unless(collect($layout)->contains('key', $key) || collect($phone['items'])->contains('key', $key), 404);
        $layout = array_map(function (array $item) use ($key, $settings) {
            if ($item['key'] === $key) {
                $item['settings'] = array_merge($item['settings'] ?? [], $settings);
            } elseif (isset($settings['place']) && in_array($item['key'], Dashboard::WEATHER, true) && empty($item['settings']['place'])) {
                $item['settings'] = array_merge($item['settings'] ?? [], ['place' => $settings['place']]);
            }

            return $item;
        }, $layout);
        $layout = Dashboard::sanitize($layout, $catalogue);
        // A phone layout of its own gets the same settings for the same widget.
        $own = $phone['custom'] ? Dashboard::sanitizePhone(array_map(fn (array $item) => $item['key'] === $key ? ['settings' => array_merge($item['settings'] ?? [], $settings)] + $item : $item, $phone['items']), $catalogue) : null;
        DashboardLayout::updateOrCreate(['user_id' => $user->id], ['widgets' => $layout, 'phone' => $own]);

        return response()->json(['layout' => $layout]);
    }

    public function resetLayout(Request $request): RedirectResponse
    {
        DashboardLayout::where('user_id', $request->user()->id)->delete();

        return back()->with('status', __('Dashboard reset.'));
    }

    public function saveRoleLayout(Request $request, string $role): RedirectResponse
    {
        abort_unless(in_array($role, Dashboard::roles(), true), 404);
        $catalogue = Dashboard::catalogueForRole($role);
        [$items, $phone] = $this->validated($request);
        $widgets = Dashboard::sanitize($items, $catalogue);
        RoleLayout::updateOrCreate(['role' => $role], [
            'widgets' => $widgets,
            'phone' => $phone === null ? null : Dashboard::sanitizePhone($phone, $catalogue),
            'updated_by' => $request->user()->id,
        ]);
        Audit::record('layout.role_saved', ['role' => $role, 'widgets' => count($widgets)]);

        return back()->with('status', 'Default dashboard for '.$role.'s saved.');
    }

    public function resetRoleLayout(string $role): RedirectResponse
    {
        abort_unless(in_array($role, Dashboard::roles(), true), 404);
        RoleLayout::where('role', $role)->delete();
        Audit::record('layout.role_reset', ['role' => $role]);

        return back()->with('status', 'Default dashboard for '.$role.'s reset.');
    }

    /** @return array{0: list<array>, 1: ?list<array>} the desktop layout and the phone's own (null: follow the desktop) */
    private function validated(Request $request): array
    {
        $valid = $request->validate([
            'widgets' => ['present', 'array', 'max:40'],
            'widgets.*.key' => ['required', 'string', 'max:80'],
            'widgets.*.x' => ['nullable', 'integer', 'min:0', 'max:12'],
            'widgets.*.y' => ['nullable', 'integer', 'min:0', 'max:500'],
            'widgets.*.w' => ['nullable', 'integer', 'min:1', 'max:12'],
            'widgets.*.h' => ['nullable', 'integer', 'min:1', 'max:12'],
            'widgets.*.border' => ['nullable', 'string', 'in:'.implode(',', Dashboard::BORDERS)],
            'widgets.*.settings' => ['nullable', 'array'],
            'phone' => ['nullable', 'array', 'max:40'],
            'phone.*.key' => ['required', 'string', 'max:80'],
            'phone.*.h' => ['nullable', 'integer', 'min:1', 'max:12'],
            'phone.*.border' => ['nullable', 'string', 'in:'.implode(',', Dashboard::BORDERS)],
            'phone.*.settings' => ['nullable', 'array'],
        ]);

        return [$valid['widgets'], $valid['phone'] ?? null];
    }
}
