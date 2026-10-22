<?php

namespace App\Console\Commands;

use App\Support\Audit;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Symfony\Component\Process\Process;
use Throwable;

/**
 * The update runner. Cron starts it every minute as the user that deploys
 * PlainShow; it refreshes what is installed and what is available, and
 * carries out the updates and rollbacks admins asked for in core. Only the
 * commands in config/updates.php are ever run, with validated targets.
 */
class RunUpdates extends Command
{
    protected $signature = 'plainshow:updates {--check : Refresh installed and available versions} {--run : Carry out queued requests}';

    protected $description = 'Check for and install PlainShow updates';

    private ?int $jobId = null;

    public function handle(): int
    {
        $lock = fopen(storage_path('framework/plainshow-updates.lock'), 'c');
        if (! $lock || ! flock($lock, LOCK_EX | LOCK_NB)) {
            return self::SUCCESS; // another run is busy
        }

        // Leftovers from an earlier update (such as the core release this runner ran from).
        foreach (self::components() as $component) {
            if ($component['kind'] === 'release' && is_link($component['base'].'/current')) {
                $this->prune($component);
            }
        }

        if ($this->option('check')) {
            $this->checkAll();
        }
        if ($this->option('run')) {
            while ($job = DB::table('core_update_jobs')->where('status', 'queued')->orderBy('id')->first()) {
                $this->work($job);
            }
        }

        flock($lock, LOCK_UN);

        return self::SUCCESS;
    }

    private function work(object $job): void
    {
        $this->jobId = $job->id;
        DB::table('core_update_jobs')->where('id', $job->id)->update(['status' => 'running', 'started_at' => now(), 'log' => '', 'updated_at' => now()]);
        $ok = true;
        try {
            match ($job->action) {
                'check' => $this->checkAll(),
                'update' => $this->update($job->component, (string) $job->target),
                'rollback' => $this->switchRelease($job->component, (string) $job->target),
                default => throw new RuntimeException('Unknown request.'),
            };
        } catch (Throwable $error) {
            $ok = false;
            $this->log('Failed: '.$error->getMessage());
        }
        if ($job->action !== 'check' && isset(self::components()[$job->component])) {
            $this->check($job->component);
        }
        DB::table('core_update_jobs')->where('id', $job->id)->update(['status' => $ok ? 'done' : 'failed', 'finished_at' => now(), 'updated_at' => now()]);
        if ($job->action !== 'check') {
            $event = ! $ok ? 'update.failed' : ($job->action === 'rollback' ? 'update.rollback' : 'update.finished');
            Audit::record($event, ['component' => $job->component, 'target' => $job->target, 'job' => $job->id], $job->requested_by);
        }
        $this->jobId = null;
    }

    /* ---------- Versions ---------- */

    private function checkAll(): void
    {
        foreach (array_keys(self::components()) as $id) {
            $this->check($id);
        }
    }

    private function check(string $id): void
    {
        $component = self::components()[$id];
        $row = ['name' => $component['name'], 'kind' => $component['kind'], 'checked_at' => now(), 'updated_at' => now(), 'error' => null];
        try {
            $source = $component['source'];
            $this->git($source, ['fetch', '--tags', '--quiet', $component['remote'] ?? 'origin'], 90, false);
            $tags = array_values(array_filter(explode("\n", trim($this->git($source, ['tag', '-l', 'v*', '--sort=-v:refname']))), fn ($tag) => preg_match('/^v\d+\.\d+\.\d+$/', $tag)));
            $latest = $tags[0] ?? null;
            $commit = $this->installedCommit($component);
            $installedTag = $commit ? trim($this->git($source, ['describe', '--tags', '--abbrev=0', '--match', 'v*', $commit], 20, false)) : '';
            $row['installed_ref'] = $commit ? substr($commit, 0, 12) : null;
            $row['installed'] = $commit ? trim($this->git($source, ['describe', '--tags', '--match', 'v*', '--always', $commit], 20, false)) : null;
            $row['latest'] = $latest;
            $row['update_available'] = $latest && $commit && $component['kind'] !== 'library'
                && ! $this->isAncestor($source, $latest, $commit);
            $row['changelog'] = $latest ? $this->changelog($source, $latest, $installedTag) : null;
            $row['releases'] = $component['kind'] === 'release' ? json_encode($this->releases($component)) : null;
        } catch (Throwable $error) {
            $row['error'] = mb_substr($error->getMessage(), 0, 250);
        }
        DB::table('core_components')->updateOrInsert(['id' => $id], $row + ['created_at' => now()]);
    }

    private function installedCommit(array $component): ?string
    {
        $source = $component['source'];
        if ($component['kind'] === 'release') {
            $current = basename((string) readlink($component['base'].'/current'));
            $ref = preg_replace('/^\d{14}-/', '', $current);
            if ($ref === '' || $ref === $current) {
                return null;
            }

            return trim($this->git($source, ['rev-parse', '--verify', '--quiet', $ref.'^{commit}'], 20, false)) ?: null;
        }

        return trim($this->git($source, ['rev-parse', 'HEAD'])) ?: null;
    }

