<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** One-hour password links, redeemed on login.plainshow.se. Only a hash is stored. */
class ResetLinks
{
    public static function create(User $user): string
    {
        $token = Str::random(64);
        DB::table('login_password_reset_tokens')->updateOrInsert(
            ['username' => $user->username],
            ['token' => hash('sha256', $token), 'created_at' => now()],
        );
        Audit::record('password.reset_link', [], $user->id);

        return rtrim((string) config('plainshow.login_url'), '/').'/reset/'.$token.'?u='.rawurlencode($user->username);
    }
}
