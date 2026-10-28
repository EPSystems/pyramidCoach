import type { Metadata } from 'next';

// Sign-up is open to anyone with the link but shouldn't show up in search results (AUTH_PLAN §6 question 1).
// Applies to every auth page: /login, /signup, /signup/check-email, /forgot-password, /reset-password.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
