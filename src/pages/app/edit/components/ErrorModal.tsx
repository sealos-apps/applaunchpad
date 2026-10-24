import { useQuery } from '@tanstack/react-query';
import { GET } from '@/services/request';
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@labring/sealos-ui/dialog';
import { Button } from '@labring/sealos-ui/button';
import { useTranslation } from 'next-i18next';
import { ResponseCode } from '@/types/response';
import { sealosApp } from '@labring/sealos-desktop-sdk/app';
import { TriangleAlert } from 'lucide-react';

const ErrorModal = ({
  title,
  content,
  onClose,
  errorCode
}: {
  title: string;
  content: string;
  onClose: () => void;
  errorCode?: ResponseCode;
}) => {
  const { t } = useTranslation();
  const { data: payment } = useQuery(
    ['payment-config'],
    () => GET<{ paymentEnabled: boolean }>('/api/platform/paymentConfig'),
    { retry: false }
  );
  const canRecharge = errorCode === ResponseCode.BALANCE_NOT_ENOUGH && payment?.paymentEnabled;

  const openCostCenterApp = () => {
    sealosApp.runEvents('openDesktopApp', {
      appKey: 'system-costcenter',
      query: {
        openRecharge: 'true'
      }
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[360px] text-foreground top-20 left-1/2 -translate-x-1/2 translate-y-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold leading-none">
            <TriangleAlert className="h-4 w-4 text-yellow-600" />
            {t(title)}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-auto whitespace-pre-wrap text-sm">{content}</div>

        <DialogFooter>
          <Button
            variant="outline"
            size="lg"
            className="shadow-none hover:bg-zinc-50"
            onClick={onClose}
          >
            {t('Cancel')}
          </Button>
          <Button
            size="lg"
            className="shadow-none"
            onClick={() => {
              if (canRecharge) {
                openCostCenterApp();
              }
              onClose();
            }}
          >
            {canRecharge ? t('add_credit') : t('Confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ErrorModal;
