'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: 24 }}>
          <h2>Ocorreu um erro inesperado.</h2>
          <button onClick={() => reset()}>Tentar novamente</button>
        </div>
      </body>
    </html>
  );
}
