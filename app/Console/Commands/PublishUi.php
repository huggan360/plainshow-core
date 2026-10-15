<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

/** Copies the PlainShow UI kit's built assets into public/ui. */
class PublishUi extends Command
{
    protected $signature = 'plainshow:ui';

    protected $description = 'Publish the PlainShow UI kit assets to public/ui';

    public function handle(): int
    {
        $source = base_path('vendor/plainshow/kit/ui');
        if (! is_dir($source)) {
            $this->error('The PlainShow kit is not installed.');

            return self::FAILURE;
        }
        $target = public_path('ui');
        File::deleteDirectory($target);
        foreach (['css', 'fonts', 'js', 'brand'] as $directory) {
            File::copyDirectory("$source/$directory", "$target/$directory");
        }
        $this->info('PlainShow UI published.');

        return self::SUCCESS;
    }
}
