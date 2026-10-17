<?php

namespace App\Http\Controllers;

use App\Models\Extension;
use App\Support\ApiTokens;
use App\Support\CloudAccount;
use App\Support\ExtensionWidgets;
use App\Support\Permissions;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PlainShow\Kit\Signed;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * plainshow.se/api/{service}/v1/...: one address for every service's API.
 * The bearer token is checked here (signature, revocation, account, scopes);
 * the call then goes on to the service as a request signed by core, naming
 * the person and what they may do. A service that is turned off answers 503.
 */
class GatewayController extends Controller
{
    private const FORWARD = ['accept', 'accept-language', 'content-type'];

    private const RETURN = ['content-type', 'content-disposition', 'cache-control', 'allow', 'retry-after'];

    public function forward(Request $request, string $service, string $path = ''): Response
    {
        $extension = $this->extension($service);
        $user = $request->user();
        $scopes = (array) $request->attributes->get('token_scopes', []);
        if (! Permissions::hasService($user, $service)) {
            return $this->problem(403, 'forbidden', 'You do not have access to '.$extension->name.'.');
        }
        if (! in_array($service, $scopes, true)) {
            return $this->problem(403, 'insufficient_scope', 'This token does not reach '.$extension->name.'. Make a token that includes it.');
        }
        if (in_array('read-only', $scopes, true) && ! in_array($request->method(), ['GET', 'HEAD'], true)) {
            return $this->problem(403, 'read_only', 'This token can only read.');
        }
        $secret = ExtensionWidgets::secret($service);
        if ($secret === null) {
            return $this->problem(503, 'unavailable', $extension->name.' is not connected to the gateway.');
        }

        $base = rtrim((string) $extension->manifest['api'], '/');
        $target = (string) parse_url($base, PHP_URL_PATH).'/'.ltrim($path, '/');
        $query = $request->getQueryString();
        $signedPath = $target.($query !== null && $query !== '' ? '?'.$query : '');
        $multipart = str_starts_with(strtolower((string) $request->header('content-type')), 'multipart/form-data');
        $raw = $multipart ? '' : $request->getContent();

        $permissions = Permissions::for($user);
        $context = [
            'preferred_username' => $user->username,
            'given_name' => $user->first_name,
            'family_name' => $user->last_name,
            'name' => $user->name(),
            'email' => $user->email,
            'picture' => $user->avatarUrl() ? url($user->avatarUrl()) : null,
            'ps_role' => $user->role,
            'ps_services' => $permissions['services'],
            'ps_caps' => $permissions['capabilities'],
            'ps_pi_user' => $user->pi_username,
            // Cloud acts as the Nextcloud user the person is linked to.
            'ps_cloud_uid' => $service === 'cloud' ? CloudAccount::for($user) : null,
            'scopes' => $scopes,
        ];
        $headers = Signed::headers($request->method(), $signedPath, $raw, $user->id, $context, $secret);
        foreach (self::FORWARD as $name) {
            if (! $multipart && $request->hasHeader($name)) {
                $headers[$name] = (string) $request->header($name);
            }
        }
        $headers['Accept'] ??= 'application/json';

        $host = (string) parse_url($base, PHP_URL_HOST);
        $pending = Http::timeout(60)->connectTimeout(5)->withHeaders($headers)
            ->withOptions(['allow_redirects' => false, 'http_errors' => false, 'curl' => [CURLOPT_RESOLVE => ["$host:443:127.0.0.1"]]]);
        if ($multipart) {
            $pending = $pending->asMultipart();
            foreach ($this->files($request->allFiles()) as [$name, $file]) {
                $pending = $pending->attach($name, fopen($file->getRealPath(), 'r'), $file->getClientOriginalName(), ['Content-Type' => $file->getClientMimeType()]);
            }
            $options = ['multipart' => $this->fields($request->post())];
        } elseif ($raw !== '') {
            $pending = $pending->withBody($raw, (string) ($request->header('content-type') ?: 'application/json'));
        }

        try {
            $url = "https://$host$signedPath";
            $response = $multipart
                ? $pending->send($request->method(), $url, $options)
                : $pending->send($request->method(), $url);
        } catch (Throwable) {
            return $this->problem(502, 'bad_gateway', $extension->name.' did not answer.');
        }

        $out = response($response->body(), $response->status());
        foreach (self::RETURN as $name) {
            if ($response->header($name) !== '') {
                $out->headers->set($name, $response->header($name));
            }
        }
        $out->headers->set('X-PlainShow-Service', $service);

        return $out;
    }

    /** Each service's OpenAPI description, public and cached. */
    public function openapi(string $service): Response
    {
        $spec = self::spec($service);

        return $spec === null
            ? $this->problem(404, 'not_found', 'No API description for that service.')
            : response()->json($spec)->header('Cache-Control', 'public, max-age=300');
    }

    public static function spec(string $service): ?array
    {
        if ($service === 'core') {
            return json_decode((string) file_get_contents(resource_path('openapi/core.json')), true);
        }
        $extension = Extension::where('enabled', true)->find($service);
        $base = $extension ? rtrim((string) ($extension->manifest['api'] ?? ''), '/') : '';
        if ($base === '') {
            return null;
        }

        return Cache::remember("openapi:$service", 600, function () use ($base) {
            $host = (string) parse_url($base, PHP_URL_HOST);
            try {
                $response = Http::timeout(8)->acceptJson()->withOptions(['curl' => [CURLOPT_RESOLVE => ["$host:443:127.0.0.1"]]])->get("$base/openapi.json");

                return $response->ok() && is_array($response->json('paths')) ? $response->json() : null;
            } catch (Throwable) {
                return null;
            }
        });
    }

    private function extension(string $service): Extension
    {
        $extension = Extension::find($service);
        if (! $extension || $service === 'core' || empty($extension->manifest['api'])) {
            abort($this->problem(404, 'not_found', 'There is no API for that service.'));
        }
        if (! $extension->enabled) {
            abort($this->problem(503, 'unavailable', $extension->name.' is turned off.'));
        }

        return $extension;
    }

    /** @return list<array{0: string, 1: UploadedFile}> */
    private function files(array $files, string $prefix = ''): array
    {
        $flat = [];
        foreach ($files as $key => $value) {
            $name = $prefix === '' ? (string) $key : $prefix.'['.$key.']';
            if ($value instanceof UploadedFile) {
                $flat[] = [$name, $value];
            } elseif (is_array($value)) {
                $flat = [...$flat, ...$this->files($value, $name)];
            }
        }

        return $flat;
    }

    private function fields(array $fields, string $prefix = ''): array
    {
        $flat = [];
        foreach ($fields as $key => $value) {
            $name = $prefix === '' ? (string) $key : $prefix.'['.$key.']';
            if (is_array($value)) {
                $flat = [...$flat, ...$this->fields($value, $name)];
            } else {
                $flat[] = ['name' => $name, 'contents' => (string) $value];
            }
        }

        return $flat;
    }

    private function problem(int $status, string $error, string $message): Response
    {
        return response()->json(['error' => $error, 'message' => $message], $status);
    }
}
