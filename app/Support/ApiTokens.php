<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\Http;
use PlainShow\Kit\Signed;
use RuntimeException;

/** Personal API tokens. Login makes and revokes them; core asks over signed requests. */
class ApiTokens
{
    public const SERVICES = ['core', 'blog', 'split', 'latex'];

    /** Scopes that mark a personal token; such tokens only reach the services they name. */
    public const SCOPES = [...self::SERVICES, 'read-only'];

    public static function list(User $user): array
    {
        return (array) (self::call('GET', '/internal/tokens', $user)['tokens'] ?? []);
    }

    /** @return array{token: string, id: string, expiresAt: ?string} */
    public static function create(User $user, string $name, array $scopes): array
    {
        return self::call('POST', '/internal/tokens', $user, ['name' => $name, 'scopes' => array_values($scopes)]);
    }

    public static function revoke(User $user, string $id): void
    {
        self::call('DELETE', '/internal/tokens/'.$id, $user);
    }

    /** Whether a token is a personal one, judged by its scopes. */
    public static function isPersonal(array $scopes): bool
    {
        return (bool) array_intersect($scopes, self::SCOPES);
    }

    private static function call(string $method, string $path, User $user, ?array $body = null): array
    {
        $base = rtrim((string) config('plainshow.login_url'), '/');
        $raw = $body === null ? '' : json_encode($body, JSON_UNESCAPED_SLASHES);
        $headers = Signed::headers($method, $path, $raw, $user->id, [], (string) config('plainshow.internal_secret'));
        $host = (string) parse_url($base, PHP_URL_HOST);
        $request = Http::timeout(15)->acceptJson()->withHeaders($headers)
            ->withOptions(['curl' => [CURLOPT_RESOLVE => ["$host:443:127.0.0.1"]]]);
        if ($raw !== '') {
            $request = $request->withBody($raw, 'application/json');
        }
        $response = $request->send($method, $base.$path);
        if (! $response->successful()) {
            throw new RuntimeException((string) ($response->json('message') ?? 'Login did not answer.'));
        }

        return (array) $response->json();
    }
}