    private function isAncestor(string $source, string $ancestor, string $commit): bool
    {
        $process = new Process(['git', 'merge-base', '--is-ancestor', $ancestor, $commit], $source, self::env());
        $process->run();

        return $process->getExitCode() === 0;
    }

    /** The changelog sections newer than what is installed. */
    private function changelog(string $source, string $latest, string $installedTag): ?string
    {
        $text = $this->git($source, ['show', $latest.':CHANGELOG.md'], 20, false);
        if (trim($text) === '') {
            return null;
        }
        $sections = preg_split('/^(?=## )/m', $text);
        $keep = [];
        $installed = ltrim($installedTag, 'v');
        foreach ($sections as $section) {
            if (! str_starts_with($section, '## ')) {
                continue;
            }
            if ($installed !== '' && preg_match('/^## v?'.preg_quote($installed, '/').'\b/', $section)) {
                break;
            }
            $keep[] = trim($section);
            if (count($keep) >= 10) {
                break;
            }
        }

        return mb_substr(implode("\n\n", $keep), 0, 20000) ?: null;
    }

    private function releases(array $component): array
    {
        $current = basename((string) readlink($component['base'].'/current'));
        $releases = [];
        foreach (glob($component['base'].'/releases/*', GLOB_ONLYDIR) ?: [] as $dir) {
            $name = basename($dir);
            if (! preg_match('/^(\d{14})-(.+)$/', $name, $match)) {
                continue;
            }
            $releases[] = ['name' => $name, 'ref' => $match[2], 'at' => \DateTime::createFromFormat('YmdHis', $match[1])?->format(DATE_ATOM), 'current' => $name === $current];
        }
        usort($releases, fn ($a, $b) => strcmp($b['name'], $a['name']));

        return $releases;
    }

    /* ---------- Changes ---------- */

    private function update(string $id, string $target): void
    {
        $component = self::components()[$id] ?? throw new RuntimeException('Unknown component.');
        if (! preg_match('/^v\d+\.\d+\.\d+$/', $target)) {
            throw new RuntimeException('Updates go to a version tag.');
        }
        // Visitors see the "updating" page while this runs (core/ops/apache/plainshow-errors.conf).
        $this->setUpdating($component, true);
        try {
            $this->install($id, $component, $target);
        } finally {
            $this->setUpdating($component, false);
        }
    }

    private function install(string $id, array $component, string $target): void
    {
        $source = $component['source'];
        // Tags made on this machine count too, so a remote that cannot be reached is not fatal.
        $this->git($source, ['fetch', '--tags', '--quiet', $component['remote'] ?? 'origin'], 90, false);
        if (trim($this->git($source, ['tag', '-l', $target])) !== $target) {
            throw new RuntimeException("$target does not exist.");
        }

        if ($component['kind'] === 'release') {
            $before = basename((string) readlink($component['base'].'/current'));
            $this->log("Installing $target, replacing $before.");
            $this->exec($this->fill($component['deploy'], $source, $target), $source, 1200);
            if (! $this->healthy($component)) {
                $this->log('The new version did not answer its health check. Switching back.');
                $this->switchRelease($id, $before);
                throw new RuntimeException("$target failed its health check and was rolled back.");
            }
            $this->log("$target is live.");
            $this->prune($component);

            return;
        }

        if ($component['kind'] !== 'checkout') {
            throw new RuntimeException('This component is not installed on its own.');
        }
        if (trim($this->git($source, ['status', '--porcelain', '--untracked-files=no'])) !== '') {
            throw new RuntimeException('The checkout has uncommitted changes; commit them first.');
        }
        $before = trim($this->git($source, ['rev-parse', 'HEAD']));
        $this->log("Moving to $target from ".substr($before, 0, 12).'.');
        $this->git($source, ['merge', '--ff-only', $target], 60);
        try {
            foreach ($component['steps'] as $step) {
                $this->exec($step, $source, 900);
            }
            if (! $this->healthy($component)) {
                throw new RuntimeException('health check failed');
            }
        } catch (Throwable $error) {
            $this->log('Going back to '.substr($before, 0, 12).': '.$error->getMessage());
            $this->git($source, ['reset', '--hard', $before], 60);
            foreach ($component['steps'] as $step) {
                $this->exec($step, $source, 900, false);
            }
            throw new RuntimeException("$target was rolled back.");
        }
        $this->log("$target is live.");
    }

    /** Points a release component at one of its kept releases. */
    private function switchRelease(string $id, string $release): void
    {
        $component = self::components()[$id] ?? throw new RuntimeException('Unknown component.');
        if ($component['kind'] !== 'release') {
            throw new RuntimeException('Only components with releases can switch back.');
        }
        $names = array_column($this->releases($component), 'name');
        if (! preg_match('/^\d{14}-[A-Za-z0-9._-]+$/', $release) || ! in_array($release, $names, true)) {
            throw new RuntimeException('That release is not kept any more.');
        }
        $base = $component['base'];
        $this->exec(['ln', '-sfn', "$base/releases/$release", "$base/current.new"], $base, 20);
        $this->exec(['mv', '-Tf', "$base/current.new", "$base/current"], $base, 20);
        $this->exec(['sudo', '-n', 'systemctl', 'reload', 'php8.5-fpm'], $base, 60, false);
        $this->log("Switched to $release.");
        if (! $this->healthy($component)) {
            throw new RuntimeException("$release does not answer its health check either.");
        }
    }

