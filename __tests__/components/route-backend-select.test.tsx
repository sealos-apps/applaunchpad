import React from 'react';
import { ChakraProvider, Modal, ModalContent, ModalBody } from '@chakra-ui/react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { theme } from '@/constants/theme';
import RouteBackendSelect from '@/pages/app/edit/components/RouteBackendSelect';

afterEach(cleanup);

test('selects a backend from the scrollable portaled menu inside a modal', async () => {
  const onchange = vi.fn();
  render(
    <ChakraProvider theme={theme}>
      <Modal isOpen onClose={() => {}}>
        <ModalContent>
          <ModalBody>
            <RouteBackendSelect
              aria-label="Backend service"
              width="240px"
              value="service-0"
              list={Array.from({ length: 20 }, (_, i) => ({
                label: `Service ${i}`,
                value: `service-${i}`
              }))}
              menuProps={{ strategy: 'fixed', gutter: 8 }}
              menuListPortal
              menuListProps={{ zIndex: 1500, maxH: '220px', overflowY: 'auto' }}
              onchange={onchange}
            />
          </ModalBody>
        </ModalContent>
      </Modal>
    </ChakraProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Backend service' }));
  const menu = await screen.findByRole('menu', { hidden: true });
  expect(getComputedStyle(menu).maxHeight).toBe('220px');
  expect(getComputedStyle(menu).overflowY).toBe('auto');
  expect(menu.scrollHeight).toBeGreaterThan(menu.clientHeight);
  expect(menu.closest('.chakra-portal')).not.toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Service 3', hidden: true }));
  await waitFor(() => expect(onchange).toHaveBeenCalledWith('service-3'));
});
