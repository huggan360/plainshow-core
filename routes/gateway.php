<?php

use App\Http\Controllers\GatewayController;
use App\Http\Middleware\AuthenticateBearer;
use Illuminate\Support\Facades\Route;

// plainshow.se/api/{service}/v1/...: every service's API behind one address and one token.
Route::get('/api/{service}/openapi.json', [GatewayController::class, 'openapi'])->where('service', '[a-z0-9-]+')->middleware('throttle:60,1,gateway-openapi');
Route::any('/api/{service}/v1/{path?}', [GatewayController::class, 'forward'])
    ->where(['service' => '(?!core$)[a-z0-9-]+', 'path' => '.*'])
    ->middleware([AuthenticateBearer::class, 'throttle:120,1,gateway']);
