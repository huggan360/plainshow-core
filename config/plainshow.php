<?php

return [
    'login_url' => env('PLAINSHOW_LOGIN_URL', 'https://login.plainshow.se'),
    'client_id' => env('PLAINSHOW_CLIENT_ID'),
    'client_secret' => env('PLAINSHOW_CLIENT_SECRET'),

    // Installed extension releases live at <root>/<id>/current.
    'releases_root' => env('PLAINSHOW_RELEASES_ROOT', '/srv/plainshow'),

    // Where avatars are stored (outside the web root).
    'avatar_disk' => 'local',

    // The blog's profile pictures, imported once.
    'blog_avatars' => env('PLAINSHOW_BLOG_AVATARS', '/var/www/html/projects/hugohansson/woc/public/assets/profile_pictures'),
];
