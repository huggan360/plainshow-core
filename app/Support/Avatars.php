<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\Storage;
use Imagick;
use RuntimeException;
use Throwable;

/**
 * Every avatar is decoded and re-encoded as a 512 px square WebP, so uploads
 * cannot smuggle anything else in and pages stay light.
 */
class Avatars
{
    public const SIZE = 512;

    public static function store(User $user, string $binary): string
    {
        try {
            $image = new Imagick;
            $image->setResourceLimit(Imagick::RESOURCETYPE_MEMORY, 256 * 1024 * 1024);
            $image->readImageBlob($binary);
            $image = $image->coalesceImages()->getImage();
            $image->autoOrient();
            $image->cropThumbnailImage(self::SIZE, self::SIZE);
            $image->stripImage();
            $image->setImageFormat('webp');
            $image->setImageCompressionQuality(84);
            $encoded = $image->getImageBlob();
            $image->clear();
        } catch (Throwable $error) {
            throw new RuntimeException('That file is not an image we can use.', 0, $error);
        }

        $path = 'avatars/'.$user->id.'-'.bin2hex(random_bytes(6)).'.webp';
        Storage::disk('local')->put($path, $encoded);
        $previous = $user->avatar_path;
        $user->forceFill(['avatar_path' => $path])->save();
        if ($previous && str_starts_with($previous, 'avatars/') && $previous !== $path) {
            Storage::disk('local')->delete($previous);
        }

        return $path;
    }

    public static function remove(User $user): void
    {
        if ($user->avatar_path && str_starts_with($user->avatar_path, 'avatars/')) {
            Storage::disk('local')->delete($user->avatar_path);
        }
        $user->forceFill(['avatar_path' => null])->save();
    }
}
