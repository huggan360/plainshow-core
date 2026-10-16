<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Audit;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Versions of every PlainShow part, and requests to update or switch back.
 * The update runner carries the requests out; this only queues them.
 */
class UpdatesController extends Controller
{
    public function index(): Response
    {
        $components = collect(config('updates.components'))->map(function (array $config, string $id) {
            $row = DB::table('core_components')->where('id', $id)->first();

            return [
                'id' => $id,
                'name' => $config['name'],
                'kind' => $config['kind'],
                'installed' => $row?->installed,
                'installedRef' => $row?->installed_ref,
                'latest' => $row?->latest,
                'updateAvailable' => (bool) ($row?->update_available),
                'changelog' => $row?->changelog,
                'releases' => $row?->releases ? json_decode($row->releases, true) : [],
                'error' => $row?->error,
                'checkedAt' => $row?->checked_at ? \Illuminate\Support\Carbon::parse($row->checked_at)->toIso8601String() : null,
            ];
        })->values();

        $jobs = DB::table('core_update_jobs')->orderByDesc('id')->limit(30)->get()->map(fn ($job) => [
            'id' => $job->id,
            'component' => $job->component,
            'action' => $job->action,
            'target' => $job->target,
            'status' => $job->status,
            'log' => $job->log,
            'requestedBy' => $job->requested_by ? DB::table('users')->where('id', $job->requested_by)->value('first_name') : null,
            'createdAt' => \Illuminate\Support\Carbon::parse($job->created_at)->toIso8601String(),
            'finishedAt' => $job->finished_at ? \Illuminate\Support\Carbon::parse($job->finished_at)->toIso8601String() : null,
        ]);

        return Inertia::render('Admin/Updates', [
            'components' => $components,
            'jobs' => $jobs,
            'runnerSeen' => DB::table('core_components')->max('checked_at') !== null,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $ids = array_keys(config('updates.components'));
        $data = $request->validate([
            'component' => ['required', Rule::in([...$ids, 'all'])],
            'action' => ['required', Rule::in(['check', 'update', 'rollback'])],
            'target' => ['nullable', 'string', 'max:120', 'regex:/^(v\d+\.\d+\.\d+|\d{14}-[A-Za-z0-9._-]+)$/'],
        ]);
        if ($data['action'] !== 'check' && (empty($data['target']) || $data['component'] === 'all')) {
            return back()->with('error', 'Choose what to install.');
        }
        $busy = DB::table('core_update_jobs')->whereIn('status', ['queued', 'running'])
            ->where(fn ($query) => $query->where('component', $data['component'])->orWhere('action', 'check'))->exists();
        if ($busy) {
            return back()->with('error', 'That is already waiting to run.');
        }

        DB::table('core_update_jobs')->insert([
            'component' => $data['action'] === 'check' ? 'all' : $data['component'],
            'action' => $data['action'],
            'target' => $data['action'] === 'check' ? null : $data['target'],
            'status' => 'queued',
            'requested_by' => $request->user()->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        if ($data['action'] !== 'check') {
            Audit::record('update.requested', ['component' => $data['component'], 'action' => $data['action'], 'target' => $data['target']]);
        }

        return back()->with('status', match ($data['action']) {
            'check' => 'Checking for updates. This starts within a minute.',
            'update' => 'Update queued. It starts within a minute.',
            default => 'Switch queued. It starts within a minute.',
        });
    }
}
