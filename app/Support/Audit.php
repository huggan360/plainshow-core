<?php

namespace App\Support;

use App\Models\AuditEvent;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Throwable;

class Audit
{
    /** Records an action. `subject` is the account acted on, when not the actor. */
    public static function record(string $event, array $context = [], ?int $subjectId = null): void
    {
        $actor = Auth::user();
        try {
            AuditEvent::create([
                'user_id' => $subjectId ?? $actor?->id,
                'actor' => $actor?->username ?? 'system',
                'source' => 'core',
                'event' => $event,
                'ip_address' => request()?->ip(),
                'context' => $context ?: null,
                'created_at' => now(),
            ]);
        } catch (Throwable $error) {
            Log::warning('Audit write failed', ['event' => $event, 'error' => $error->getMessage()]);
        }
    }
}
