import React, { useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Flex,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  Badge,
  Divider,
  Radio,
  RadioGroup,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Textarea,
  FormControl,
  FormLabel,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  AlertDialog,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter
} from '@chakra-ui/react';
import { ArrowLeft, Plus, ShieldCheck, Upload, Globe } from 'lucide-react';
// Frontend prototype only: no DNS, certificate, or application API calls.
// Entries and materials remain in component state and reset when the modal closes.
type Entry = { host: string; custom: boolean };
type Props = {
  publicDomain?: string;
  domain?: string;
  currentCustomDomain: string;
  networkIndex?: number;
  onClose: () => void;
  onSuccess: (domain: string) => void;
};
export default function DomainPrototypeModal({
  publicDomain = 'customer-api',
  domain = 'cloud.sealos.io',
  onClose
}: Props) {
  const [entries, setEntries] = useState<Entry[]>([
    { host: 'api.example.com', custom: false },
    { host: 'portal.example.com', custom: true }
  ]);
  const [screen, setScreen] = useState<'list' | 'add' | 'edit'>('list');
  const [host, setHost] = useState('');
  const [method, setMethod] = useState('existing');
  const [originalCustom, setOriginalCustom] = useState(true);
  const [cert, setCert] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const [remove, setRemove] = useState<Entry | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const target = `${publicDomain}.${domain}`;
  const uploadFields = [
    { title: '证书内容', value: cert, setValue: setCert },
    { title: '私钥', value: key, setValue: setKey }
  ];
  function open(entry?: Entry) {
    setScreen(entry ? 'edit' : 'add');
    setHost(entry?.host || '');
    setOriginalCustom(!!entry?.custom);
    setMethod(entry?.custom ? 'custom' : 'existing');
    setError('');
    setCert('');
    setKey('');
    setTab(0);
  }
  function save() {
    if (!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)) {
      setError('请输入有效的外部域名，例如 api.example.com');
      return;
    }
    if (screen === 'add' && entries.some((e) => e.host === host)) {
      setError('该域名已绑定当前端口，请勿重复添加');
      return;
    }
    if (method === 'custom' && (!cert || !key)) {
      setError('请同时提供证书内容与私钥');
      return;
    }
    if (method === 'custom') {
      setError(
        '证书未覆盖 ' +
          host +
          '。请提供匹配的证书与私钥。' +
          (screen === 'edit' ? '本次更新未生效，原有效配置仍在使用。' : '')
      );
      return;
    }
    setEntries((es) =>
      screen === 'edit'
        ? es.map((e) => (e.host === host ? { host, custom: false } : e))
        : [...es, { host, custom: false }]
    );
    setScreen('list');
  }
  const card = {
    border: '1px solid',
    borderColor: 'grayModern.200',
    borderRadius: 'lg',
    bg: 'white',
    p: 4
  };
  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        lockFocusAcrossFrames={false}
        scrollBehavior="inside"
        closeOnOverlayClick={!remove}
      >
        <ModalOverlay />
        <ModalContent maxH="90vh" maxW="90vw" width="587px">
          <ModalHeader>
            {screen === 'list'
              ? '自定义域名'
              : screen === 'add'
              ? '添加自定义域名'
              : '配置域名证书'}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={5}>
            <Stack spacing={4}>
              <Alert status="info" borderRadius="md">
                <AlertIcon boxSize={4} />
                <AlertDescription fontSize="12px">
                  前端原型 ·
                  以下域名、证书及校验结果均为演示数据。操作仅在当前弹窗内生效，不会修改实际绑定或证书。
                </AlertDescription>
              </Alert>
              {screen === 'list' ? (
                <>
                  <Box>
                    <Text fontWeight="bold" mb={2}>
                      外部自定义域名
                    </Text>
                    <Text color="gray.600" fontSize="14px">
                      同一端口可绑定多个域名，各域名独立配置证书。
                    </Text>
                  </Box>
                  <Box {...card} bg="grayModern.50">
                    <Flex align="center" gap={2} mb={2}>
                      <Globe size={16} />
                      <Text fontSize="13px" fontWeight={500}>
                        平台默认域名
                      </Text>
                      <Badge ml="auto" variant="subtle">
                        HTTP · 8080
                      </Badge>
                    </Flex>
                    <Text fontSize="14px">{target}</Text>
                    <Text mt={2} color="gray.500" fontSize="12px">
                      保持现有配置，不纳入外部域名增删管理。
                    </Text>
                  </Box>
                  <Flex align="center" justify="space-between">
                    <Text fontSize="14px" fontWeight={500}>
                      已绑定域名{' '}
                      <Text as="span" color="gray.500">
                        {entries.length}
                      </Text>
                    </Text>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Plus size={14} />}
                      onClick={() => open()}
                    >
                      添加域名
                    </Button>
                  </Flex>
                  {entries.map((e) => (
                    <Box {...card} key={e.host}>
                      <Flex justify="space-between" align="center" mb={3}>
                        <Text fontWeight={600} fontSize="14px">
                          {e.host}
                        </Text>
                        <Badge colorScheme="green" borderRadius="full" px={2} fontWeight={400}>
                          已生效
                        </Badge>
                      </Flex>
                      <Flex gap={2} align="center" color="gray.600" fontSize="13px">
                        <ShieldCheck size={16} />
                        <Text>{e.custom ? '自定义证书' : '沿用现有证书方式'}</Text>
                        {e.custom && (
                          <Text ml="auto" fontSize="12px">
                            有效至 2027-10-27
                          </Text>
                        )}
                      </Flex>
                      <Divider my={3} />
                      <Flex justify="flex-end" gap={2}>
                        <Button size="sm" variant="outline" onClick={() => open(e)}>
                          {e.custom ? '更新证书' : '配置证书'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          color="red.600"
                          onClick={() => setRemove(e)}
                        >
                          删除
                        </Button>
                      </Flex>
                    </Box>
                  ))}
                  {entries.length === 0 && (
                    <Text textAlign="center" color="gray.500" py={6}>
                      尚未绑定域名，点击“添加域名”开始配置。
                    </Text>
                  )}
                  <Text fontSize="12px" color="gray.500">
                    新增、删除或更新单个域名，不影响其他域名及平台默认域名。
                  </Text>
                </>
              ) : (
                <>
                  <Button
                    alignSelf="flex-start"
                    variant="link"
                    size="sm"
                    color="gray.600"
                    leftIcon={<ArrowLeft size={14} />}
                    onClick={() => setScreen('list')}
                  >
                    返回域名列表
                  </Button>
                  {screen === 'add' ? (
                    <FormControl>
                      <FormLabel fontSize="14px" fontWeight="bold">
                        您的外部域名
                      </FormLabel>
                      <Input
                        id="domain"
                        aria-label="外部域名"
                        value={host}
                        onChange={(e) => {
                          setHost(e.target.value.trim().toLowerCase());
                          setError('');
                        }}
                        bg="#F7F8FA"
                        borderColor="#E8EBF0"
                        placeholder="例如 shop.example.com"
                      />
                    </FormControl>
                  ) : (
                    <Box {...card} bg="grayModern.50">
                      <Text fontWeight={600} mb={2}>
                        {host}
                      </Text>
                      <Text fontSize="13px" color="gray.600">
                        当前：
                        {originalCustom ? '自定义证书 · 有效至 2027-10-27' : '沿用现有证书方式'}
                      </Text>
                      <Text fontSize="12px" color="gray.500" mt={1}>
                        新证书校验通过并应用成功后，才替换当前有效配置。
                      </Text>
                    </Box>
                  )}
                  {screen === 'add' && (
                    <Box
                      borderWidth={1}
                      borderStyle="dashed"
                      borderColor="gray.300"
                      borderRadius="lg"
                      p={3}
                    >
                      <Text fontSize="14px" fontWeight={600} mb={2}>
                        配置 DNS 解析记录
                      </Text>
                      <Text fontSize="12px" color="gray.600">
                        在域名服务商处添加记录，指向平台分配的地址。
                      </Text>
                      <TableContainer
                        mt={3}
                        borderWidth={1}
                        borderColor="gray.200"
                        borderRadius="md"
                      >
                        <Table size="sm" bg="white">
                          <Thead>
                            <Tr>
                              <Th fontSize="11px">类型</Th>
                              <Th fontSize="11px">TTL</Th>
                              <Th fontSize="11px">记录值</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            <Tr>
                              <Td fontSize="12px">CNAME</Td>
                              <Td fontSize="12px">自动</Td>
                              <Td fontSize="12px">{target}</Td>
                            </Tr>
                          </Tbody>
                        </Table>
                      </TableContainer>
                    </Box>
                  )}
                  <FormControl>
                    <FormLabel fontSize="14px" fontWeight={600}>
                      证书方式
                    </FormLabel>
                    <RadioGroup
                      value={method}
                      onChange={(v) => {
                        setMethod(v);
                        setError('');
                      }}
                    >
                      <Flex gap={3}>
                        {[
                          ['existing', '沿用现有方式', '无需提供自定义证书'],
                          ['custom', '自定义证书', '提供证书内容与私钥']
                        ].map(([value, title, sub]) => (
                          <Box
                            key={value}
                            flex={1}
                            borderWidth={1}
                            borderColor={method === value ? 'brightBlue.500' : 'grayModern.200'}
                            bg={method === value ? '#F4FAFF' : 'white'}
                            borderRadius="md"
                            p={3}
                          >
                            <Radio value={value} colorScheme="blue">
                              <Text fontSize="14px">{title}</Text>
                            </Radio>
                            <Text fontSize="12px" color="gray.500" pl={6} mt={1}>
                              {sub}
                            </Text>
                          </Box>
                        ))}
                      </Flex>
                    </RadioGroup>
                  </FormControl>
                  {error && (
                    <Alert status="error" borderRadius="md" alignItems="flex-start">
                      <AlertIcon boxSize={4} mt={0.5} />
                      <AlertDescription fontSize="13px">{error}</AlertDescription>
                    </Alert>
                  )}
                  {method === 'custom' && (
                    <Box>
                      <Tabs index={tab} onChange={setTab} variant="enclosed" size="sm">
                        <TabList>
                          <Tab>上传文件</Tab>
                          <Tab>粘贴内容</Tab>
                        </TabList>
                        <TabPanels>
                          <TabPanel px={0} pb={0}>
                            <Flex gap={4}>
                              {uploadFields.map(({ title, value, setValue }, i) => (
                                <FormControl key={i}>
                                  <FormLabel fontSize="13px">{title}</FormLabel>
                                  <Box
                                    as="label"
                                    htmlFor={'file-' + i}
                                    display="flex"
                                    flexDirection="column"
                                    alignItems="center"
                                    justifyContent="center"
                                    gap={2}
                                    cursor="pointer"
                                    border="1px dashed"
                                    borderColor="gray.300"
                                    borderRadius="md"
                                    bg="grayModern.50"
                                    p={4}
                                    minH="90px"
                                  >
                                    <Upload size={18} color="#667085" />
                                    <Text fontSize="12px">{value || '选择' + title + '文件'}</Text>
                                  </Box>
                                  <Input
                                    id={'file-' + i}
                                    type="file"
                                    display="none"
                                    onChange={(e) => setValue(e.target.files?.[0]?.name || '')}
                                  />
                                </FormControl>
                              ))}
                            </Flex>
                          </TabPanel>
                          <TabPanel px={0} pb={0}>
                            <Stack spacing={3}>
                              <FormControl>
                                <FormLabel htmlFor="cert" fontSize="13px">
                                  证书内容
                                </FormLabel>
                                <Textarea
                                  id="cert"
                                  bg="#F7F8FA"
                                  fontSize="12px"
                                  minH="72px"
                                  rows={3}
                                  placeholder="-----BEGIN CERTIFICATE-----"
                                  value={cert}
                                  onChange={(e) => setCert(e.target.value)}
                                />
                              </FormControl>
                              <FormControl>
                                <FormLabel htmlFor="private-key" fontSize="13px">
                                  私钥
                                </FormLabel>
                                <Textarea
                                  id="private-key"
                                  bg="#F7F8FA"
                                  fontSize="12px"
                                  minH="72px"
                                  rows={3}
                                  placeholder="粘贴与证书匹配的私钥"
                                  value={key}
                                  onChange={(e) => setKey(e.target.value)}
                                />
                              </FormControl>
                            </Stack>
                          </TabPanel>
                        </TabPanels>
                      </Tabs>
                      <Text fontSize="12px" color="gray.500" mt={3}>
                        私钥仅用于本次配置，保存后不回显已存私钥。
                      </Text>
                    </Box>
                  )}
                </>
              )}
            </Stack>
          </ModalBody>
          <ModalFooter gap={3}>
            {screen === 'list' ? (
              <Button variant="outline" onClick={onClose}>
                关闭
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setScreen('list')}>
                  取消
                </Button>
                <Button onClick={save}>{screen === 'edit' ? '保存并应用' : '验证并添加'}</Button>
              </>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
      <AlertDialog
        isOpen={!!remove}
        leastDestructiveRef={cancelRef}
        onClose={() => setRemove(null)}
        isCentered
      >
        <AlertDialogOverlay />
        <AlertDialogContent>
          <AlertDialogHeader>删除自定义域名？</AlertDialogHeader>
          <AlertDialogBody>
            <Text fontSize="14px">删除后，此域名将无法再通过当前绑定访问应用。</Text>
            <Box {...card} mt={4}>
              <Text fontWeight={600}>{remove?.host}</Text>
              <Text color="gray.500" fontSize="13px" mt={1}>
                customer-api · HTTP / 8080
              </Text>
            </Box>
            <Text fontSize="13px" color="gray.600" mt={4}>
              其他外部域名及平台默认域名保持不变。
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter gap={3}>
            <Button ref={cancelRef} variant="outline" onClick={() => setRemove(null)}>
              取消
            </Button>
            <Button
              colorScheme="red"
              bg="red.600"
              color="white"
              onClick={() => {
                setEntries((es) => es.filter((e) => e.host !== remove?.host));
                setRemove(null);
              }}
            >
              删除域名
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
