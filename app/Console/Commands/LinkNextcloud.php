<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Support\Audit;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Ties existing Nextcloud accounts to PlainShow accounts, so people keep
 * their files when Nextcloud signs in with PlainShow.
 *
 *   sudo -u www-data php occ user:list --output=json | php artisan plainshow:link-nextcloud
 *
 * A Nextcloud account is linked when the first word of its display name (or
 * its user id) equals exactly one PlainShow first name, case-insensitively.
 * Anything ambiguous is reported and left alone.
 */
class LinkNextcloud extends Command
{
    protected $signature = 'plainshow:link-nextcloud {--dry-run}';

    protected $description = 'Link existing Nextcloud accounts to PlainShow accounts by first name';

    public function handle(): int
    {
        $accounts = json_decode((string) stream_get_contents(STDIN), true);
        if (! is_array($accounts)) {
            $this->error('Pipe in `occ user:list --output=json`.');

            return self::FAILURE;
        }

        $byFirstName = User::all()->groupBy(fn (User $user) => mb_strtolower(trim($user->first_name)));
        $taken = DB::table('core_linked_accounts')->where('provider', 'nextcloud')->pluck('user_id', 'external_id');

        foreach ($accounts as $uid => $displayName) {
            if ($taken->has($uid)) {
                $this->line("Already linked: $uid");

                continue;
            }
            $first = mb_strtolower((string) (preg_split('/\s+/u', trim((string) $displayName))[0] ?? ''));
            $candidates = $byFirstName->get($first) ?? $byFirstName->get(mb_strtolower((string) $uid)) ?? collect();
            $candidates = $candidates->reject(fn (User $user) => DB::table('core_linked_accounts')->where(['provider' => 'nextcloud', 'user_id' => $user->id])->exists());

            if ($candidates->count() !== 1) {
                $this->warn(sprintf('Not linked: %s (%s), %s', $uid, $displayName, $candidates->isEmpty() ? 'no PlainShow match' : 'several PlainShow matches'));

                continue;
            }
            $user = $candidates->first();
            $this->info(sprintf('%s %s (%s) to %s (%s)', $this->option('dry-run') ? 'Would link' : 'Linked', $uid, $displayName, $user->username, $user->name()));
            if (! $this->option('dry-run')) {
                DB::table('core_linked_accounts')->insert(['user_id' => $user->id, 'provider' => 'nextcloud', 'external_id' => $uid, 'method' => 'first-name', 'created_at' => now(), 'updated_at' => now()]);
                Audit::record('nextcloud.linked', ['nextcloud_user' => $uid], $user->id);
            }
        }

        return self::SUCCESS;
    }
}
