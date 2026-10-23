<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;

/**
 * A PlainShow account. The `users` table belongs to plainshow-login; core
 * edits profiles, roles and status but never changes the schema.
 */
class User extends Authenticatable
{
    protected $fillable = ['username', 'email', 'first_name', 'last_name', 'phone', 'role', 'status', 'pi_username'];

    protected $hidden = ['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'two_factor_secret' => 'encrypted',
            'two_factor_recovery_codes' => 'encrypted:array',
            'two_factor_confirmed_at' => 'datetime',
            'password_changed_at' => 'datetime',
            'last_login_at' => 'datetime',
            'weather' => 'array',
            'news' => 'array',
        ];
    }

    public function dashboard(): HasOne
    {
        return $this->hasOne(DashboardLayout::class);
    }

    public function name(): string
    {
        return trim($this->first_name.' '.$this->last_name) ?: $this->username;
    }

    public function initials(): string
    {
        $parts = preg_split('/\s+/u', trim($this->first_name.' '.$this->last_name) ?: $this->username) ?: [];

        return mb_strtoupper(implode('', array_map(fn ($part) => mb_substr($part, 0, 1), array_slice($parts, 0, 2)))) ?: '?';
    }

    public function avatarUrl(): ?string
    {
        return $this->avatar_path ? '/avatars/'.$this->id.'?v='.substr(md5($this->avatar_path), 0, 8) : null;
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function hasTwoFactor(): bool
    {
        return $this->two_factor_confirmed_at !== null;
    }

    /** @return array<string, mixed> */
    public function summary(): array
    {
        return [
            'id' => $this->id,
            'username' => $this->username,
            'name' => $this->name(),
            'firstName' => $this->first_name,
            'lastName' => $this->last_name,
            'initials' => $this->initials(),
            'avatar' => $this->avatarUrl(),
            'role' => $this->role,
            'status' => $this->status,
        ];
    }
}
