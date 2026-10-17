<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * A person's account in Cloud: the Nextcloud user their PlainShow account is
 * linked to, otherwise one named after their username. The same rule as the
 * ps_cloud_uid claim login gives Cloud at sign-in.
 */
class CloudAccount
{
    public static function for(User $user): string
    {
        $account = DB::table('core_linked_accounts')->where(['user_id' => $user->id, 'provider' => 'nextcloud'])->value('external_id');

        return is_string($account) && $account !== '' ? $account : $user->username;
    }
}
