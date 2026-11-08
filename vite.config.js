import { defineConfig, loadEnv } from 'vite';

function spotifyOAuthMiddlewarePlugin() {
  let envVars = {};

  const attachRoutes = (middlewares) => {
    middlewares.use(async (req, res, next) => {
      if (!req.url) return next();
      const parsedUrl = new URL(req.url, 'http://localhost:3000');
      const pathname = parsedUrl.pathname;

      // 1. Construct Spotify OAuth Authorization URL
      if (pathname === '/api/spotify/auth/url' || pathname === '/api/auth/url') {
        const clientId =
          parsedUrl.searchParams.get('client_id') ||
          process.env.SPOTIFY_CLIENT_ID ||
          process.env.VITE_SPOTIFY_CLIENT_ID ||
          process.env.CLIENT_ID ||
          envVars.SPOTIFY_CLIENT_ID ||
          envVars.VITE_SPOTIFY_CLIENT_ID ||
          envVars.CLIENT_ID ||
          '';

        const appUrl = (process.env.APP_URL || envVars.APP_URL || '').replace(/\/$/, '');
        const redirectUri =
          parsedUrl.searchParams.get('redirect_uri') ||
          (appUrl ? `${appUrl}/auth/callback` : 'http://localhost:3000/auth/callback');

        const codeChallenge = parsedUrl.searchParams.get('code_challenge') || '';
        const state = parsedUrl.searchParams.get('state') || 'paceplot_spotify_auth';

        const scopes = [
          'user-read-playback-state',
          'user-modify-playback-state',
          'user-read-currently-playing',
          'playlist-read-private',
          'playlist-read-collaborative',
          'streaming'
        ].join(' ');

        const params = new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: redirectUri,
          scope: scopes,
          state,
          show_dialog: 'true'
        });

        if (codeChallenge) {
          params.set('code_challenge_method', 'S256');
          params.set('code_challenge', codeChallenge);
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            configured: Boolean(clientId),
            url: clientId ? `https://accounts.spotify.com/authorize?${params.toString()}` : null,
            redirectUri
          })
        );
        return;
      }

      // 2. Server-side Token Exchange / Refresh Endpoint
      if (pathname === '/api/spotify/token' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const clientId =
              payload.clientId ||
              process.env.SPOTIFY_CLIENT_ID ||
              process.env.VITE_SPOTIFY_CLIENT_ID ||
              process.env.CLIENT_ID ||
              envVars.SPOTIFY_CLIENT_ID ||
              envVars.VITE_SPOTIFY_CLIENT_ID ||
              '';
            const clientSecret =
              process.env.SPOTIFY_CLIENT_SECRET ||
              process.env.CLIENT_SECRET ||
              envVars.SPOTIFY_CLIENT_SECRET ||
              envVars.CLIENT_SECRET ||
              '';

            const tokenParams = new URLSearchParams();
            if (payload.grantType === 'refresh_token') {
              tokenParams.set('grant_type', 'refresh_token');
              tokenParams.set('refresh_token', payload.refreshToken || '');
              tokenParams.set('client_id', clientId);
            } else {
              tokenParams.set('grant_type', 'authorization_code');
              tokenParams.set('code', payload.code || '');
              tokenParams.set('redirect_uri', payload.redirectUri || '');
              tokenParams.set('client_id', clientId);
              if (payload.codeVerifier) {
                tokenParams.set('code_verifier', payload.codeVerifier);
              }
            }

            const headers = {
              'Content-Type': 'application/x-www-form-urlencoded'
            };
            if (clientSecret && !payload.codeVerifier) {
              headers['Authorization'] =
                'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
            }

            const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
              method: 'POST',
              headers,
              body: tokenParams.toString()
            });
            const tokenData = await tokenRes.json();
            res.statusCode = tokenRes.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(tokenData));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'token_exchange_failed', message: String(err) }));
          }
        });
        return;
      }

      // 3. OAuth Callback Handler (/auth/callback and /auth/callback/)
      if (pathname === '/auth/callback' || pathname === '/auth/callback/') {
        const code = parsedUrl.searchParams.get('code') || '';
        const state = parsedUrl.searchParams.get('state') || '';
        const error = parsedUrl.searchParams.get('error') || '';

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Spotify Connected · Pace Plot</title>
    <style>
      body {
        background: #0c0a09;
        color: #f5f5f4;
        font-family: system-ui, -apple-system, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
        text-align: center;
      }
      .card {
        background: #1c1917;
        border: 1px solid #292524;
        border-radius: 20px;
        padding: 28px;
        max-width: 340px;
      }
      .badge {
        color: #1DB954;
        font-weight: 700;
        font-size: 14px;
        margin-bottom: 8px;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">${error ? 'Spotify Connection Cancelled' : 'Spotify Connected'}</div>
      <p style="font-size: 13px; color: #a8a29e; margin: 0;">
        ${error ? 'Returning to Pace Plot...' : 'Authentication successful. Syncing your running playlists...'}
      </p>
    </div>
    <script>
      (function() {
        var payload = {
          type: ${JSON.stringify(error ? 'OAUTH_AUTH_ERROR' : 'OAUTH_AUTH_SUCCESS')},
          provider: 'spotify',
          code: ${JSON.stringify(code)},
          state: ${JSON.stringify(state)},
          error: ${JSON.stringify(error)}
        };
        if (window.opener) {
          window.opener.postMessage(payload, '*');
          setTimeout(function() { window.close(); }, 250);
        } else {
          window.location.href = '/';
        }
      })();
    </script>
  </body>
</html>`);
        return;
      }

      next();
    });
  };

  return {
    name: 'spotify-oauth-middleware',
    configResolved(config) {
      envVars = loadEnv(config.mode, process.cwd(), '');
    },
    configureServer(server) {
      attachRoutes(server.middlewares);
    },
    configurePreviewServer(server) {
      attachRoutes(server.middlewares);
    }
  };
}

export default defineConfig({
  plugins: [spotifyOAuthMiddlewarePlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
});

