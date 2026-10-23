<?php

namespace App\Http\Controllers;

use App\Support\ApiTokens;
use App\Support\AccountLifecycle;
use App\Support\Audit;
use App\Support\Avatars;
use App\Support\Permissions;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use PragmaRX\Google2FA\Google2FA;
use RuntimeException;

/** One account page for the whole platform: profile, security and API tokens. */
class AccountController extends Controller
{
    public function show(Request $request, string $section = 'profile'): Response
    {
        abort_unless(in_array($section, ['profile', 'security', 'tokens'], true), 404);
        abort_if($section === 'tokens' && ! Permissions::can($request->user(), 'core.api.use'), 404);
        $user = $request->user();
        return Inertia::render('Account', [
            'section' => $section,
            'profile' => [
                'username' => $user->username,
                'firstName' => $user->first_name,
                'lastName' => $user->last_name,
                'email' => $user->email,
                'phone' => $user->phone,
                'avatar' => $user->avatarUrl(),
                'initials' => $user->initials(),
                'role' => $user->role,
                'groups' => DB::table('core_group_members as member')
                    ->join('core_groups as groups', 'groups.id', '=', 'member.group_id')
                    ->where('member.user_id', $user->id)->orderBy('groups.name')->pluck('groups.name')->all(),
            ],
            'security' => [
                'twoFactor' => $user->hasTwoFactor(),
                'recoveryCodesLeft' => count($user->two_factor_recovery_codes ?? []),
                'passwordChangedAt' => $user->password_changed_at?->toIso8601String(),
                'lastLoginAt' => $user->last_login_at?->toIso8601String(),
                'enrollment' => $request->session()->has('two_factor.pending') ? $this->enrollment($request) : null,
                'recoveryCodes' => $request->session()->get('two_factor.codes'),
            ],
            'apiAccess' => Permissions::can($user, 'core.api.use'),
            'tokens' => $section === 'tokens' ? $this->tokens($request) : null,
        ]);
    }

