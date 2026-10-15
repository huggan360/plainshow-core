<?php

namespace App\Http\Middleware;

use App\Models\User;
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
    public function handle(Request $request, Closure $next): Response
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
        $request->attributes->set('token_scopes', (array) ($claims['scopes'] ?? []));

        return $next($request);
    }

    private function deny(string $message): Response
    {
        return response()->json(['error' => 'unauthorized', 'message' => $message], 401, ['WWW-Authenticate' => 'Bearer']);
    }
}
