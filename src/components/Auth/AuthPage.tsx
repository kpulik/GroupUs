import { useState } from 'react';
import { Loader2, LogIn } from 'lucide-react';

interface AuthPageProps {
  onAuthenticate: (token: string) => void;
  onAuthenticateWithOAuth: () => Promise<void> | void;
  oauthStatusMessage: string | null;
  isOAuthAuthenticating: boolean;
}

export function AuthPage({
  onAuthenticate,
  onAuthenticateWithOAuth,
  oauthStatusMessage,
  isOAuthAuthenticating,
}: AuthPageProps) {
  const [token, setToken] = useState('');
  const screenRecordingUrl = new URL('../../assets/support/groupus-screen-recording.mov', import.meta.url).href;

  const handleOAuthSignIn = () => {
    void onAuthenticateWithOAuth();
  };

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token.trim()) {
      onAuthenticate(token.trim());
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-10 border border-gray-200/50">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-500 rounded-3xl mb-6 shadow-lg">
              <LogIn className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">GroupUs</h1>
            <p className="text-gray-600 text-lg">Welcome back</p>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold tracking-wide uppercase text-gray-500 text-center">
                Recommended: Sign in with OAuth
              </p>

              <button
                onClick={handleOAuthSignIn}
                type="button"
                disabled={isOAuthAuthenticating}
                className="w-full inline-flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-4 rounded-2xl transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30"
              >
                {isOAuthAuthenticating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                {isOAuthAuthenticating ? 'Waiting for authorization...' : 'Log in with GroupMe'}
              </button>

              {oauthStatusMessage && (
                <p className="text-sm text-center text-gray-600">
                  {oauthStatusMessage}
                </p>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">Or paste your access token manually</span>
              </div>
            </div>

            <form onSubmit={handleTokenSubmit} className="space-y-4">
              <div>
                <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-2">
                  Access Token
                </label>
                <input
                  type="password"
                  id="token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Enter your GroupMe access token"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Go to https://dev.groupme.com/ after logging in, click Access Token, and paste it here.
                </p>

                <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-2 text-xs font-semibold tracking-wide uppercase text-gray-500 text-center">
                    Access Token Walkthrough
                  </p>
                  <video
                    className="w-full rounded-xl border border-gray-200 bg-black"
                    src={screenRecordingUrl}
                    controls
                    muted
                    loop
                    autoPlay
                    playsInline
                    preload="metadata"
                  >
                    Your browser does not support embedded video playback.
                  </video>
                </div>
              </div>
              <button
                type="submit"
                disabled={!token.trim()}
                className="w-full bg-gray-800 hover:bg-gray-900 text-white font-semibold py-3 px-6 rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                Sign In
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-sm text-gray-600 mt-6">
          This is an unofficial GroupUs desktop client for GroupMe
        </p>
      </div>
    </div>
  );
}
