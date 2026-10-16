<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\ApiTokens;
use App\Support\Sso;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use PlainShow\Kit\KitException;
use Symfony\Component\HttpFoundation\Response;

/**
 * API requests carry an access token from login.plainshow.se. It is
 * verified locally against the published keys, then checked against
 * revocation, so a signed-out or disabled account is refused at once.
 */
class AuthenticateBearer
{
    /** With `core`, personal tokens must carry the core scope (the gateway checks other services itself). */
    public function handle(Request $request, Closure $next, ?string $service = null): Response
    {
        $token = $request->bearerToken();
        if (! $token) {
            return $this->deny('Missing bearer token.');
        }
        try {
            $claims = Sso::client()->verifyAccessToken($token);
        } catch (KitException $error) {
            return $this->deny($error->getMessage());
        }

        $revoked = DB::table('oauth_access_tokens')->where('id', $claims['jti'] ?? '')->value('revoked');
        $user = User::find($claims['sub'] ?? 0);
        if ($revoked === null || $revoked || ! $user || ! $user->isActive()) {
            return $this->deny('Token is no longer valid.');
        }
        Auth::setUser($user);
        $scopes = array_values(array_map('strval', (array) ($claims['scopes'] ?? [])));
        $request->attributes->set('token_scopes', $scopes);
        if ($service !== null && ApiTokens::isPersonal($scopes)) {
            if (! in_array($service, $scopes, true)) {
                return response()->json(['error' => 'insufficient_scope', 'message' => 'This token does not reach this service.'], 403);
            }
            if (in_array('read-only', $scopes, true) && ! in_array($request->method(), ['GET', 'HEAD'], true)) {
                return response()->json(['error' => 'read_only', 'message' => 'This token can only read.'], 403);
            }
        }

        return $next($request);
    }

    private function deny(string $message): Response
    {
        return response()->json(['error' => 'unauthorized', 'message' => $message], 401, ['WWW-Authenticate' => 'Bearer']);
    }
}
