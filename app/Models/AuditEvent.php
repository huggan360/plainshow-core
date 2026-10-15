<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** The platform audit log, shared with login (which owns the table). */
class AuditEvent extends Model
{
    protected $table = 'audit_events';

    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['context' => 'array', 'created_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
