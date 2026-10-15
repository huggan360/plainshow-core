<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Sso;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use PlainShow\Kit\KitException;
use PlainShow\Kit\OidcClient;

/** Core signs in through login.plainshow.se like every other app. */
class SsoController extends Controller
{
    public function login(Request $request): RedirectResponse
    {
        $return = OidcClient::safeReturnPath($request->query('return') ?? session('url.intended_path'), '/');
        if (Auth::check()) {
            return redirect($return);
        }
        $state = ['ps_oidc' => $request->session()->get('ps_oidc', [])];
        $url = Sso::client()->authorizationUrl($state, $return);
        $request->session()->put('ps_oidc', $state['ps_oidc']);

        return redirect()->away($url);
    }

    public function callback(Request $request): RedirectResponse|Response
    {
        $state = ['ps_oidc' => $request->session()->get('ps_oidc', [])];
        try {
            $result = Sso::client()->handleCallback($state, $request->query());
        } catch (KitException $error) {
            $request->session()->put('ps_oidc', $state['ps_oidc']);

            return Inertia::render('Problem', ['title' => 'Sign-in did not finish', 'message' => $error->getMessage()])->toResponse($request)->setStatusCode(400);
        }
        $request->session()->put('ps_oidc', $state['ps_oidc']);

        $user = User::find($result['identity']->id());
        if (! $user || ! $user->isActive()) {
            return Inertia::render('Problem', ['title' => 'Account unavailable', 'message' => 'This account is disabled. Ask an administrator.'])->toResponse($request)->setStatusCode(403);
        }

        Auth::login($user);
        $request->session()->regenerate();
        $request->session()->put('ps_login_at', time());

        return redirect(OidcClient::safeReturnPath($result['return_to']));
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->away(Sso::client()->logoutUrl(rtrim((string) config('app.url'), '/').'/'));
    }

    /** Loaded in a hidden frame by login when someone signs out everywhere. */
    public function frontchannel(Request $request): Response
    {
        if (rtrim((string) $request->query('iss'), '/') === rtrim((string) config('plainshow.login_url'), '/')) {
            Auth::logout();
            $request->session()->invalidate();
        }

        return response('Signed out.', 200, [
            'Content-Type' => 'text/plain; charset=utf-8',
            'Cache-Control' => 'no-store',
            'Content-Security-Policy' => 'frame-ancestors '.rtrim((string) config('plainshow.login_url'), '/'),
        ]);
    }
}
