<?php

namespace App\Http\Controllers;

use App\Models\Extension;
use Inertia\Inertia;
use Inertia\Response;

/** plainshow.se/api: how to call PlainShow, from each service's OpenAPI description. */
class ApiDocsController extends Controller
{
    private const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

    public function __invoke(): Response
    {
        $services = [];
        foreach (Extension::where('enabled', true)->orderBy('sort')->get() as $extension) {
            if ($extension->id !== 'core' && empty($extension->manifest['api'])) {
                continue;
            }
            $spec = GatewayController::spec($extension->id);
            if ($spec === null) {
                continue;
            }
            $services[] = [
                'id' => $extension->id,
                'name' => $extension->name,
                'icon' => $extension->icon,
                'description' => (string) ($spec['info']['description'] ?? $extension->description),
                'base' => url('/api/'.$extension->id.'/v1'),
                'spec' => url('/api/'.$extension->id.'/openapi.json'),
                'endpoints' => $this->endpoints($spec),
            ];
        }

        return Inertia::render('ApiDocs', ['services' => $services]);
    }

    private function endpoints(array $spec): array
    {
        $endpoints = [];
        foreach ((array) ($spec['paths'] ?? []) as $path => $operations) {
            foreach (self::METHODS as $method) {
                $operation = $operations[$method] ?? null;
                if (! is_array($operation) || ($operation['x-internal'] ?? false)) {
                    continue;
                }
                $endpoints[] = [
                    'method' => strtoupper($method),
                    'path' => (string) $path,
                    'summary' => (string) ($operation['summary'] ?? ''),
                    'description' => (string) ($operation['description'] ?? ''),
                    'capability' => $operation['x-capability'] ?? null,
                    'public' => ($operation['security'] ?? null) === [],
                    'parameters' => array_values(array_map(fn ($parameter) => [
                        'name' => (string) ($parameter['name'] ?? ''),
                        'in' => (string) ($parameter['in'] ?? ''),
                        'required' => (bool) ($parameter['required'] ?? false),
                        'description' => (string) ($parameter['description'] ?? ''),
                    ], array_filter((array) ($operation['parameters'] ?? []), 'is_array'))),
                    'body' => $this->body($operation['requestBody'] ?? null),
                ];
            }
        }

        return $endpoints;
    }

    private function body(mixed $body): ?array
    {
        if (! is_array($body)) {
            return null;
        }
        $content = (array) ($body['content'] ?? []);
        $type = (string) array_key_first($content);
        $schema = (array) ($content[$type]['schema'] ?? []);
        $required = (array) ($schema['required'] ?? []);

        return [
            'type' => $type,
            'fields' => array_values(array_map(fn ($name, $field) => [
                'name' => (string) $name,
                'type' => (string) ($field['type'] ?? 'string'),
                'required' => in_array($name, $required, true),
                'description' => (string) ($field['description'] ?? ''),
            ], array_keys((array) ($schema['properties'] ?? [])), (array) ($schema['properties'] ?? []))),
        ];
    }
}
