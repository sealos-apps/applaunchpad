'use client';

import { useState, useEffect, useRef } from 'react';
import { InsufficientQuotaDialogView } from '@labring/sealos-shared-sdk/shadcn';
import { useQuotaStore } from '@labring/sealos-shared-sdk';
import { useQuotaGuardConfig } from '@labring/sealos-shared-sdk';
import type { SupportedLang } from '@labring/sealos-shared-sdk';

export interface InsufficientQuotaDialogProps {
  /** Language for dialog content */
  lang: SupportedLang;
  /** Reuse host configuration already loaded by the application. */
  subscriptionEnabled?: boolean;
}

/**
 * Dialog component shown when quota is exceeded.
 *
 * @param props - Component props
 */
export function InsufficientQuotaDialog({
  lang,
  subscriptionEnabled: hostSubscriptionEnabled
}: InsufficientQuotaDialogProps) {
  const quotaStore = useQuotaStore();
  const { sealosApp } = useQuotaGuardConfig();
  const [subscriptionEnabled, setSubscriptionEnabled] = useState(true);
  const isMountedRef = useRef(true);
  const currentSealosAppRef = useRef(sealosApp);

  useEffect(() => {
    if (hostSubscriptionEnabled !== undefined) return;

    currentSealosAppRef.current = sealosApp;

    if (!sealosApp) {
      setSubscriptionEnabled(true);
      return;
    }

    isMountedRef.current = true;
    const currentSealosApp = sealosApp;

    // [TODO]: Temporary workaround - ignore stale responses when sealosApp instance changes.
    // [FIXME]: SDK should always use the same instance. When re-initializing, the old instance
    //          gets destroyed but pending requests still wait for responses, causing timeouts.
    //          Should be fixed in init code (src/pages/_app.tsx) to reuse the same instance.
    sealosApp
      .getHostConfig()
      .then((config) => {
        if (!isMountedRef.current || currentSealosAppRef.current !== currentSealosApp) {
          return;
        }
        setSubscriptionEnabled(config.features.subscription);
      })
      .catch(() => {
        if (!isMountedRef.current || currentSealosAppRef.current !== currentSealosApp) {
          return;
        }
        setSubscriptionEnabled(true);
      });

    return () => {
      isMountedRef.current = false;
    };
  }, [sealosApp, hostSubscriptionEnabled]);

  const handleOpenCostcenter = () => {
    if (!sealosApp) return;
    sealosApp.runEvents('openDesktopApp', {
      appKey: 'system-costcenter',
      pathname: '/',
      query: {
        mode: 'upgrade'
      },
      messageData: {
        type: 'InternalAppCall',
        mode: 'upgrade'
      }
    });
  };

  const openTicketsApp = () => {
    if (!sealosApp) return;
    sealosApp.runEvents('openDesktopApp', {
      appKey: 'system-workorder',
      pathname: '/'
    });
  };

  return (
    <InsufficientQuotaDialogView
      onOpenCostCenter={handleOpenCostcenter}
      onOpenTickets={openTicketsApp}
      subscriptionEnabled={hostSubscriptionEnabled ?? subscriptionEnabled}
      items={quotaStore.exceededQuotas}
      open={quotaStore.exceededPromptOpen}
      onOpenChange={quotaStore.setExceededPromptOpen}
      showControls={quotaStore.showExceededPromptControls}
      showRequirements={quotaStore.showRequirements}
      lang={lang}
      disallowClosing={quotaStore.disallowClosing}
      onConfirm={
        quotaStore.exceededPromptCallback
          ? () => {
              quotaStore.exceededPromptCallback!();
              quotaStore.setExceededPromptOpen(false);
            }
          : () => {
              quotaStore.setExceededPromptOpen(false);
            }
      }
    />
  );
}
