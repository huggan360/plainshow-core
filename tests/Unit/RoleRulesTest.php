<?php

namespace Tests\Unit;

use App\Http\Controllers\Admin\PermissionsController;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class RoleRulesTest extends TestCase
{
    private const KNOWN = ['core.dashboard.use', 'core.audit.view', 'blog.post.view', 'blog.post.create', 'split.group.create', 'latex.project.view'];

    private function compact(array $old, array $wanted): array
    {
        return (new ReflectionMethod(PermissionsController::class, 'compact'))->invoke(null, $old, $wanted, self::KNOWN);
    }

    public function test_a_wildcard_stays_while_everything_it_covers_is_wanted(): void
    {
        $this->assertSame(['*.view', 'core.dashboard.use'], $this->compact(['*.view', 'core.dashboard.use'], ['blog.post.view', 'latex.project.view', 'core.dashboard.use']));
    }

    public function test_unticking_one_capability_spells_the_rest_out(): void
    {
        $this->assertSame(['core.dashboard.use', 'blog.post.create'], $this->compact(['*.create', 'core.dashboard.use'], ['core.dashboard.use', 'blog.post.create']));
    }

    public function test_wildcards_never_grant_core_capabilities(): void
    {
        $this->assertNotContains('core.audit.view', \PlainShow\Kit\Access::expand(['*.view'], self::KNOWN));
    }
}
