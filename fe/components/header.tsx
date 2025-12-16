'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutGrid, Search, Menu, LogIn, User } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';

export function Header() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const loading = status === 'loading';

  const handleSignIn = () => {
    router.push('/auth/signin?callbackUrl=' + encodeURIComponent(window.location.href));
  };

  const handleSignOut = () => {
    signOut();
  };

  return (
    <header className="h-14 border-b border-white/5 bg-[#0B0C0E] flex items-center justify-between px-4 shrink-0 z-50">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-600 rounded flex items-center justify-center">
          <LayoutGrid className="text-white w-5 h-5" />
        </div>
        <span className="font-semibold text-lg tracking-tight text-white">ArchFlow.ai</span>
      </div>

      <div className="flex items-center gap-4 text-white/60">
        <button className="hover:text-white transition-colors">
          <Search className="w-5 h-5" />
        </button>
        {!loading && (
          <>
            {session?.user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-white/80">
                  {session.user.image ? (
                    <img
                      src={session.user.image}
                      alt={session.user.name || 'User'}
                      className="w-7 h-7 rounded-full"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center">
                      <User className="w-4 h-4 text-cyan-400" />
                    </div>
                  )}
                  <span className="text-sm text-white/90">{session.user.name || session.user.email}</span>
                </div>
                <Button
                  onClick={handleSignOut}
                  variant="outline"
                  className="h-8 px-3 text-xs bg-transparent border-white/10 text-white/80 hover:bg-white/10 hover:text-white"
                >
                  Sign Out
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleSignIn}
                className="h-8 px-4 text-xs bg-cyan-500 hover:bg-cyan-600 text-white border-cyan-500 flex items-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </Button>
            )}
          </>
        )}
        <button className="hover:text-white transition-colors">
          <Menu className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

