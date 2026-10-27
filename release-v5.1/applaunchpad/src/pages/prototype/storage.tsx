import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { GetServerSidePropsContext } from 'next';
import { useRouter } from 'next/router';
import { Box, Button, Flex, Text } from '@chakra-ui/react';

import { useMessage } from '@sealos/ui';
import ErrorModal from '../app/edit/components/ErrorModal';

import { defaultEditVal } from '@/constants/editApp';
import type { AppEditType } from '@/types/app';
import { serviceSideProps } from '@/utils/i18n';

import Form from '../app/edit/components/Form';
import Header from '../app/edit/components/Header';
import type { StorageOption, StoragePreview } from '@/types/storage';

const catalog: StorageOption[] = [
  { id: 'shared', displayName: '标准共享存储', mode: 'shared', visible: true },
  { id: 'exclusive', displayName: '高性能独占存储', mode: 'exclusive', visible: true }
];
const scenes = [
  ['create', '创建应用'],
  ['existing', '已有类型已隐藏'],
  ['empty', '无可用类型'],
  ['error', '加载失败'],
  ['stale', '提交时已下架']
] as const;

function StorageFormPreview({ scene }: { scene: string }) {
  const { message: notify } = useMessage();
  const toast = { error: (title: string) => notify({ title, status: 'error' as const }) };
  const router = useRouter();
  const existing = scene === 'existing';
  const [options, setOptions] = useState(() =>
    scene === 'empty'
      ? []
      : catalog.map((option) => ({
          ...option,
          visible: !(existing && option.id === 'exclusive')
        }))
  );
  const [status, setStatus] = useState<StoragePreview['status']>(
    scene === 'error' ? 'error' : 'ready'
  );
  const [stale, setStale] = useState(false);
  const [existingStores] = useState<AppEditType['storeList']>(() =>
    existing
      ? [
          {
            name: 'data',
            path: '/data',
            value: 10,
            previewStorage: { ...catalog[1], visible: false }
          }
        ]
      : []
  );
  const formHook = useForm<AppEditType>({
    defaultValues: {
      ...defaultEditVal,
      appName: 'content-service',
      replicas: 3,
      storeList: existingStores
    }
  });
  const values = useWatch({ control: formHook.control });
  useEffect(() => {
    const timer = window.setTimeout(
      () => document.getElementById('settings-storage')?.scrollIntoView({ block: 'center' }),
      500
    );
    return () => window.clearTimeout(timer);
  }, []);
  const onSubmit = () => {
    const stores = formHook.getValues('storeList');
    if (!formHook.getValues('appName').trim()) return toast.error('请填写应用名称');
    if (stores.some((store) => !store.previewStorage)) return toast.error('请为存储选择类型');
    if (new Set(stores.map((store) => store.previewStorage?.mode)).size > 1) {
      return toast.error('共享与独占混合挂载规则待确认，本原型不提交该组合。');
    }
    if (scene === 'stale' && options.every((option) => option.visible) && stores.length > 0) {
      const ids = stores.map((store) => store.previewStorage?.id);
      setOptions(catalog.map((option) => ({ ...option, visible: !ids.includes(option.id) })));
      setStale(true);
      return;
    }
    if (
      !existing &&
      stores.some(
        (store) =>
          !options.some((option) => option.id === store.previewStorage?.id && option.visible)
      )
    ) {
      setStale(true);
      return;
    }
    notify({ title: '配置已确认（原型演示），没有创建或变更任何真实资源。', status: 'success' });
  };
  return (
    <Flex h="100vh" minW="1024px" direction="column" bg="grayModern.100" overflow="hidden">
      <Header
        appName="content-service"
        title={existing ? 'Update Application' : 'Application Deployment'}
        yamlList={[]}
        applyBtnText={existing ? 'Update' : 'Deploy Application'}
        applyCb={onSubmit}
        preview
      />
      <Flex
        h="54px"
        minH="54px"
        align="center"
        justify="center"
        gap={2}
        bg="white"
        borderBottom="1px solid"
        borderColor="gray.200"
      >
        <Text fontSize="xs" color="gray.500" mr={2}>
          release-v5.1 · 存储原型
        </Text>
        {scenes.map(([id, label]) => (
          <Button
            key={id}
            size="sm"
            variant={scene === id ? 'solid' : 'ghost'}
            onClick={() =>
              router.push({
                pathname: '/prototype/storage',
                query: { scene: id, ...(id === 'existing' ? { name: 'content-service' } : {}) }
              })
            }
          >
            {label}
          </Button>
        ))}
        <Text ml={2} fontSize="xs" color="gray.500">
          模拟数据 · 不执行部署
        </Text>
      </Flex>
      <Box id="prototype-scroll" flex={1} minH={0} pt={5} overflowY="auto">
        <Form
          formHook={formHook}
          already
          existingStores={existingStores}
          countGpuInventory={() => 0}
          pxVal={32}
          refresh={!!values}
          isAdvancedOpen
          storagePreview={{
            options,
            status,
            replicas: Number(values.replicas) || 1,
            onRetry: () => {
              setStatus('loading');
              setTimeout(() => {
                setOptions(catalog);
                setStatus('ready');
              }, 500);
            }
          }}
        />
      </Box>
      {stale && (
        <ErrorModal
          title="所选存储类型已停止开放"
          content="提交未完成，可用列表已刷新。请点击当前存储重新选择，已填写的容量和挂载路径会保留。"
          onClose={() => setStale(false)}
        />
      )}
    </Flex>
  );
}

export default function StoragePrototype() {
  const router = useRouter();
  const scene = typeof router.query.scene === 'string' ? router.query.scene : 'create';
  return <StorageFormPreview key={scene} scene={scene} />;
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  if (process.env.NODE_ENV !== 'development') return { notFound: true };
  return { props: { ...(await serviceSideProps(context)), storagePrototype: true } };
}
