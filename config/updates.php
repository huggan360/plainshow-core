<?php

/*
 * What the update runner may install, and how. `release` components build a
 * tag into /srv/plainshow/<id>/releases with their own deploy script and can
 * switch back to any kept release. `checkout` components are served from a
 * git checkout: they move forward to a tag, then run their steps.
 * `{source}`, `{ref}` and `{core}` are filled in by the runner.
 */
$projects = env('PLAINSHOW_PROJECTS', '/home/hugohansson/projects/plainshow');

return [
    // While a component installs, the runner touches <flags>/<host> for its
    // site; Apache then shows the "updating" page (ops/apache/plainshow-errors.conf).
    'flags' => env('PLAINSHOW_UPDATING_FLAGS', '/srv/plainshow/updating'),

    'components' => [
        'core' => [
            'name' => 'Dashboard', 'kind' => 'release', 'source' => "$projects/core", 'base' => '/srv/plainshow/core',
            'deploy' => ['bash', 'ops/deploy.sh', 'core', '{source}', '{ref}'],
            'health' => 'https://plainshow.se/up',
        ],
        'login' => [
            'name' => 'Login', 'kind' => 'release', 'source' => "$projects/login", 'base' => '/srv/plainshow/login',
            'deploy' => ['bash', '{core}/ops/deploy.sh', 'login', '{source}', '{ref}'],
            'health' => 'https://login.plainshow.se/up',
        ],
        'blog' => [
            'name' => 'Blog', 'kind' => 'release', 'source' => "$projects/blog", 'base' => '/srv/plainshow/blog',
            'deploy' => ['bash', 'ops/deploy.sh', '{ref}'],
            'health' => 'https://blog.plainshow.se/api/v1/health',
        ],
        'split' => [
            'name' => 'Split', 'kind' => 'release', 'source' => "$projects/split", 'base' => '/srv/plainshow/split',
            'deploy' => ['bash', 'ops/deploy.sh', '{ref}'],
            'health' => 'https://split.plainshow.se/api/v1/health',
        ],
        'latex' => [
            'name' => 'LaTeX', 'kind' => 'checkout', 'source' => env('PLAINSHOW_LATEX_SOURCE', '/var/www/html/projects/hugohansson/plainshow-latex'), 'remote' => 'origin',
            'steps' => [
                ['composer', 'install', '--no-dev', '--optimize-autoloader', '--no-interaction', '--no-progress'],
                ['plainshow', 'project', 'plainshow-latex', 'pm2', 'restart', 'latex-websocket'],
            ],
            'health' => 'https://latex.plainshow.se/',
        ],
        'cloud' => [
            'name' => 'Cloud', 'kind' => 'checkout', 'source' => env('PLAINSHOW_CLOUD_SOURCE', '/var/www/html/cloud'), 'remote' => 'origin',
            'steps' => [
                ['composer', 'install', '--no-dev', '--optimize-autoloader', '--no-interaction', '--no-progress', '--working-dir', 'apps/plainshow'],
                ['sudo', '-u', 'www-data', 'php', 'occ', 'upgrade', '--no-interaction'],
                ['sudo', '-u', 'www-data', 'php', 'occ', 'maintenance:repair', '--no-interaction'],
                // Nextcloud keeps its routes in APCu; a reload clears them.
                ['sudo', 'systemctl', 'reload', 'apache2'],
                ['sudo', 'systemctl', 'restart', 'notify_push'],
            ],
            'health' => 'https://cloud.plainshow.se/index.php/apps/plainshow/api/v1/health',
        ],
        'web' => [
            'name' => 'Web', 'kind' => 'checkout', 'source' => '/opt/plainshow', 'remote' => 'web',
            'steps' => [
                ['composer', 'install', '--no-interaction', '--no-progress'],
                ['npm', 'run', 'build'],
                ['php', 'artisan', 'migrate', '--force'],
                ['php', 'artisan', 'route:cache'],
            ],
            'health' => 'https://web.plainshow.se/login',
        ],
        'kit' => [
            'name' => 'UI kit', 'kind' => 'library', 'source' => "$projects/kit",
        ],
    ],
];
