<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/** Profile pictures are public to signed-in apps; the versioned URL allows long caching. */
class AvatarController extends Controller
{
    public function __invoke(User $user): Response
    {
        $path = $user->avatar_path;
        abort_unless($path && str_starts_with($path, 'avatars/') && Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->response($path, null, [
            'Content-Type' => 'image/webp',
            'Cache-Control' => 'public, max-age=31536000, immutable',
            'X-Content-Type-Options' => 'nosniff',
            'Access-Control-Allow-Origin' => '*',
            'Cross-Origin-Resource-Policy' => 'cross-origin',
        ]);
    }
}
