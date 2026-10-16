<?php

namespace App\Support;

use App\Models\Extension;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PlainShow\Kit\Widgets;
use Throwable;

/**
 * Widgets that live in an extension. Core asks the extension's API for the
 * data with a signed request naming the person (PlainShow\Kit\Widgets), so
 * it works before they have opened the app. The answer is typed JSON that
 * the dashboard draws: list, metrics or gallery.
 */
class ExtensionWidgets
{
    private const TYPES = ['list', 'metrics', 'gallery'];

    public static function data(Extension $extension, string $widget, User $user): ?array
    {
        $secret = self::secret($extension->id);
        $api = rtrim((string) ($extension->manifest['api'] ?? ''), '/');
        if ($secret === null || $api === '') {
            return ['type' => 'list', 'items' => [], 'empty' => $extension->name.' is not connected to the dashboard yet.'];
        }

        // Answers are cached briefly; failures are not, so a slow moment does not stick.
        $cacheKey = "widget:{$extension->id}:{$widget}:{$user->id}";
        if (is_array($cached = Cache::get($cacheKey))) {
            return $cached;
        }
        $data = (function () use ($extension, $widget, $user, $secret, $api) {
            try {
                $host = (string) parse_url($api, PHP_URL_HOST);
                $response = Http::timeout(8)->connectTimeout(3)->retry(2, 200, throw: false)->acceptJson()
                    // Every extension runs on this machine: go straight there, still over checked TLS.
                    ->withOptions(['curl' => [CURLOPT_RESOLVE => ["$host:443:127.0.0.1"]]])
                    ->get("$api/widgets/$widget", Widgets::sign($user->id, $widget, $secret));
                $data = $response->json();
                if (! $response->ok() || ! is_array($data) || ! in_array($data['type'] ?? null, self::TYPES, true)) {
                    return ['type' => 'list', 'items' => [], 'empty' => 'Could not reach '.$extension->name.'.', 'error' => true];
                }

                return self::clean($data);
            } catch (Throwable) {
                return ['type' => 'list', 'items' => [], 'empty' => 'Could not reach '.$extension->name.'.', 'error' => true];
            }
        })();
        if (empty($data['error'])) {
            Cache::put($cacheKey, $data, 30);
        }

        return $data;
    }

    /** Keeps only known fields and safe links, so an extension cannot inject anything odd. */
    private static function clean(array $data): array
    {
        $url = fn ($value) => is_string($value) && preg_match('~^https://([a-z0-9-]+\.)*plainshow\.se(/|$)~i', $value) ? $value : null;
        $text = fn ($value, $max = 200) => is_scalar($value) ? mb_substr((string) $value, 0, $max) : null;
        $item = fn ($row) => is_array($row) ? array_filter([
            'title' => $text($row['title'] ?? null),
            'meta' => $text($row['meta'] ?? null),
            'url' => $url($row['url'] ?? null),
            'icon' => is_string($row['icon'] ?? null) && preg_match('/^bxs?-[a-z0-9-]+$/', $row['icon']) ? $row['icon'] : null,
            'image' => $url($row['image'] ?? null),
            'avatar' => $url($row['avatar'] ?? null),
            'initials' => $text($row['initials'] ?? null, 3),
            'badge' => $text($row['badge'] ?? null, 30),
            'tone' => in_array($row['tone'] ?? null, ['plus', 'minus', 'accent'], true) ? $row['tone'] : null,
        ], fn ($value) => $value !== null) : null;

        return array_filter([
            'type' => $data['type'],
            'items' => array_values(array_filter(array_map($item, array_slice((array) ($data['items'] ?? []), 0, 12)))),
            'metrics' => array_values(array_filter(array_map(fn ($m) => is_array($m) ? array_filter([
                'label' => $text($m['label'] ?? null, 40),
                'value' => $text($m['value'] ?? null, 40),
                'tone' => in_array($m['tone'] ?? null, ['plus', 'minus', 'accent'], true) ? $m['tone'] : null,
            ], fn ($value) => $value !== null) : null, array_slice((array) ($data['metrics'] ?? []), 0, 4)))),
            'images' => array_values(array_filter(array_map(fn ($i) => is_array($i) && $url($i['src'] ?? null) ? array_filter([
                'src' => $url($i['src']), 'url' => $url($i['url'] ?? null), 'alt' => $text($i['alt'] ?? null),
            ]) : null, array_slice((array) ($data['images'] ?? []), 0, 12)))),
            'more' => is_array($data['more'] ?? null) && $url($data['more']['url'] ?? null) ? ['label' => $text($data['more']['label'] ?? 'Open', 40), 'url' => $url($data['more']['url'])] : null,
            'empty' => $text($data['empty'] ?? null),
        ], fn ($value) => $value !== null && $value !== []);
    }

    /** The secret core shares with an extension, for widgets and the API gateway. */
    public static function secret(string $extension): ?string
    {
        static $secrets = null;
        $secrets ??= is_file($file = storage_path('app/widget-secrets.json')) ? (json_decode((string) file_get_contents($file), true) ?: []) : [];

        return isset($secrets[$extension]) && is_string($secrets[$extension]) ? $secrets[$extension] : null;
    }
}