    public function updateProfile(Request $request): RedirectResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'firstName' => ['required', 'string', 'max:60'],
            'lastName' => ['nullable', 'string', 'max:60'],
            'email' => ['nullable', 'email:rfc', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:32', 'regex:/^[0-9+ ()-]*$/'],
        ]);
        $user->forceFill([
            'first_name' => trim($data['firstName']),
            'last_name' => trim((string) ($data['lastName'] ?? '')),
            'email' => isset($data['email']) ? mb_strtolower(trim($data['email'])) : null,
            'phone' => $data['phone'] ?? null,
        ])->save();
        Audit::record('profile.updated');

        return back()->with('status', __('Profile saved.'));
    }

    public function updateAvatar(Request $request): RedirectResponse
    {
        $request->validate(['avatar' => ['required', 'file', 'max:12288', 'mimetypes:image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif']]);
        try {
            Avatars::store($request->user(), (string) file_get_contents($request->file('avatar')->getRealPath()));
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['avatar' => $error->getMessage()]);
        }
        Audit::record('avatar.updated');

        return back()->with('status', __('Profile picture updated.'));
    }

    public function removeAvatar(Request $request): RedirectResponse
    {
        Avatars::remove($request->user());
        Audit::record('avatar.removed');

        return back()->with('status', __('Profile picture removed.'));
    }

    public function updatePassword(Request $request): RedirectResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'current' => ['required', 'string', 'max:512'],
            'password' => ['required', 'confirmed', 'max:512', Password::min(10)->letters()->uncompromised(0)],
        ]);
        if (! Hash::check($data['current'], $user->password)) {
            throw ValidationException::withMessages(['current' => __('That is not your current password.')]);
        }
        if (Permissions::hasService($user, 'web')) {
            AccountLifecycle::pi($user, 'password', $data['password']);
        }
        $user->forceFill(['password' => $data['password'], 'password_changed_at' => now()])->save();
        $this->endOtherSessions($request);
        Audit::record('password.changed');

        return back()->with('status', __('Password changed. Other devices were signed out.'));
    }

    public function startTwoFactor(Request $request, Google2FA $google2fa): RedirectResponse
    {
        abort_if($request->user()->hasTwoFactor(), 409);
        $request->session()->put('two_factor.pending', $google2fa->generateSecretKey(32));

        return back();
    }

    public function confirmTwoFactor(Request $request, Google2FA $google2fa): RedirectResponse
    {
        $secret = $request->session()->get('two_factor.pending');
        abort_unless(is_string($secret), 409);
        $data = $request->validate(['code' => ['required', 'string', 'max:10']]);
        if (! $google2fa->verifyKey($secret, preg_replace('/\s+/', '', $data['code']), 1)) {
            throw ValidationException::withMessages(['code' => __('That code is not valid. Check the time on your phone and try again.')]);
        }
        $codes = $this->newRecoveryCodes();
        $request->user()->forceFill([
            'two_factor_secret' => $secret,
            'two_factor_confirmed_at' => now(),
            'two_factor_recovery_codes' => array_map(fn ($code) => password_hash($code, PASSWORD_DEFAULT), $codes),
        ])->save();
        $request->session()->forget('two_factor.pending');
        $request->session()->flash('two_factor.codes', $codes);
        Audit::record('two_factor.enabled');

        return back()->with('status', __('Two-factor authentication is on.'));
    }

    public function cancelTwoFactor(Request $request): RedirectResponse
    {
        $request->session()->forget('two_factor.pending');

        return back();
    }

    public function disableTwoFactor(Request $request): RedirectResponse
    {
        $user = $request->user();
        $request->validate(['password' => ['required', 'string', 'max:512']]);
        if (! Hash::check($request->input('password'), $user->password)) {
            throw ValidationException::withMessages(['password' => __('That is not your password.')]);
        }
        $user->forceFill(['two_factor_secret' => null, 'two_factor_confirmed_at' => null, 'two_factor_recovery_codes' => null])->save();
        Audit::record('two_factor.disabled');

        return back()->with('status', __('Two-factor authentication is off.'));
    }

    public function regenerateRecoveryCodes(Request $request): RedirectResponse
    {
        $user = $request->user();
        abort_unless($user->hasTwoFactor(), 409);
        $codes = $this->newRecoveryCodes();
        $user->forceFill(['two_factor_recovery_codes' => array_map(fn ($code) => password_hash($code, PASSWORD_DEFAULT), $codes)])->save();
        $request->session()->flash('two_factor.codes', $codes);
        Audit::record('two_factor.recovery_regenerated');

        return back()->with('status', __('New recovery codes created. The old ones no longer work.'));
    }

    public function signOutEverywhere(Request $request): RedirectResponse
    {
        $this->endOtherSessions($request);
        Audit::record('sessions.revoked');

        return back()->with('status', __('Signed out of every other device.'));
    }

    /** Ends the user's sessions on other devices, in core and login, and revokes app tokens. */
    private function endOtherSessions(Request $request): void
    {
        $user = $request->user();
        DB::table('core_sessions')->where('user_id', $user->id)->where('id', '!=', $request->session()->getId())->delete();
        DB::table('login_sessions')->where('user_id', $user->id)->delete();
        DB::table('oauth_access_tokens')->where('user_id', $user->id)->update(['revoked' => true]);
    }

    /** @return list<string> */
    private function newRecoveryCodes(): array
    {
        return array_map(fn () => strtoupper(Str::random(5).'-'.Str::random(5)), range(1, 8));
    }

    private function enrollment(Request $request): array
    {
        $secret = (string) $request->session()->get('two_factor.pending');
        $uri = (new Google2FA)->getQRCodeUrl('PlainShow', $request->user()->username, $secret);
        $svg = (new Writer(new ImageRenderer(new RendererStyle(200, 1), new SvgImageBackEnd)))->writeString($uri);

        return ['secret' => trim(chunk_split($secret, 4, ' ')), 'qr' => 'data:image/svg+xml;base64,'.base64_encode($svg)];
    }

    /** Personal API tokens live in login; a failure there should not break the page. */
    private function tokens(Request $request): array
    {
        $services = array_values(array_intersect(ApiTokens::SERVICES, ['core', ...Permissions::for($request->user())['services']]));
        try {
            $list = ApiTokens::list($request->user());
            $error = null;
        } catch (\Throwable $failure) {
            report($failure);
            $list = [];
            $error = 'Login did not answer, so your tokens cannot be shown right now.';
        }

        // How to call each service this person can reach: its address and its description (OpenAPI).
        $apis = \App\Models\Extension::where('enabled', true)->whereIn('id', $services)->orderBy('sort')->get()
            ->filter(fn ($extension) => $extension->id === 'core' || ! empty($extension->manifest['api']))
            ->map(fn ($extension) => [
                'id' => $extension->id,
                'name' => $extension->name,
                'icon' => $extension->icon,
                'base' => url('/api/'.$extension->id.'/v1'),
                'spec' => url('/api/'.$extension->id.'/openapi.json'),
            ])->values()->all();

        return ['list' => $list, 'services' => $services, 'apis' => $apis, 'error' => $error ? __($error) : null, 'created' => $request->session()->get('api_token')];
    }

    public function createToken(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'services' => ['required', 'array', 'min:1'],
            'services.*' => ['string', \Illuminate\Validation\Rule::in(ApiTokens::SERVICES)],
            'readOnly' => ['boolean'],
        ]);
        $allowed = ['core', ...Permissions::for($request->user())['services']];
        $scopes = array_values(array_intersect($data['services'], $allowed));
        if (! $scopes) {
            return back()->with('error', 'Choose a service you can use.');
        }
        if ($request->boolean('readOnly')) {
            $scopes[] = 'read-only';
        }
        try {
            $created = ApiTokens::create($request->user(), $data['name'], $scopes);
        } catch (\Throwable $failure) {
            return back()->with('error', $failure->getMessage());
        }

        return back()->with('api_token', ['token' => $created['token'], 'name' => $data['name']])->with('status', __('Token created. Copy it now.'));
    }

    public function revokeToken(Request $request, string $token): RedirectResponse
    {
        abort_unless(preg_match('/^[a-f0-9]{80}$/', $token) === 1, 404);
        try {
            ApiTokens::revoke($request->user(), $token);
        } catch (\Throwable $failure) {
            return back()->with('error', $failure->getMessage());
        }

        return back()->with('status', __('Token revoked.'));
    }
}
