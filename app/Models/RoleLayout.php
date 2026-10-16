<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RoleLayout extends Model
{
    protected $table = 'core_role_layouts';

    protected $primaryKey = 'role';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['widgets' => 'array'];
    }
}
