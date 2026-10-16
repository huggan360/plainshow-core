<?php

use App\Http\Middleware\AuthenticateBearer;
use App\Models\Extension;
use App\Support\CoreWidgets;
use App\Support\Permissions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// plainshow.se/api/core/v1 (bootstrap/app.php sets the prefix).
Route::get('/health', fn () => response()->json(['status' => 'ok', 'service' => 'core']));

Route::middleware([AuthenticateBearer::class.':core', 'throttle:120,1'])->group(function () {
    Route::get('/me', function (Request $request) {
        $user = $request->user();

        return $user->summary() + Permissions::for($user);
    });
    Route::get('/extensions', fn (Request $request) => Extension::where('enabled', true)->orderBy('sort')->get()
        ->filter(fn (Extension $extension) => $extension->id === 'core' || Permissions::hasService($request->user(), $extension->id))
        ->map->summary()->values());
    Route::get('/system', function (Request $request) {
        return CoreWidgets::data('pi-health', $request->user());
    });
});
