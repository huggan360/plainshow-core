<?php

namespace App\Support;

final class RoleAccess
{
    public static function resolve(string $role, array $extensions, array $accessOverrides, array $rolePatterns, array $capabilityOverrides): array
    {
        $role = trim($role) !== '' ? $role : 'guest';
        $services = [];
        foreach ($extensions as $extension) {
            if (! $extension['enabled']) {
                continue;
            }
            $override = $accessOverrides[$extension['id']] ?? null;
            if ($override === 'deny') {
                continue;
            }
            if ($role === 'admin' || $override === 'allow' || in_array($role, $extension['default_access'], true)) {
                $services[] = $extension['id'];
            }
        }
        if ($role === 'admin') {
            return ['services' => $services, 'capabilities' => ['*']];
        }
        $capabilities = $rolePatterns;
        foreach ($capabilityOverrides as $capability => $effect) {
            if ($effect === 'allow') {
                $capabilities[] = $capability;
            }
        }
        $denied = array_keys(array_filter($capabilityOverrides, fn ($effect) => $effect === 'deny'));
        $capabilities = array_values(array_unique(array_filter($capabilities, function (string $capability) use ($denied, $services): bool {
            if (in_array($capability, $denied, true)) {
                return false;
            }
            $extension = strstr($capability, '.', true);
            return $extension === false || $extension === '*' || $extension === 'core' || in_array($extension, $services, true);
        })));

        return ['services' => $services, 'capabilities' => $capabilities];
    }
}
