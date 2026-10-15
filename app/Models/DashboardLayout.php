<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DashboardLayout extends Model
{
    protected $table = 'core_dashboard_layouts';

    protected $primaryKey = 'user_id';

    public $incrementing = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['widgets' => 'array'];
    }
}
