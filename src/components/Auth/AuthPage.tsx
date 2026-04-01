import { useState } from 'react';
import { LogIn } from 'lucide-react';

interface AuthPageProps {
  onAuthenticate: (token: string) => void;
}

export function AuthPage({ onAuthenticate }: AuthPageProps) {
  const [token, setToken] = useState('');

  const handleSignIn = () => {
    window.open('https://dev.groupme.com/', '_blank');
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
            <h1 className="text-4xl font-bold text-gray-900 mb-2">GroupMe</h1>
            <p className="text-gray-600 text-lg">Welcome back</p>
          </div>

          <div className="space-y-6">
            <div>
              <p className="mb-3 text-xs font-semibold tracking-wide uppercase text-gray-500 text-center">
                Step 1
              </p>
              <button
                onClick={handleSignIn}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-500/30"
              >
                Open GroupMe Developer Portal
              </button>
              <p className="mt-4 text-sm text-gray-600 text-center">
                Log in there and copy your Access Token
              </p>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">Step 2: Paste your access token below</span>
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
          This is an unofficial GroupMe desktop client
        </p>
      </div>
    </div>
  );
}
