<?php

namespace App\Support;

use App\Models\Extension;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use PlainShow\Kit\Signed;
use RuntimeException;
use Throwable;

/**
 * Core calling a service's API itself, as a person: signed like the gateway's
 * calls (kit Signed), naming the person and what they may do. The assistant
 * uses it to act in Cloud and to read LaTeX.
 */
class ServiceCall
{
    /** @return array<string, mixed> the decoded answer; throws when the service says no */
    public static function as(User $user, string $service, string $method, string $path, ?array $body = null, int $timeout = 20): array
    {
        if (! Permissions::hasService($user, $service)) {
            throw new RuntimeException(__('You do not have access to :name.', ['name' => ucfirst($service)]));
        }
        $extension = Extension::find($service);
        $secret = ExtensionWidgets::secret($service);
        if (! $extension || ! $extension->enabled || $secret === null || empty($extension->manifest['api'])) {
            throw new RuntimeException(__(':name is not available right now.', ['name' => $extension->name ?? ucfirst($service)]));
        }

        $base = rtrim((string) $extension->manifest['api'], '/');
        $signedPath = (string) parse_url($base, PHP_URL_PATH).'/'.ltrim($path, '/');
        $raw = $body === null ? '' : (string) json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $permissions = Permissions::for($user);
        $context = [
            'preferred_username' => $user->username,
            'given_name' => $user->first_name,
            'family_name' => $user->last_name,
            'name' => $user->name(),
            'email' => $user->email,
            'ps_role' => $user->role,
            'ps_services' => $permissions['services'],
            'ps_caps' => $permissions['capabilities'],
            'ps_cloud_uid' => $service === 'cloud' ? CloudAccount::for($user) : null,
            'scopes' => [$service],
        ];
        $headers = Signed::headers($method, $signedPath, $raw, $user->id, $context, $secret) + ['Accept' => 'application/json'];
        $host = (string) parse_url($base, PHP_URL_HOST);
        $pending = Http::timeout($timeout)->connectTimeout(4)->withHeaders($headers)
            ->withOptions(['allow_redirects' => false, 'http_errors' => false, 'curl' => [CURLOPT_RESOLVE => ["$host:443:127.0.0.1"]]]);
        if ($raw !== '') {
            $pending = $pending->withBody($raw, 'application/json');
        }
        try {
            $response = $pending->send($method, "https://$host$signedPath");
        } catch (Throwable) {
            throw new RuntimeException(__(':name did not answer.', ['name' => $extension->name]));
        }
        $data = $response->json();
        if (! $response->successful() || ! is_array($data) || ($data['ok'] ?? true) === false) {
            throw new RuntimeException(is_array($data) && is_string($data['message'] ?? null) ? $data['message'] : __(':name did not answer.', ['name' => $extension->name]));
        }

        return $data;
    }
}
