<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Support\Audit;
use App\Support\Registry;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use PlainShow\Kit\Platform;

/**
 * The installer's first administrator: a username and a password, read from
 * standard input so it never shows in the process list. The roles (Admin,
 * Moderator, User, Guest) come with the migrations; the extensions and their
 * default permissions are loaded first, so the new admin sees every app.
 */
class CreateAdmin extends Command
{
    protected $signature = 'plainshow:admin
        {username : Sign-in name, letters, digits, dot, dash and underscore}
        {--first= : First name}
        {--last= : Last name}
        {--email= : E-mail address}';

    protected $description = 'Create an administrator; the password is read from standard input';

    public function handle(): int
    {
        $password = rtrim((string) stream_get_contents(STDIN), "\r\n");
        $data = [
            'username' => (string) $this->argument('username'),
            'first_name' => (string) ($this->option('first') ?? ''),
            'last_name' => (string) ($this->option('last') ?? ''),
            'email' => $this->option('email') ?: null,
            'password' => $password,
        ];
        $validator = Validator::make($data, [
            'username' => ['required', 'string', 'min:2', 'max:32', 'regex:/^[A-Za-z0-9_.-]+$/', 'not_regex:/^removed-/', 'unique:users,username'],
            'first_name' => ['string', 'max:60'],
            'last_name' => ['string', 'max:60'],
            'email' => ['nullable', 'email:rfc', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:10', 'max:200'],
        ]);
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        foreach (Registry::sync() as $change) {
            $this->line($change, verbosity: 'v');
        }

        $user = DB::transaction(function () use ($data): User {
            $user = new User;
            $user->forceFill([
                'username' => $data['username'],
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'email' => $data['email'],
                'password' => Hash::make($data['password']),
                'role' => 'admin',
                'status' => 'active',
                'password_changed_at' => now(),
            ])->save();
            // With Cloud, the admin's Cloud account is made on the first sign-in there.
            if (Platform::installed('cloud')) {
                DB::table('core_linked_accounts')->insert([
                    'user_id' => $user->id, 'provider' => 'nextcloud', 'external_id' => $user->username,
                    'method' => 'managed', 'created_at' => now(), 'updated_at' => now(),
                ]);
            }

            return $user;
        });
        Audit::record('user.created', ['username' => $user->username, 'role' => 'admin', 'by' => 'installer'], $user->id);
        $this->info("Administrator {$user->username} created.");

        return self::SUCCESS;
    }
}
