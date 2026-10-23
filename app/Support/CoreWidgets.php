<?php

namespace App\Support;

use App\Models\AuditEvent;
use App\Models\Extension;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Throwable;

/** Data for core's own widgets. Each method returns a JSON-ready array. */
class CoreWidgets
{
    public static function data(string $widget, User $user, ?int $limit = null): ?array
    {
        $limit ??= 12;

        return match ($widget) {
            'greeting' => self::greeting($user),
            'pi-health' => ['system' => SystemStats::snapshot(), 'detailed' => Permissions::can($user, 'core.system.view')],
            'launcher' => ['apps' => self::apps($user)],
            'news' => ['stories' => News::stories($user, 'top', '', $limit)],
            'activity' => ['events' => self::events(AuditEvent::where('user_id', $user->id), $limit)],
            'admin-users' => self::users($limit),
            'admin-services' => ['services' => self::services()],
            'admin-security' => self::security($limit),
            'admin-updates' => self::updates(),
            default => null,
        };
    }

    private static function greeting(User $user): array
    {
        return [
            'firstName' => $user->first_name ?: $user->username,
            'role' => $user->role,
            'services' => count(Permissions::for($user)['services']),
        ];
    }

    private static function apps(User $user): array
    {
        $services = Permissions::for($user)['services'];

        return Extension::where('enabled', true)->where('id', '!=', 'core')->orderBy('sort')->get()
            ->filter(fn (Extension $extension) => in_array($extension->id, $services, true))
            ->map(fn (Extension $extension) => $extension->only(['id', 'name', 'description', 'icon', 'url']))
            ->values()->all();
    }

    private static function events($query, int $limit = 12): array
    {
        return $query->orderByDesc('id')->limit($limit)->get()->map(fn (AuditEvent $event) => [
            'id' => $event->id,
            'event' => $event->event,
            'label' => AuditLabels::label($event->event),
            'actor' => $event->actor,
            'source' => $event->source,
            'at' => $event->created_at?->toIso8601String(),
        ])->all();
    }

    private static function users(int $limit = 12): array
    {
        $byRole = User::query()->select('role', DB::raw('COUNT(*) as total'))->groupBy('role')->pluck('total', 'role');

        return [
            'total' => (int) $byRole->sum(),
            'byRole' => $byRole,
            'disabled' => User::where('status', '!=', 'active')->count(),
            'withoutTwoFactor' => User::whereNull('two_factor_confirmed_at')->whereIn('role', ['admin', 'moderator'])->count(),
            'recent' => User::whereNotNull('last_login_at')->orderByDesc('last_login_at')->limit($limit)->get()
                ->map(fn (User $user) => $user->summary() + ['lastLogin' => $user->last_login_at?->toIso8601String()])->all(),
        ];
    }

    /** Each enabled service's health endpoint, checked at most once a minute. */
    public static function services(): array
    {
        return Cache::remember('core.service-health', 60, function () {
            return Extension::where('enabled', true)->orderBy('sort')->get()->map(function (Extension $extension) {
                $url = $extension->manifest['health'] ?? ($extension->url ? rtrim($extension->url, '/').'/' : null);
                $state = 'unknown';
                $ms = null;
                if ($extension->id === 'core') {
                    $state = 'online';
                } elseif ($url) {
                    $start = microtime(true);
                    try {
                        // Every service runs on this machine: ask it directly, over checked TLS,
                        // rather than out through Cloudflare and back.
                        $host = (string) parse_url($url, PHP_URL_HOST);
                        $response = Http::timeout(6)->connectTimeout(3)->withOptions(['allow_redirects' => false, 'curl' => [CURLOPT_RESOLVE => ["$host:443:127.0.0.1"]]])->get($url);
                        $state = $response->status() < 500 ? 'online' : 'error';
                    } catch (Throwable) {
                        $state = 'offline';
                    }
                    $ms = (int) round((microtime(true) - $start) * 1000);
                }

                return $extension->only(['id', 'name', 'icon', 'version']) + ['state' => $state, 'ms' => $ms];
            })->all();
        });
    }

    private static function security(int $limit = 12): array
    {
        $since = now()->subDay();

        return [
            'failed' => AuditEvent::where('source', 'login')->whereIn('event', ['login.failed', 'two_factor.failed'])->where('created_at', '>=', $since)->count(),
            'locked' => AuditEvent::where('event', 'login.locked')->where('created_at', '>=', $since)->count(),
            'signIns' => AuditEvent::where('event', 'login.success')->where('created_at', '>=', $since)->count(),
            'events' => self::events(AuditEvent::where('source', 'login'), $limit),
        ];
    }

    private static function updates(): array
    {
        $rows = DB::table('core_components')->orderBy('name')->get();

        return [
            'checkedAt' => $rows->max('checked_at') ? \Illuminate\Support\Carbon::parse($rows->max('checked_at'))->toIso8601String() : null,
            'available' => $rows->where('update_available', true)->map(fn ($row) => ['id' => $row->id, 'name' => $row->name, 'installed' => $row->installed, 'latest' => $row->latest])->values(),
            'failed' => DB::table('core_update_jobs')->where('status', 'failed')->where('created_at', '>', now()->subDays(7))->count(),
        ];
    }
}
