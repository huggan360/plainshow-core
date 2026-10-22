<?php

namespace App\Support;

use App\Models\User;
use RuntimeException;
use Symfony\Component\Process\Process;

class AccountLifecycle
{
    public static function cloudExists(string $username): bool
    {
        $process = self::process(['cloud', 'exists', $username]);
        $process->run();
        if (! $process->isSuccessful()) {
            throw new RuntimeException('Cloud account lookup failed.');
        }

        return trim($process->getOutput()) === '1';
    }

    public static function cloud(User $user, string $action): void
    {
        self::run(['cloud', $action, CloudAccount::for($user)]);
    }

    public static function cloudGroup(string $action, int $groupId, ?string $value = null): void
    {
        $arguments = ['group', $action, 'ps-'.$groupId];
        if ($value !== null) {
            $arguments[] = $value;
        }
        self::run($arguments);
    }

    public static function pi(User $user, string $action, ?string $password = null): void
    {
        if (! is_string($user->pi_username) || $user->pi_username === '') {
            return;
        }

        if ($user->pi_username === config('plainshow.protected_pi_username')) {
            if ($action !== 'disable') {
                return;
            }
            $action = 'revoke';
        }

        self::run(['pi', $action, $user->pi_username, (string) $user->id], $password);
    }

    private static function run(array $arguments, ?string $input = null): void
    {
        $process = self::process($arguments);
        if ($input !== null) {
            $process->setInput($input);
        }
        $process->run();
        if (! $process->isSuccessful()) {
            throw new RuntimeException('Account sync failed: '.trim($process->getErrorOutput()));
        }
    }

    private static function process(array $arguments): Process
    {
        $process = new Process(array_merge([config('plainshow.sudo_command'), '-n', config('plainshow.account_helper')], $arguments));
        $process->setTimeout(130);

        return $process;
    }
}
