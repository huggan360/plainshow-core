<?php

namespace App\Console\Commands;

use App\Support\Registry;
use Illuminate\Console\Command;

class SyncExtensions extends Command
{
    protected $signature = 'plainshow:extensions';

    protected $description = 'Load extension manifests into the platform tables';

    public function handle(): int
    {
        foreach (Registry::sync() as $change) {
            $this->line($change);
        }

        return self::SUCCESS;
    }
}
