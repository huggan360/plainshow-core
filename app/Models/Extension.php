<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Extension extends Model
{
    protected $table = 'core_extensions';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'system' => 'boolean',
            'default_access' => 'array',
            'manifest' => 'array',
        ];
    }

    /** @return list<array<string, mixed>> */
    public function widgets(): array
    {
        return array_values(array_filter((array) ($this->manifest['widgets'] ?? []), 'is_array'));
    }

    /** @return array<string, mixed> */
    public function summary(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'icon' => $this->icon,
            'url' => $this->url,
            'enabled' => $this->enabled,
            'system' => $this->system,
            'version' => $this->version,
        ];
    }
}
