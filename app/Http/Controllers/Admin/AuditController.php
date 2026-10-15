<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use App\Support\AuditLabels;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AuditController extends Controller
{
    public function index(Request $request): Response
    {
        $filter = (string) $request->query('filter', 'all');
        $events = AuditEvent::with('user')
            ->when($filter === 'security', fn ($query) => $query->where(fn ($inner) => $inner->where('event', 'like', 'login.%')->orWhere('event', 'like', 'two_factor.%')->orWhere('event', 'like', 'password.%')))
            ->when($filter === 'admin', fn ($query) => $query->where('source', 'core')->where(fn ($inner) => $inner->where('event', 'like', 'user.%')->orWhere('event', 'like', 'extension.%')))
            ->orderByDesc('id')
            ->paginate(50)
            ->withQueryString()
            ->through(fn (AuditEvent $event) => [
                'id' => $event->id,
                'label' => AuditLabels::label($event->event),
                'event' => $event->event,
                'actor' => $event->actor,
                'subject' => $event->user?->username,
                'source' => $event->source,
                'ip' => $event->ip_address,
                'context' => $event->context,
                'at' => $event->created_at?->toIso8601String(),
            ]);

        return Inertia::render('Admin/Audit', ['events' => $events, 'filter' => $filter]);
    }
}
