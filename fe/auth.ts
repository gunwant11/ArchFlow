import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "./db"
import { users, accounts, sessions, verificationTokens } from "./db/schema"

// Log environment variables (without exposing secrets)
console.log('[Auth] Configuration check:', {
  hasSecret: !!process.env.NEXTAUTH_SECRET,
  hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
  hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
  googleClientIdPrefix: process.env.GOOGLE_CLIENT_ID?.substring(0, 10) + '...',
})

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: {
    strategy: 'database' as const, // Use database sessions with adapter
  },
  pages: {
    signIn: '/auth/signin',
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  // Add NEXTAUTH_URL for proper redirects
  ...(process.env.NEXTAUTH_URL && { url: process.env.NEXTAUTH_URL }),
  callbacks: {
    async signIn({ user, account, profile }: any) {
      console.log('[Auth] signIn callback:', {
        userId: user?.id,
        email: user?.email,
        name: user?.name,
        provider: account?.provider,
        accountId: account?.providerAccountId,
      })
      return true
    },
    async session({ session, user }: { session: any; user: any }) {
      console.log('[Auth] session callback:', {
        sessionUser: session?.user?.email,
        userId: user?.id,
        hasUser: !!user,
      })
      if (session.user && user) {
        session.user.id = user.id
      }
      return session
    },
  },
}

export default NextAuth(authOptions)

