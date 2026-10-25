@php($uiVersion = \Composer\InstalledVersions::getReference('plainshow/kit') ? substr(\Composer\InstalledVersions::getReference('plainshow/kit'), 0, 8) : 'dev')
<!doctype html>
<html lang="{{ app()->getLocale() }}" data-theme="dark"{!! \PlainShow\Kit\Theme::attributes(auth()->user()?->accent ?? \PlainShow\Kit\Theme::accent()) !!}>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="color-scheme" content="dark light">
    <meta name="theme-color" content="#151515">
    <title inertia>PlainShow</title>
    <link rel="icon" href="/ui/brand/favicon.ico?v={{ $uiVersion }}" sizes="any">
    <link rel="icon" href="/ui/brand/plainshow-icon.webp?v={{ $uiVersion }}" type="image/webp">
    <link rel="apple-touch-icon" href="/ui/brand/apple-touch-icon.png?v={{ $uiVersion }}">
    <link rel="preload" href="/ui/fonts/bree-serif-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/ui/fonts/outfit-latin-wght.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/ui/css/boxicons.css?v={{ $uiVersion }}">
    <link rel="stylesheet" href="/ui/css/plainshow.css?v={{ $uiVersion }}">
    <script src="/ui/js/backdrop.js?v={{ $uiVersion }}" defer></script>
    <script nonce="{{ request()->attributes->get('csp_nonce') }}">
        try { var t = localStorage.getItem('plainshow-theme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) {}
    </script>
    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/app.tsx'])
    @inertiaHead
</head>
<body class="ps">
    <canvas class="ps-backdrop" aria-hidden="true"></canvas>
    @inertia
</body>
</html>
