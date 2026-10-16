<?php

namespace App\Support;

use App\Models\Extension;
use App\Models\User;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/** Talking to Nextcloud as a person, with the app password they granted core. */
class Nextcloud
{
    public static function base(): string
    {
        return rtrim((string) (Extension::find('cloud')?->url ?: 'https://cloud.plainshow.se'), '/');
    }

    /** A request to Nextcloud on this machine, over checked TLS. */
    public static function http(): PendingRequest
    {
        $host = (string) parse_url(self::base(), PHP_URL_HOST);

        return Http::timeout(12)->connectTimeout(4)->withUserAgent('PlainShow dashboard')
            ->withOptions(['curl' => [CURLOPT_RESOLVE => ["$host:443:127.0.0.1"]]]);
    }

    /** @return array{user: string, login: string, password: string}|null */
    public static function link(User $user): ?array
    {
        $row = DB::table('core_nextcloud_links')->where('user_id', $user->id)->first();
        if (! $row) {
            return null;
        }
        try {
            return ['user' => $row->nextcloud_user, 'login' => $row->login_name, 'password' => Crypt::decryptString($row->app_password)];
        } catch (\Throwable) {
            return null;
        }
    }

    public static function as(array $link): PendingRequest
    {
        return self::http()->withBasicAuth($link['login'], $link['password']);
    }

    /** Starts Login Flow v2: returns the page to approve in and the poll details. */
    public static function startFlow(): array
    {
        $response = self::http()->post(self::base().'/index.php/login/v2');
        $data = $response->json();
        if (! $response->ok() || ! isset($data['login'], $data['poll']['token'], $data['poll']['endpoint'])) {
            throw new RuntimeException('Nextcloud did not start the connection.');
        }
        foreach ([$data['login'], $data['poll']['endpoint']] as $url) {
            if (parse_url((string) $url, PHP_URL_HOST) !== parse_url(self::base(), PHP_URL_HOST)) {
                throw new RuntimeException('Nextcloud answered with an unexpected address.');
            }
        }

        return ['login' => (string) $data['login'], 'token' => (string) $data['poll']['token'], 'endpoint' => (string) $data['poll']['endpoint']];
    }

    /** Polls the flow once. Returns true when the person approved and the link is stored. */
    public static function pollFlow(User $user, array $flow): bool
    {
        $response = self::http()->asForm()->post($flow['endpoint'], ['token' => $flow['token']]);
        if ($response->status() === 404) {
            return false;
        }
        $login = (string) $response->json('loginName');
        $password = (string) $response->json('appPassword');
        if (! $response->ok() || $login === '' || $password === '') {
            throw new RuntimeException('Nextcloud did not finish the connection.');
        }
        $link = ['login' => $login, 'password' => $password];
        $id = (string) (self::as($link)->withHeaders(['OCS-APIRequest' => 'true'])->acceptJson()->get(self::base().'/ocs/v2.php/cloud/user')->json('ocs.data.id') ?: $login);
        DB::table('core_nextcloud_links')->updateOrInsert(['user_id' => $user->id], [
            'nextcloud_user' => $id, 'login_name' => $login, 'app_password' => Crypt::encryptString($password),
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return true;
    }

    public static function disconnect(User $user): void
    {
        if ($link = self::link($user)) {
            try {
                self::as($link)->withHeaders(['OCS-APIRequest' => 'true'])->delete(self::base().'/ocs/v2.php/core/apppassword');
            } catch (\Throwable) {
                // Gone already; forgetting it here is what matters.
            }
        }
        DB::table('core_nextcloud_links')->where('user_id', $user->id)->delete();
    }
}
