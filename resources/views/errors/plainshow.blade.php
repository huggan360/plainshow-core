{{-- PlainShow's error pages come from the UI kit (ui/errors); the server's installed copy wins. --}}
@php($page = collect(['/srv/plainshow/errors/'.$code.'.html', base_path('vendor/plainshow/kit/ui/errors/'.$code.'.html')])->first(fn ($file) => is_readable($file)))
{!! $page ? file_get_contents($page) : e('Error '.$code) !!}
