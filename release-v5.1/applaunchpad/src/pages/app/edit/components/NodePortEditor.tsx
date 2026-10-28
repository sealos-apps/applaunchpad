import { createContext, useContext, useState, type ReactNode } from 'react';
import { Box, Button, Input, Tooltip } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { AppEditType } from '@/types/app';

type Network = AppEditType['networks'][number];
export const nodePortKey = (network: Network) => `${network.serviceName || ''}:${network.portName}`;

function useEditorState() {
  // UI-only state: never write these values into the deployment form or Service YAML.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const current = (network: Network) =>
    saved[nodePortKey(network)] ?? String(network.nodePort || '');
  const edit = (network: Network, value: string) => {
    const key = nodePortKey(network);
    setDrafts((previous) => {
      const next = { ...previous };
      if (value === current(network)) delete next[key];
      else next[key] = value;
      return next;
    });
    setErrors((previous) => ({ ...previous, [key]: '' }));
  };
  const saveLocally = (changes: Record<string, string>) => {
    setSaved((previous) => ({ ...previous, ...changes }));
    setDrafts((previous) => {
      const next = { ...previous };
      Object.keys(changes).forEach((key) => delete next[key]);
      return next;
    });
    setErrors({});
  };
  return { drafts, current, errors, setErrors, edit, saveLocally };
}

const EditorContext = createContext<ReturnType<typeof useEditorState> | null>(null);
export function NodePortEditorProvider({ children }: { children: ReactNode }) {
  return <EditorContext.Provider value={useEditorState()}>{children}</EditorContext.Provider>;
}
export function useNodePortEditor() {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error('NodePortEditorProvider is required');
  return editor;
}

export function NodePortEditor({
  network,
  host,
  onCopy
}: {
  network: Network;
  host: string;
  onCopy: (port: number) => void;
}) {
  const { t } = useTranslation();
  const editor = useNodePortEditor();
  const key = nodePortKey(network);
  const current = editor.current(network);
  const value = editor.drafts[key] ?? current;
  const error = editor.errors[key];
  return (
    <>
      <Box pl="12px" fontSize="12px" color="grayModern.600" flexShrink={0}>
        {host}
      </Box>
      <Box px="6px" fontSize="12px">
        :
      </Box>
      <Tooltip label={error} isOpen={!!error} placement="top" hasArrow bg="red.600">
        <Input
          aria-label={t('node_port_editor_label')}
          value={value}
          onChange={(event) => editor.edit(network, event.target.value)}
          placeholder={t('pending_to_allocated')}
          inputMode="numeric"
          h="30px"
          w="104px"
          minW="104px"
          bg="white"
          borderRadius={0}
          borderY={0}
          borderColor={error ? 'red.500' : 'grayModern.200'}
          isInvalid={!!error}
          fontSize="12px"
          px="10px"
        />
      </Tooltip>
      <Box flex={1} />
      <Button
        variant="unstyled"
        aria-label={t('Copy')}
        h="30px"
        minW="36px"
        px="10px"
        fontSize="12px"
        color="grayModern.500"
        isDisabled={!current || value !== current}
        onClick={() => onCopy(Number(current))}
      >
        {t('Copy')}
      </Button>
    </>
  );
}
