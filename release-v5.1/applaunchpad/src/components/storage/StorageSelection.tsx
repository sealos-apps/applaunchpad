import { Badge, Box, Button, Flex, Text, VStack } from '@chakra-ui/react';
import type { StorageOption, StoragePreview } from '@/types/storage';

export function StorageBadge({ option }: { option: StorageOption }) {
  return (
    <Badge colorScheme={option.mode === 'shared' ? 'blue' : 'purple'} borderRadius="4px" px={2}>
      {option.mode === 'shared' ? '共享' : '独占'}
    </Badge>
  );
}
export function StorageRelation({
  option,
  replicas,
  capacity
}: {
  option: StorageOption;
  replicas: number;
  capacity: number;
}) {
  const shared = option.mode === 'shared';
  return (
    <Box
      border="1px solid"
      borderColor="gray.200"
      bg="gray.50"
      borderRadius="md"
      p={4}
      fontSize="sm"
    >
      <Text fontWeight={600} mb={3}>
        副本与存储关系
      </Text>
      <Flex justify="center" gap={3}>
        {Array.from({ length: Math.min(replicas, 3) }, (_, i) => (
          <Box key={i} textAlign="center">
            <Box
              bg="white"
              border="1px solid"
              borderColor="gray.200"
              borderRadius="md"
              px={3}
              py={2}
              fontSize="xs"
            >
              副本 {i + 1}
            </Box>
            <Text color="gray.400" my={1}>
              ↓
            </Text>
            {!shared && (
              <Box bg="purple.50" color="purple.700" borderRadius="md" px={2} py={2} fontSize="xs">
                独立卷 · {capacity} Gi
              </Box>
            )}
          </Box>
        ))}
        {replicas > 3 && <Text>…</Text>}
      </Flex>
      {shared && (
        <Box
          mx="auto"
          mt={1}
          w="fit-content"
          bg="blue.50"
          color="blue.700"
          borderRadius="md"
          px={6}
          py={2}
          fontSize="xs"
        >
          共用一份卷 · {capacity} Gi
        </Box>
      )}
      <Text mt={3} fontSize="xs" color="gray.600">
        {shared
          ? `${replicas} 个副本共用同一份数据，总申请容量 ${capacity} Gi。`
          : `${replicas} 个副本数据独立，总申请容量 ${replicas * capacity} Gi。`}
      </Text>
    </Box>
  );
}
export function StorageSelection({
  preview,
  value,
  onChange,
  locked
}: {
  preview: StoragePreview;
  value?: StorageOption;
  onChange: (option: StorageOption) => void;
  locked: boolean;
}) {
  const options = locked && value ? [value] : preview.options.filter((option) => option.visible);
  return (
    <VStack align="stretch" spacing={3} mb={5}>
      <Text fontSize="sm" fontWeight={500}>
        存储类型{' '}
        <Text as="span" color="red.500">
          *
        </Text>
      </Text>
      <Text fontSize="xs" color="gray.500">
        选择管理员开放的类型，共享／独占属性由管理员配置。
      </Text>
      {!locked && (preview.status !== 'ready' || options.length === 0) ? (
        <Box
          role="status"
          border="1px dashed"
          borderColor="gray.300"
          borderRadius="md"
          p={5}
          textAlign="center"
        >
          <Text fontSize="sm" fontWeight={600}>
            {preview.status === 'loading'
              ? '正在加载存储类型…'
              : preview.status === 'error'
              ? '无法加载存储类型'
              : '暂无可用存储类型'}
          </Text>
          <Text my={3} fontSize="xs" color="gray.500">
            {preview.status === 'error'
              ? '请重试，已填写的应用配置会保留。'
              : '请联系管理员开放存储，也可取消添加。'}
          </Text>
          <Button
            size="sm"
            variant="outline"
            isDisabled={preview.status === 'loading'}
            onClick={preview.onRetry}
          >
            重新加载
          </Button>
        </Box>
      ) : (
        options.map((option) => (
          <Box
            as="button"
            type="button"
            key={option.id}
            disabled={locked}
            aria-pressed={value?.id === option.id}
            onClick={() => onChange(option)}
            textAlign="left"
            border="1px solid"
            borderColor={value?.id === option.id ? 'blue.400' : 'gray.200'}
            bg={value?.id === option.id ? 'blue.50' : 'white'}
            borderRadius="md"
            p={3}
            cursor={locked ? 'not-allowed' : 'pointer'}
          >
            <Flex justify="space-between" align="center">
              <Text fontSize="sm" fontWeight={600}>
                {option.displayName}
              </Text>
              <StorageBadge option={option} />
            </Flex>
            <Text mt={2} fontSize="xs" color="gray.600">
              {option.mode === 'shared'
                ? '同一应用的多个副本共用一份卷'
                : '每个副本分别使用自己的卷，数据不互通'}
            </Text>
          </Box>
        ))
      )}
      {locked && (
        <Box
          bg="orange.50"
          color="orange.800"
          borderRadius="md"
          p={3}
          fontSize="xs"
          lineHeight={1.8}
        >
          <Text fontWeight={600}>
            {value?.visible ? '当前存储绑定不可更换' : '已停止开放 · 当前使用'}
          </Text>
          现有存储与数据不受影响。本期不支持共享与独占之间切换。
        </Box>
      )}
    </VStack>
  );
}
