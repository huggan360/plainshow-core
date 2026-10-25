<?php

namespace Tests\Feature;

use App\Support\Assistant\When;
use DateTimeImmutable;
use DateTimeZone;
use PHPUnit\Framework\TestCase;

class AssistantWhenTest extends TestCase
{
    /** Saturday 25 October 2026, 13:00 in Stockholm. */
    private function when(): When
    {
        return new When(new DateTimeImmutable('2026-10-25 13:00', new DateTimeZone('Europe/Stockholm')));
    }

    public function test_days_in_three_languages(): void
    {
        $when = $this->when();
        $this->assertSame('2026-10-31', $when->day('saturday'), 'today is Sunday the 25th; Saturday is the 31st');
        $this->assertSame('2026-10-31', $when->day('på lördag'));
        $this->assertSame('2026-10-31', $when->day('zaterdag'));
        $this->assertSame('2026-10-25', $when->day('söndag'), 'the same weekday is today');
        $this->assertSame('2026-11-01', $when->day('next sunday'));
        $this->assertSame('2026-10-26', $when->day('imorgon'));
        $this->assertSame('2026-10-26', $when->day('i morgon'));
        $this->assertSame('2026-10-26', $when->day('morgen'));
        $this->assertSame('2026-10-27', $when->day('i övermorgon'));
        $this->assertSame('2026-10-25', $when->day('today'));
        $this->assertSame('2026-10-26', $when->day('next week'), 'next week starts on Monday');
        $this->assertSame('2026-12-24', $when->day('24 december'));
        $this->assertSame('2026-12-24', $when->day('december 24th'));
        $this->assertSame('2027-01-05', $when->day('5 januari'), 'a date that has passed this year is next year');
        $this->assertSame('2026-11-03', $when->day('3/11'));
        $this->assertSame('2026-11-07', $when->day('2026-11-07'));
        $this->assertNull($when->day(''));
        $this->assertNull($when->day('sometime'));
    }

    public function test_times(): void
    {
        $when = $this->when();
        $this->assertSame('14:00', $when->time('14'));
        $this->assertSame('14:30', $when->time('14.30'));
        $this->assertSame('09:05', $when->time('9:05'));
        $this->assertSame('14:00', $when->time('2pm'));
        $this->assertSame('00:00', $when->time('12 am'));
        $this->assertSame('18:00', $when->time('kl 18'));
        $this->assertNull($when->time('25'));
        $this->assertNull($when->time(''));
    }
}
