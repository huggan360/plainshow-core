<?php

namespace App\Support;

use App\Models\Extension;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PlainShow\Kit\Platform;
use PlainShow\Kit\Widgets;
use Throwable;

/**
 * Cloud's widgets. Calendar and recent files have their own layouts here,
 * so Cloud answers them in that shape; photos is an ordinary gallery. Every
 * request is signed for the person and names their Cloud account, so there
 * is nothing to connect first.
 */
class CloudWidgets
{
    /**
     * $from and $days pick the calendar's range (a month view starts before
     * today); $limit how many events or files to send.
     */
    public static function data(string $widget, User $user, ?int $limit = null, mixed $from = null, mixed $days = null): ?array
    {
        $extension = Extension::find('cloud');
        if ($extension === null || ! in_array($widget, ['calendar', 'files', 'photos'], true)) {
            return null;
        }
        // Cloud answers "connected: false" when no such account exists there.
        $account = CloudAccount::for($user);
        if ($widget === 'photos') {
            return ExtensionWidgets::data($extension, $widget, $user, $account, $limit);
        }
        $query = array_filter([
            'limit' => $limit,
            'from' => is_string($from) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) ? $from : null,
            'days' => is_numeric($days) ? max(1, min(62, (int) $days)) : null,
        ]);

        $key = "cloud:$widget:{$user->id}:".app()->getLocale().':'.http_build_query($query);
        if (is_array($cached = Cache::get($key))) {
            return $cached;
        }
        $secret = ExtensionWidgets::secret('cloud');
        $api = rtrim((string) ($extension->manifest['api'] ?? ''), '/');
        if ($secret === null || $api === '') {
            return ['connected' => true, 'error' => __('Cloud is not connected to the dashboard yet.')];
        }
        try {
            $host = (string) parse_url($api, PHP_URL_HOST);
            $response = Http::timeout(10)->connectTimeout(3)->acceptJson()->withHeaders(['Accept-Language' => app()->getLocale()])
                ->withOptions(['curl' => [CURLOPT_RESOLVE => ["$host:443:127.0.0.1"]]])
                ->get("$api/widgets/$widget", Widgets::sign($user->id, $widget, $secret, null, $account) + $query);
            $data = $response->json();
            if (! $response->ok() || ! is_array($data) || ! array_key_exists('connected', $data)) {
                return ['connected' => true, 'error' => 'Could not reach Cloud.'];
            }
            $data = self::clean($widget, $data);
            Cache::put($key, $data, 90);

            return $data;
        } catch (Throwable $error) {
            report($error);

            return ['connected' => true, 'error' => 'Could not reach Cloud.'];
        }
    }

    /** Only known fields and Cloud's own links go to the browser. */
    private static function clean(string $widget, array $data): array
    {
        $text = fn ($value, $max = 200) => is_scalar($value) ? mb_substr((string) $value, 0, $max) : '';
        $url = fn ($value) => is_string($value) && preg_match('~^https://([a-z0-9-]+\.)*plainshow\.se(/|$)~i', $value) ? $value : null;
        if (! empty($data['error']) || ! $data['connected']) {
            return ['connected' => (bool) $data['connected'], 'error' => $data['error'] ?? null];
        }
        if ($widget === 'calendar') {
            return ['connected' => true, 'events' => array_map(fn ($event) => [
                'title' => $text($event['title'] ?? 'Busy', 120),
                'place' => $text($event['place'] ?? '', 120),
                'start' => $text($event['start'] ?? '', 40),
                'end' => $text($event['end'] ?? '', 40),
                'allDay' => (bool) ($event['allDay'] ?? false),
                'calendar' => $text($event['calendar'] ?? '', 80),
                'color' => is_string($event['color'] ?? null) && preg_match('/^#[0-9a-f]{6}$/i', $event['color']) ? $event['color'] : null,
            ], array_slice(array_filter((array) ($data['events'] ?? []), 'is_array'), 0, 200))];
        }

        return ['connected' => true, 'files' => array_map(fn ($file) => [
            'name' => $text($file['name'] ?? '', 200),
            'folder' => isset($file['folder']) ? $text($file['folder'], 200) : null,
            'type' => $text($file['type'] ?? '', 80),
            'changed' => isset($file['changed']) ? $text($file['changed'], 40) : null,
            'url' => $url($file['url'] ?? null) ?? Platform::require('cloud').'/',
        ], array_slice(array_filter((array) ($data['files'] ?? []), 'is_array'), 0, 50))];
    }
}
