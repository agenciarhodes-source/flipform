'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';

/**
 * Ends the session. Logout only accepts POST, so it cannot be a plain link:
 * opening the address in the browser would be refused with HTTP 405.
 */
export function LogoutButton({ redirectTo, className, children }: {
  redirectTo: string;
  className?: string;
  children: ReactNode;
}) {
  const [leaving, setLeaving] = useState(false);

  const onLogout = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      // A full navigation so no page rendered for the old session stays on screen.
      window.location.assign(redirectTo);
    }
  };

  return (
    <button type="button" onClick={() => void onLogout()} disabled={leaving} className={className}>
      {children}
    </button>
  );
}
