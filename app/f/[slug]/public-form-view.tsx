'use client';
import { useEffect, useRef } from 'react';
import { PublicTypeform } from '@/components/public-typeform';
import { buildPublicAttribution, ensureMetaFbcCookie } from '@/lib/attribution';
import { fireMetaLeadPixel, initializeMetaPixel, type PublicFormSubmitResponse } from '@/lib/tracking/meta-pixel-client';
import { firePublicGtmLeadEvent, loadPublicGtmContainer } from '@/lib/tracking/gtm-client';

export function PublicFormView({
  form,
  gtmContainerId,
  metaPixelId,
}: {
  form: any;
  gtmContainerId?: string | null;
  metaPixelId?: string | null;
}) {
  const openedAtMs = useRef(0);
  // Hidden field people never see (security protocol S4): only robots fill it.
  const honeypot = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!openedAtMs.current) openedAtMs.current = Date.now();
    ensureMetaFbcCookie(window.location.href, openedAtMs.current);
    initializeMetaPixel(metaPixelId);
    loadPublicGtmContainer(gtmContainerId);
  }, [gtmContainerId, metaPixelId]);

  const submit = async (answers: any) => {
    // Keep the click cookie available even if the user submits before the initial
    // tracking scripts finish loading. This does not depend on Meta's script.
    ensureMetaFbcCookie(window.location.href, openedAtMs.current || Date.now());

    let res: Response;
    try {
      res = await fetch(`/api/public/forms/${form.slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          attribution: buildPublicAttribution(window.location.href, document.referrer),
          guard: {
            hp: honeypot.current?.value || '',
            elapsedMs: openedAtMs.current ? Math.max(0, Date.now() - openedAtMs.current) : undefined,
          },
        }),
      });
    } catch {
      throw new Error('Falha de rede. Verifique sua conexão e tente novamente.');
    }
    if (!res.ok) {
      let msg = 'Não foi possível enviar suas respostas. Tente novamente.';
      try {
        const data = await res.json();
        if (data?.error) msg = data.error;
      } catch {}
      throw new Error(msg);
    }
    const result: PublicFormSubmitResponse = await res.json();
    if (result.qualified === true) {
      firePublicGtmLeadEvent(gtmContainerId);
    }
    if (result.qualified === true && result.tracking?.meta) {
      fireMetaLeadPixel(result.tracking.meta);
    }
    return result;
  };
  return (
    <div className="min-h-screen">
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
        <label htmlFor="ff-contact-confirmation">Deixe este campo em branco</label>
        <input id="ff-contact-confirmation" name="ff_contact_confirmation" type="text" ref={honeypot} tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <PublicTypeform form={form} onSubmit={submit} />
    </div>
  );
}
