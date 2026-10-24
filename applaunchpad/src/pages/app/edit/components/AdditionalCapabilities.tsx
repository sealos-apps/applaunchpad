import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'next-i18next';
import type { UseFormReturn } from 'react-hook-form';
import type { AppEditType } from '@/types/app';
import { useClientAppConfig } from '@/hooks/useClientAppConfig';
import { GET, POST } from '@/services/request';
import { storageGiToQuantity, quantityToStorageGi } from '@/utils/resourceQuantity';
import { getBoundImageRegistryCredentials } from '@/utils/deployYaml2Json';
import { customAlphabet } from 'nanoid';
import { toast } from 'sonner';
import { Box, Button, Checkbox, Flex, Input, Text, Textarea } from '@chakra-ui/react';
import RouteRulesModal from './RouteRulesModal';
import NetworkStoreModal from './NetworkStoreModal';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz', 12);
export default function AdditionalCapabilities({
  formHook
}: {
  formHook: UseFormReturn<AppEditType>;
}) {
  const { t } = useTranslation();
  const config = useClientAppConfig();
  const { watch, setValue, getValues } = formHook;
  const networks = watch('networks');
  const stores = watch('networkStoreList') || [];
  const shm = watch('sharedMemory');
  const ephemeral = watch('ephemeralStorage');
  const [routeIndex, setRouteIndex] = useState<number>();
  const [storageOpen, setStorageOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const services = useQuery(
    ['backend-services', getValues('appName')],
    () =>
      GET<NonNullable<AppEditType['serviceList']>>('/api/listBackendServices', {
        appName: getValues('appName')
      }),
    { enabled: routeIndex !== undefined }
  );
  const pvcs = useQuery(
    ['shared-pvcs'],
    () =>
      GET<{ name: string; storageClassName: string; capacity: string; phase: string }[]>(
        '/api/listSharePVCs'
      ),
    { enabled: storageOpen }
  );
  const detectPorts = async () => {
    setDetecting(true);
    try {
      const app = getValues();
      const result = await POST<{ ports: { port: number; protocol: string }[] }>(
        '/api/platform/getImagePorts',
        {
          imageName: app.imageName,
          imageRegistry: getBoundImageRegistryCredentials(app.imageName, app.secret)
        }
      );
      const additions = result.ports.filter(
        (port) =>
          !app.networks.some(
            (n) => n.port === port.port && n.protocol === port.protocol.toUpperCase()
          )
      );
      setValue(
        'networks',
        [
          ...app.networks,
          ...additions.map((port) => ({
            port: port.port,
            protocol: port.protocol.toUpperCase() as 'TCP' | 'UDP',
            appProtocol: undefined,
            portName: nanoid(),
            networkName: `${app.appName}-${nanoid()}`,
            publicDomain: nanoid(),
            customDomain: '',
            domain: config.domain,
            openPublicDomain: false,
            openNodePort: false
          }))
        ],
        { shouldDirty: true }
      );
      toast.success(t('Image ports detected'));
    } catch (error) {
      toast.error(String(error));
    } finally {
      setDetecting(false);
    }
  };
  return (
    <Box borderWidth="1px" borderRadius="lg" p={8} bg="white">
      <Text fontSize="xl" fontWeight={500} mb={4}>
        {t('Additional configuration')}
      </Text>
      {config.imagePorts?.enabled && (
        <Button onClick={detectPorts} isLoading={detecting} mb={4}>
          {t('Detect image ports')}
        </Button>
      )}
      {networks.map((network, index) => (
        <Flex key={`${network.portName}-${index}`} gap={3} mb={3} align="center" wrap="wrap">
          <Text>
            {network.port}/{network.protocol}
          </Text>
          {!network.openNodePort && (
            <Button size="sm" onClick={() => setRouteIndex(index)}>
              {t('Path routing')}
            </Button>
          )}
          {!!config.nodePortHost && (
            <Checkbox
              isChecked={network.openNodePort}
              onChange={(event) => {
                setValue(`networks.${index}.serviceName`, undefined, { shouldDirty: true });
                setValue(`networks.${index}.openNodePort`, event.target.checked, {
                  shouldDirty: true
                });
                if (event.target.checked)
                  setValue(`networks.${index}.openPublicDomain`, false, { shouldDirty: true });
              }}
            >
              {t('NodePort access')}
            </Checkbox>
          )}
          {config.publicDomain?.customPrefixEnabled &&
            network.openPublicDomain &&
            !network.customDomain && (
              <Input
                aria-label={t('Public domain prefix')}
                maxW="240px"
                value={network.publicDomain}
                onChange={(event) =>
                  setValue(`networks.${index}.publicDomain`, event.target.value, {
                    shouldDirty: true
                  })
                }
              />
            )}
        </Flex>
      ))}
      {(config.networkStorageEnabled || stores.length > 0) && (
        <Box mt={5}>
          <Text fontWeight={500}>{t('Network storage')}</Text>
          {stores.map((store, index) => (
            <Flex key={`${store.name}-${index}`} align="center" gap={3} my={2}>
              <Text>
                {store.name} → {store.path}
              </Text>
              <Button
                size="sm"
                onClick={() =>
                  setValue(
                    'networkStoreList',
                    stores.filter((_, i) => i !== index),
                    { shouldDirty: true }
                  )
                }
              >
                {t('Unmount')}
              </Button>
            </Flex>
          ))}
          {config.networkStorageEnabled && (
            <Button mt={2} onClick={() => setStorageOpen(true)}>
              {t('Mount existing volume')}
            </Button>
          )}
          <Text fontSize="sm" color="gray.500" mt={2}>
            {t('Unmounting does not delete the volume')}
          </Text>
        </Box>
      )}
      <Flex gap={5} mt={5} wrap="wrap">
        <Box>
          <Text>{t('Ephemeral storage')} (Gi)</Text>
          <Input
            aria-label={t('Ephemeral storage')}
            type="number"
            min={0}
            step="0.1"
            value={ephemeral ? quantityToStorageGi(ephemeral) : ''}
            onChange={(e) =>
              setValue(
                'ephemeralStorage',
                e.target.value === ''
                  ? undefined
                  : storageGiToQuantity(Math.max(0, Number(e.target.value))),
                { shouldDirty: true }
              )
            }
          />
        </Box>
        <Box>
          <Checkbox
            isChecked={!!shm?.enabled}
            onChange={(e) =>
              setValue(
                'sharedMemory',
                { enabled: e.target.checked, sizeLimit: shm?.sizeLimit || storageGiToQuantity(1) },
                { shouldDirty: true }
              )
            }
          >
            {t('Shared memory')} /dev/shm
          </Checkbox>
          {shm?.enabled && (
            <Input
              aria-label={t('Shared memory size')}
              type="number"
              min={0.1}
              step="0.1"
              value={quantityToStorageGi(shm.sizeLimit)}
              onChange={(e) =>
                setValue(
                  'sharedMemory',
                  {
                    enabled: true,
                    sizeLimit: storageGiToQuantity(Math.max(0.1, Number(e.target.value)))
                  },
                  { shouldDirty: true }
                )
              }
            />
          )}
        </Box>
      </Flex>
      <Box mt={5}>
        <Text>{t('Scheduling tolerations')} (JSON)</Text>
        <Textarea
          aria-label={t('Scheduling tolerations')}
          defaultValue={JSON.stringify(getValues('tolerations') || [], null, 2)}
          onBlur={(event) => {
            try {
              const value = JSON.parse(event.target.value);
              if (!Array.isArray(value)) throw new Error(t('Expected a list'));
              setValue('tolerations', value, { shouldDirty: true });
              formHook.clearErrors('tolerations');
            } catch {
              formHook.setError('tolerations', { message: t('Invalid tolerations') });
            }
          }}
        />
      </Box>
      {routeIndex !== undefined && networks[routeIndex] && (
        <RouteRulesModal
          network={networks[routeIndex]}
          serviceOptions={(services.data || getValues('serviceList') || []).flatMap((s) =>
            s.ports.map((p) => ({
              label: `${s.name}:${p.port}`,
              value: `${s.name}:${p.port}`,
              serviceName: s.name,
              servicePort: p.port
            }))
          )}
          onClose={() => setRouteIndex(undefined)}
          onSave={(routes) => {
            setValue(`networks.${routeIndex}.routes`, routes, { shouldDirty: true });
            setRouteIndex(undefined);
          }}
        />
      )}
      {storageOpen && (
        <NetworkStoreModal
          pvcList={pvcs.data || []}
          listNames={stores.map((s) => s.name)}
          closeCb={() => setStorageOpen(false)}
          successCb={(store) => {
            setValue('networkStoreList', [...stores, store], { shouldDirty: true });
            setStorageOpen(false);
          }}
        />
      )}
      {(services.isError || pvcs.isError) && (
        <Text color="red.600">{t('Unable to load resources')}</Text>
      )}
    </Box>
  );
}