    /** Old releases go once the new one is live: no legacy versions stay on the server. */
    private function prune(array $component): void
    {
        $current = basename((string) readlink($component['base'].'/current'));
        foreach (glob($component['base'].'/releases/*', GLOB_ONLYDIR) ?: [] as $dir) {
            // The runner itself may run from the old core release; that one goes on the next run.
            if (realpath($dir) === realpath(base_path())) {
                continue;
            }
            if (basename($dir) !== $current && preg_match('/^\d{14}-[A-Za-z0-9._-]+$/', basename($dir))) {
                $this->exec(['rm', '-rf', $dir], $component['base'], 300, false, quiet: true);
                $this->log('Removed the old release '.basename($dir).'.');
            }
        }
    }

    /** The flag Apache checks to show the "updating" page on the component's sites. */
    private function setUpdating(array $component, bool $on): void
    {
        $hosts = $component['hosts'] ?? array_filter([(string) parse_url((string) ($component['health'] ?? ''), PHP_URL_HOST)]);
        $dir = (string) config('updates.flags', '/srv/plainshow/updating');
        foreach ($hosts as $host) {
            if (! preg_match('/^[a-z0-9.-]+$/', $host) || ! is_dir($dir)) {
                continue;
            }
            $on ? @touch("$dir/$host") : @unlink("$dir/$host");
        }
    }

    private function healthy(array $component): bool
    {
        if (empty($component['health'])) {
            return true;
        }
        $host = (string) parse_url($component['health'], PHP_URL_HOST);
        for ($try = 1; $try <= 4; $try++) {
            try {
                $status = Http::timeout(15)->withOptions(['allow_redirects' => false, 'curl' => [CURLOPT_RESOLVE => ["$host:443:127.0.0.1"]]])
                    ->get($component['health'])->status();
                if ($status > 0 && $status < 500) {
                    $this->log("Health check answered $status.");

                    return true;
                }
                $this->log("Health check answered $status.");
            } catch (Throwable $error) {
                $this->log('Health check: '.$error->getMessage());
            }
            sleep(4);
        }

        return false;
    }

    /* ---------- Helpers ---------- */

    private static function components(): array
    {
        return (array) config('updates.components', []);
    }

    private function fill(array $command, string $source, string $ref): array
    {
        $core = self::components()['core']['source'];

        return array_map(fn ($part) => str_replace(['{source}', '{ref}', '{core}'], [$source, $ref, $core], $part), $command);
    }

    private function git(string $cwd, array $args, int $timeout = 30, bool $must = true): string
    {
        return $this->exec(['git', ...$args], $cwd, $timeout, $must, quiet: true);
    }

    private function exec(array $command, string $cwd, int $timeout, bool $must = true, bool $quiet = false): string
    {
        if (! $quiet) {
            $this->log('$ '.implode(' ', $command));
        }
        $process = new Process($command, $cwd, self::env(), null, $timeout);
        $output = '';
        $errors = '';
        $process->run(function ($type, $chunk) use (&$output, &$errors, $quiet) {
            $type === Process::OUT ? $output .= $chunk : $errors .= $chunk;
            if (! $quiet) {
                $this->log(rtrim($chunk, "\n"), false);
            }
        });
        if ($must && ! $process->isSuccessful()) {
            $detail = $quiet ? trim(mb_substr($errors, 0, 300)) : '';
            throw new RuntimeException(trim(implode(' ', array_slice($command, 0, 3)).' exited with '.$process->getExitCode().($detail !== '' ? ": $detail" : '')));
        }

        return $process->isSuccessful() ? $output : '';
    }

    private static function env(): array
    {
        return [
            'PATH' => '/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin',
            'HOME' => getenv('HOME') ?: '/home/'.get_current_user(),
            'GIT_TERMINAL_PROMPT' => '0',
            'COMPOSER_NO_INTERACTION' => '1',
            'LANG' => 'C.UTF-8',
        ];
    }

    private function log(string $line, bool $stamp = true): void
    {
        $text = ($stamp ? '['.now()->setTimezone('Europe/Stockholm')->format('H:i:s').'] ' : '').preg_replace('/\e\[[0-9;]*m/', '', $line);
        $this->line($text);
        if ($this->jobId !== null) {
            DB::table('core_update_jobs')->where('id', $this->jobId)
                ->update(['log' => DB::raw('RIGHT(CONCAT(COALESCE(log, \'\'), '.DB::getPdo()->quote($text."\n").'), 60000)'), 'updated_at' => now()]);
        }
    }
}
