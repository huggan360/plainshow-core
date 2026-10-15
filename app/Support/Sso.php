<?php

namespace App\Support;

use PlainShow\Kit\OidcClient;

class Sso
{
    public static function client(): OidcClient
    {
        return new OidcClient([
            'issuer' => (string) config('plainshow.login_url'),
            'client_id' => (string) config('plainshow.client_id'),
            'client_secret' => (string) config('plainshow.client_secret'),
            'redirect_uri' => rtrim((string) config('app.url'), '/').'/auth/callback',
            'scopes' => 'openid profile email plainshow',
            'cache_dir' => storage_path('framework/cache'),
        ]);
    }
}
