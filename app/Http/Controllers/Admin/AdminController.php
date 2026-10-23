<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use App\Models\Extension;
use App\Models\Role;
use App\Models\User;
use App\Support\AdminAreas;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/** The Administration page: the admin areas this person may open, each with one figure. */
class AdminController extends Controller
{
    public function index(Request $request): Response
    {
        $areas = AdminAreas::for($request->user());
        abort_if($areas === [], 403);
        $figures = [
            'users' => fn () => __(':n accounts', ['n' => User::count()]),
            'services' => fn () => __(':n turned on', ['n' => Extension::where('enabled', true)->count()]),
            'permissions' => fn () => __(':n roles', ['n' => Role::count()]),
            'updates' => fn () => ($count = DB::table('core_components')->where('update_available', true)->count()) ? __(':n waiting', ['n' => $count]) : __('Up to date'),
            'audit' => fn () => __(':n today', ['n' => AuditEvent::where('created_at', '>=', now()->startOfDay())->count()]),
        ];

        return Inertia::render('Admin/Index', [
            'areas' => array_map(fn (array $area) => $area + ['figure' => isset($figures[$area['id']]) ? (string) $figures[$area['id']]() : null], $areas),
        ]);
    }
}
