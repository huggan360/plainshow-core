<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use App\Support\Avatars;

/**
 * Copies the blog's profile pictures into core's private storage. The blog
 * stored a file name (or path) per account; core serves them at /avatars/{id}.
 */
class ImportAvatars extends Command
{
    protected $signature = 'plainshow:import-avatars';

    protected $description = 'Import profile pictures from the blog';

    public function handle(): int
    {
        $source = rtrim((string) config('plainshow.blog_avatars'), '/');
        $copied = 0;
        foreach (User::whereNotNull('avatar_path')->get() as $user) {
            if (str_starts_with($user->avatar_path, 'avatars/')) {
                continue;
            }
            $file = $source.'/'.basename($user->avatar_path);
            $mime = is_file($file) ? (string) mime_content_type($file) : '';
            if (! in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true)) {
                $this->warn("No usable picture for {$user->username} ({$user->avatar_path}).");
                $user->forceFill(['avatar_path' => null])->save();

                continue;
            }
            try {
                Avatars::store($user, (string) file_get_contents($file));
            } catch (\RuntimeException $error) {
                $this->warn("Could not convert the picture for {$user->username}.");

                continue;
            }
            $copied++;
        }
        $this->info("Copied $copied pictures.");

        return self::SUCCESS;
    }
}
