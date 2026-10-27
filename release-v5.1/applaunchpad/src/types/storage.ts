export type StorageOption = {
  id: string;
  displayName: string;
  mode: 'shared' | 'exclusive';
  visible: boolean;
};

/** UI preview data only. Production storage discovery is intentionally not wired. */
export type StoragePreview = {
  options: StorageOption[];
  status: 'ready' | 'loading' | 'error';
  replicas: number;
  onRetry: () => void;
};
