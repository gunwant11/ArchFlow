'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogIn } from 'lucide-react';

import { Suspense } from 'react';

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get('callbackUrl') || '/';
  const error = searchParams?.get('error');

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl });
  };

  // Optional: Auto-redirect to Google if no error (uncomment if desired)
  // useEffect(() => {
  //   if (!error) {
  //     const timer = setTimeout(() => {
  //       handleGoogleSignIn();
  //     }, 500);
  //     return () => clearTimeout(timer);
  //   }
  // }, [error]);

  return (
    <div className="min-h-screen bg-[#0B0C0E] flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="bg-[#15171B]/80 backdrop-blur-md border border-white/5 rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-semibold text-white mb-2">Welcome to Structura.ai</h1>
            <p className="text-white/60">Sign in to continue</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">
                {error === 'Configuration' && 'Authentication configuration error. Please check your settings.'}
                {error === 'AccessDenied' && 'Access denied. Please try again.'}
                {error === 'Verification' && 'Verification error. Please try again.'}
                {!['Configuration', 'AccessDenied', 'Verification'].includes(error) && 'An error occurred during sign in.'}
              </p>
            </div>
          )}

          <Button
            onClick={handleGoogleSignIn}
            className="w-full h-12 bg-cyan-500 hover:bg-cyan-600 text-white border-cyan-500 flex items-center justify-center gap-3 text-base"
            disabled={!!error}
          >
            <LogIn className="w-5 h-5" />
            {error ? 'Retry Sign In with Google' : 'Sign in with Google'}
          </Button>

          <p className="mt-6 text-center text-white/40 text-sm">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SignInContent />
    </Suspense>
  );
}

