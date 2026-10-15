<?php

declare(strict_types=1);

/*
 * Core end to end, against running login and core servers:
 *   php tests/e2e/sso.php http://127.0.0.1:8098 http://127.0.0.1:8099 CLIENT_ID
 * Core must be started with PLAINSHOW_LOGIN_URL, PLAINSHOW_CLIENT_ID and
 * PLAINSHOW_CLIENT_SECRET pointing at that login server. Creates two
 * disposable accounts (admin and member) and removes them afterwards.
 */

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

[$_, $loginBase, $coreBase] = $argv + [null, 'http://127.0.0.1:8098', 'http://127.0.0.1:8099'];
$checks = 0;
function check(bool $condition, string $message): void
{
    global $checks;
    $checks++;
    echo ($condition ? 'ok   ' : 'FAIL ').$message."\n";
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

final class Browser
{
    private string $jar;
    public function __construct() { $this->jar = tempnam(sys_get_temp_dir(), 'core-jar'); }
    public function __destruct() { @unlink($this->jar); }

    public function go(string $method, string $url, ?array $form = null, array $headers = []): array
    {
        $handle = curl_init($url);
        curl_setopt_array($handle, [
            CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true,
            CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        if ($form !== null) {
            curl_setopt($handle, CURLOPT_POSTFIELDS, http_build_query($form));
        }
        $raw = (string) curl_exec($handle);
        $size = curl_getinfo($handle, CURLINFO_HEADER_SIZE);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        curl_close($handle);
        preg_match('/^location:\s*(.+)$/mi', substr($raw, 0, $size), $match);

        return ['status' => $status, 'location' => isset($match[1]) ? trim($match[1]) : null, 'body' => substr($raw, $size)];
    }

    /** Follows redirects, filling in the login form when it appears. */
    public function signIn(string $start, string $username, string $password, string $loginBase): array
    {
        $response = $this->go('GET', $start);
        for ($i = 0; $i < 10 && $response['location']; $i++) {
            $next = $response['location'];
            if (str_ends_with(parse_url($next, PHP_URL_PATH) ?? '', '/login') && str_starts_with($next, $loginBase)) {
                $page = $this->go('GET', $next);
                preg_match('/name="_token" value="([^"]+)"/', $page['body'], $token);
                $response = $this->go('POST', $loginBase.'/login', ['_token' => $token[1] ?? '', 'login' => $username, 'password' => $password]);
                continue;
            }
            $response = $this->go('GET', $next);
        }

        return $response;
    }

    public function inertia(string $url): array
    {
        $response = $this->go('GET', $url);
        preg_match('/<script data-page="app" type="application\/json">(.+?)<\/script>/s', $response['body'], $match)
            || preg_match('/data-page="([^"]+)"/', $response['body'], $match);
        $page = isset($match[1]) ? json_decode(html_entity_decode($match[1]), true) : null;

        return ['status' => $response['status'], 'page' => $page, 'location' => $response['location']];
    }
}

$password = Str::random(20);
$make = function (string $role) use ($password): User {
    $user = new User;
    $user->forceFill(['username' => 'e2e_'.$role.'_'.Str::lower(Str::random(4)), 'first_name' => 'Test', 'last_name' => ucfirst($role), 'password' => Hash::make($password), 'role' => $role, 'status' => 'active'])->save();

    return $user;
};
$admin = $make('admin');
$member = $make('member');

try {
    $browser = new Browser;
    $final = $browser->signIn($coreBase.'/', $admin->username, $password, $loginBase);
    check($final['status'] === 200, 'Admin signs in to core through login.plainshow.se');

    $home = $browser->inertia($coreBase.'/');
    check(($home['page']['component'] ?? null) === 'Dashboard', 'Dashboard renders');
    check(($home['page']['props']['auth']['user']['username'] ?? null) === $admin->username, 'Shared props carry the signed-in user');
    $keys = array_column($home['page']['props']['layout'] ?? [], 'key');
    check(in_array('core.admin-services', $keys, true) && in_array('core.pi-health', $keys, true), 'Admin gets admin widgets by default');

    foreach ($keys as $key) {
        [$extension, $widget] = explode('.', $key, 2);
        $data = $browser->go('GET', "$coreBase/widgets/$extension/$widget", null, ['Accept: application/json']);
        check($data['status'] === 200 && is_array(json_decode($data['body'], true)), "Widget $key returns data");
    }

    foreach (['/account', '/account/security', '/account/connections', '/admin/users', '/admin/services', '/admin/audit', '/design'] as $path) {
        $page = $browser->inertia($coreBase.$path);
        check($page['status'] === 200 && isset($page['page']['component']), "Admin can open $path");
    }

    $memberBrowser = new Browser;
    $memberBrowser->signIn($coreBase.'/', $member->username, $password, $loginBase);
    $memberHome = $memberBrowser->inertia($coreBase.'/');
    $memberKeys = array_column($memberHome['page']['props']['layout'] ?? [], 'key');
    check(! in_array('core.admin-services', $memberKeys, true), 'Member gets no admin widgets');
    check($memberBrowser->go('GET', $coreBase.'/widgets/core/admin-users', null, ['Accept: application/json'])['status'] === 404, 'Member cannot read admin widget data');
    check($memberBrowser->inertia($coreBase.'/admin/users')['status'] === 403, 'Member is refused the accounts page');

    // API with a real access token from login.
    $token = DB::table('oauth_access_tokens')->where('user_id', $member->id)->orderByDesc('created_at')->first();
    check($token !== null, 'Sign-in issued an access token');

    // Disable the member: their next request is signed out.
    $member->forceFill(['status' => 'disabled'])->save();
    $after = $memberBrowser->go('GET', $coreBase.'/');
    check($after['status'] === 302 && str_contains((string) $after['location'], '/auth/login'), 'A disabled account is signed out on its next request');

    $logout = $browser->go('GET', $coreBase.'/auth/logout');
    check($logout['status'] === 302 && str_starts_with((string) $logout['location'], $loginBase.'/logout'), 'Sign out goes through login to end every session');
    check($browser->go('GET', $coreBase.'/')['status'] === 302, 'Core session is gone after signing out');
} finally {
    foreach ([$admin, $member] as $user) {
        DB::table('oauth_access_tokens')->where('user_id', $user->id)->delete();
        DB::table('oauth_auth_codes')->where('user_id', $user->id)->delete();
        DB::table('core_sessions')->where('user_id', $user->id)->delete();
        DB::table('login_sessions')->where('user_id', $user->id)->delete();
        DB::table('audit_events')->where('user_id', $user->id)->delete();
        DB::table('core_dashboard_layouts')->where('user_id', $user->id)->delete();
        $user->delete();
    }
}

echo "Core end-to-end checks passed: $checks\n";
