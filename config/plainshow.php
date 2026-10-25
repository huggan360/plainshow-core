<?php

use PlainShow\Kit\Platform;

return [
    // Every app's address comes from the platform file (kit Platform).
    'login_url' => env('PLAINSHOW_LOGIN_URL', Platform::url('login') ?? 'https://login.plainshow.se'),
    'client_id' => env('PLAINSHOW_CLIENT_ID'),
    'client_secret' => env('PLAINSHOW_CLIENT_SECRET'),

    // Shared with login for signed internal requests (personal API tokens).
    'internal_secret' => env('PLAINSHOW_INTERNAL_SECRET', ''),

    // Installed extension releases live at <root>/<id>/current.
    'releases_root' => env('PLAINSHOW_RELEASES_ROOT', '/srv/plainshow'),
    'account_helper' => env('PLAINSHOW_ACCOUNT_HELPER', '/usr/local/libexec/plainshow-account-helper'),
    'sudo_command' => 'sudo',
    'protected_pi_username' => env('PLAINSHOW_PROTECTED_PI_USERNAME', 'hugohansson'),

    // The Composer's language model (llama.cpp's server, started on demand by systemd).
    'assistant_url' => env('PLAINSHOW_ASSISTANT_URL', 'http://127.0.0.1:18090'),

    // Where avatars are stored (outside the web root).
    'avatar_disk' => 'local',

    // The blog's profile pictures, imported once.
    'blog_avatars' => env('PLAINSHOW_BLOG_AVATARS', '/var/www/html/projects/hugohansson/woc/public/assets/profile_pictures'),
];
