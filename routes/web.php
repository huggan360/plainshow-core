<?php

use App\Http\Controllers\AccountController;
use App\Http\Controllers\Admin\AuditController;
use App\Http\Controllers\Admin\ExtensionsController;
use App\Http\Controllers\Admin\UsersController;
use App\Http\Controllers\Auth\SsoController;
use App\Http\Controllers\AvatarController;
use App\Http\Controllers\DashboardController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/auth/login', [SsoController::class, 'login'])->name('login');
Route::get('/auth/callback', [SsoController::class, 'callback']);
Route::get('/auth/frontchannel', [SsoController::class, 'frontchannel']);
Route::match(['get', 'post'], '/auth/logout', [SsoController::class, 'logout'])->name('logout');
Route::get('/avatars/{user}', AvatarController::class)->whereNumber('user');

Route::middleware('auth')->group(function () {
    Route::get('/', [DashboardController::class, 'show'])->name('dashboard');
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
        Route::post('/account/sign-out-everywhere', [AccountController::class, 'signOutEverywhere']);
    });

    Route::get('/design', fn () => Inertia::render('Design'))->name('design');

    Route::prefix('admin')->group(function () {
        Route::middleware('can.do:core.users.manage')->group(function () {
            Route::get('/users', [UsersController::class, 'index'])->name('admin.users');
            Route::post('/users', [UsersController::class, 'store']);
            Route::put('/users/{user}', [UsersController::class, 'update']);
            Route::put('/users/{user}/access', [UsersController::class, 'access']);
            Route::post('/users/{user}/reset-link', [UsersController::class, 'resetLink']);
        });
        Route::middleware('can.do:core.extensions.manage')->group(function () {
            Route::get('/services', [ExtensionsController::class, 'index'])->name('admin.extensions');
            Route::put('/services/{extension}', [ExtensionsController::class, 'update']);
        });
        Route::get('/audit', [AuditController::class, 'index'])->middleware('can.do:core.audit.view')->name('admin.audit');
    });
});
