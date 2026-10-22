<?php

namespace App\Support;

class AuditLabels
{
    private const LABELS = [
        'login.success' => 'Signed in',
        'login.failed' => 'Failed sign-in',
        'login.locked' => 'Sign-in locked',
        'login.disabled' => 'Disabled account tried to sign in',
        'login.two_factor_required' => 'Sign-in needs two-factor',
        'logout' => 'Signed out',
        'two_factor.failed' => 'Wrong two-factor code',
        'two_factor.recovery_code_used' => 'Used a recovery code',
        'two_factor.enabled' => 'Turned on two-factor',
        'two_factor.disabled' => 'Turned off two-factor',
        'two_factor.recovery_regenerated' => 'New recovery codes',
        'password.reset' => 'Set a new password',
        'password.reset_link' => 'Reset link created',
        'password.changed' => 'Changed password',
        'authorize.denied' => 'Refused access to a service',
        'profile.updated' => 'Updated profile',
        'avatar.updated' => 'Changed profile picture',
        'avatar.removed' => 'Removed profile picture',
        'sessions.revoked' => 'Signed out everywhere',
        'users.imported' => 'Imported accounts',
        'user.created' => 'Account created',
        'user.updated' => 'Account changed',
        'user.access_changed' => 'Service access changed',
        'extension.updated' => 'Service settings changed',
        'layout.role_saved' => 'Default dashboard saved',
        'layout.role_reset' => 'Default dashboard reset',
        'permissions.role_changed' => 'Role permissions changed',
        'permissions.user_changed' => 'Personal permissions changed',
        'nextcloud.connected' => 'Connected Nextcloud to the dashboard',
        'nextcloud.disconnected' => 'Disconnected Nextcloud from the dashboard',
        'api_token.created' => 'API token created',
        'api_token.revoked' => 'API token revoked',
        'update.requested' => 'Update requested',
        'update.finished' => 'Update installed',
        'update.failed' => 'Update failed',
        'update.rollback' => 'Rolled back',
    ];

    public static function label(string $event): string
    {
        return isset(self::LABELS[$event]) ? __(self::LABELS[$event]) : ucfirst(str_replace(['.', '_'], ' ', $event));
    }
}
