<?php

namespace Tests\Feature;

use Tests\TestCase;

class ExampleTest extends TestCase
{
    public function test_guests_are_sent_to_sign_in(): void
    {
        $this->get('/')->assertRedirect('/auth/login?return=%2F');
    }
}
