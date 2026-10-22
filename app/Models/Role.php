<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Role extends Model
{
    protected $table = 'core_roles';

    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['key', 'name', 'color', 'sort'];

    protected function casts(): array
    {
        return ['sort' => 'integer', 'protected' => 'boolean'];
    }

    public static function keys(): array
    {
        return self::orderBy('sort')->orderBy('name')->pluck('key')->all();
    }

    public function summary(): array
    {
        return ['key' => $this->key, 'name' => $this->name, 'color' => $this->color, 'protected' => $this->protected];
    }
}
