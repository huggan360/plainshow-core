<?php

use App\Http\Controllers\AccountController;
use App\Http\Controllers\Admin\AuditController;
use App\Http\Controllers\Admin\ExtensionsController;
use App\Http\Controllers\Admin\PermissionsController;
use App\Http\Controllers\Admin\UpdatesController;
use App\Http\Controllers\Admin\UsersController;
use App\Http\Controllers\Auth\SsoController;
use App\Http\Controllers\AvatarController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\GroupsController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/auth/login', [SsoController::class, 'login'])->name('login');
Route::get('/auth/callback', [SsoController::class, 'callback']);
Route::get('/auth/frontchannel', [SsoController::class, 'frontchannel']);
Route::match(['get', 'post'], '/auth/logout', [SsoController::class, 'logout'])->name('logout');
Route::get('/avatars/{user}', AvatarController::class)->whereNumber('user');

// Public radar images (SMHI's own, only passed through and kept for a few hours).
Route::get('/weather/radar/smhi/{name}.png', [App\Http\Controllers\WeatherController::class, 'radarImage'])->where('name', 'radar_[0-9]{10}')->middleware('throttle:240,1');

Route::middleware('auth')->group(function () {
    Route::get('/', [DashboardController::class, 'show'])->name('dashboard');
    Route::get('/news', [App\Http\Controllers\NewsController::class, 'app'])->middleware('can.do:core.dashboard.use')->name('news');
    Route::get('/news/stories', [App\Http\Controllers\NewsController::class, 'stories'])->middleware('throttle:60,1');
    Route::get('/news/article/{id}', [App\Http\Controllers\NewsController::class, 'article'])->where('id', '[a-f0-9]{16}')->middleware('throttle:60,1');
    Route::put('/news/preferences', [App\Http\Controllers\NewsController::class, 'savePreferences']);
    Route::get('/news/image/{key}', [App\Http\Controllers\NewsController::class, 'image'])->where('key', '[a-f0-9]{32}');
    Route::get('/weather', [App\Http\Controllers\WeatherController::class, 'app'])->middleware('can.do:core.dashboard.use')->name('weather');
    Route::put('/weather/home', [App\Http\Controllers\WeatherController::class, 'setHome']);
    Route::delete('/weather/home', [App\Http\Controllers\WeatherController::class, 'clearHome']);
    Route::post('/weather/saved', [App\Http\Controllers\WeatherController::class, 'save']);
    Route::delete('/weather/saved', [App\Http\Controllers\WeatherController::class, 'forget']);
    Route::middleware('throttle:60,1')->group(function () {
        Route::get('/weather/places', [App\Http\Controllers\WeatherController::class, 'places']);
        Route::get('/weather/forecast', [App\Http\Controllers\WeatherController::class, 'forecast']);
        Route::get('/weather/radar', [App\Http\Controllers\WeatherController::class, 'radar']);
        Route::get('/weather/warnings', [App\Http\Controllers\WeatherController::class, 'warnings']);
    });
    Route::put('/dashboard/widgets/{key}/settings', [DashboardController::class, 'saveWidgetSettings'])->where('key', '[a-z0-9-]+\.[a-z0-9-]+');
    Route::get('/groups', [GroupsController::class, 'index'])->middleware('can.do:core.groups.view')->name('groups');
    Route::get('/groups/{group}', [GroupsController::class, 'show'])->whereNumber('group')->middleware('can.do:core.groups.view');
    Route::get('/groups/{group}/edit', [GroupsController::class, 'edit'])->whereNumber('group')->middleware('can.do:core.groups.view');
    Route::post('/groups', [GroupsController::class, 'store']);
    Route::put('/groups/{group}', [GroupsController::class, 'update'])->whereNumber('group');
    Route::delete('/groups/{group}', [GroupsController::class, 'destroy'])->whereNumber('group');
    Route::post('/groups/{group}/members', [GroupsController::class, 'addMember'])->whereNumber('group');
    Route::put('/groups/{group}/members/{member}/latex', [GroupsController::class, 'latexPermission'])->whereNumber(['group', 'member']);
    Route::put('/groups/{group}/owner', [GroupsController::class, 'transferOwner'])->whereNumber('group');
    Route::delete('/groups/{group}/members/{member}', [GroupsController::class, 'removeMember'])->whereNumber('group');
    Route::get('/widgets/{extension}/{widget}', [DashboardController::class, 'widget'])->where(['extension' => '[a-z0-9-]+', 'widget' => '[a-z0-9-]+']);
    Route::put('/dashboard/layout', [DashboardController::class, 'saveLayout']);
    Route::delete('/dashboard/layout', [DashboardController::class, 'resetLayout']);

    Route::get('/account/{section?}', [AccountController::class, 'show'])->name('account');
    Route::put('/account/profile', [AccountController::class, 'updateProfile']);
    Route::post('/account/avatar', [AccountController::class, 'updateAvatar']);
    Route::delete('/account/avatar', [AccountController::class, 'removeAvatar']);
    Route::middleware('throttle:10,1')->group(function () {
        Route::put('/account/password', [AccountController::class, 'updatePassword']);
        Route::post('/account/two-factor', [AccountController::class, 'startTwoFactor']);
        Route::post('/account/two-factor/confirm', [AccountController::class, 'confirmTwoFactor']);
        Route::delete('/account/two-factor/pending', [AccountController::class, 'cancelTwoFactor']);
        Route::delete('/account/two-factor', [AccountController::class, 'disableTwoFactor']);
        Route::post('/account/recovery-codes', [AccountController::class, 'regenerateRecoveryCodes']);
        Route::post('/account/tokens', [AccountController::class, 'createToken'])->middleware('can.do:core.api.use');
        Route::delete('/account/tokens/{token}', [AccountController::class, 'revokeToken']);
        Route::post('/account/sign-out-everywhere', [AccountController::class, 'signOutEverywhere']);
    });

    Route::get('/design', [DashboardController::class, 'studio'])->name('design');
    Route::put('/dashboard/layout/roles/{role}', [DashboardController::class, 'saveRoleLayout'])->middleware('can.do:core.permissions.manage');
    Route::delete('/dashboard/layout/roles/{role}', [DashboardController::class, 'resetRoleLayout'])->middleware('can.do:core.permissions.manage');

    Route::get('/admin', [App\Http\Controllers\Admin\AdminController::class, 'index'])->name('admin');
    Route::prefix('admin')->group(function () {
        Route::middleware('can.do:core.users.manage')->group(function () {
            Route::get('/users', [UsersController::class, 'index'])->name('admin.users');
            Route::post('/users', [UsersController::class, 'store']);
            Route::put('/users/{user}', [UsersController::class, 'update']);
            Route::put('/users/{user}/access', [UsersController::class, 'access']);
            Route::post('/users/{user}/reset-link', [UsersController::class, 'resetLink']);
            Route::delete('/users/{user}', [UsersController::class, 'destroy']);
        });
        Route::middleware('can.do:core.extensions.manage')->group(function () {
            Route::get('/services', [ExtensionsController::class, 'index'])->name('admin.extensions');
            Route::put('/services/{extension}', [ExtensionsController::class, 'update']);
        });
        Route::middleware('can.do:core.permissions.manage')->group(function () {
            Route::get('/permissions', [PermissionsController::class, 'index'])->name('admin.permissions');
            Route::put('/permissions/roles', [PermissionsController::class, 'updateRoles']);
            Route::post('/permissions/roles', [PermissionsController::class, 'storeRole']);
            Route::put('/permissions/roles/{role}', [PermissionsController::class, 'updateRole']);
            Route::delete('/permissions/roles/{role}', [PermissionsController::class, 'destroyRole']);
            Route::put('/permissions/users/{user}', [PermissionsController::class, 'updateUser']);
        });
        Route::middleware('can.do:core.updates.apply')->group(function () {
            Route::get('/updates', [UpdatesController::class, 'index'])->name('admin.updates');
            Route::post('/updates', [UpdatesController::class, 'store'])->middleware('throttle:20,1');
        });
        Route::get('/audit', [AuditController::class, 'index'])->middleware('can.do:core.audit.view')->name('admin.audit');
    });
});
