import { createContext, useContext } from "react";
import { Box, Input, Text, Button, Tooltip } from "@chakra-ui/react";
export const PortContext = createContext<any>({});
export function InlinePortField() {
  const s = useContext(PortContext);
  return (
    <>
      <Box pl="12px" fontSize="12px" color="grayModern.600" flexShrink={0}>
        203.0.113.24
      </Box>
      <Text px="6px" fontSize="12px">
        :
      </Text>
      <Tooltip
        label={s.error}
        isOpen={!!s.error}
        placement="top"
        hasArrow
        bg="red.600"
      >
        <Input
          aria-label="对外访问端口"
          value={s.port}
          onChange={(e) => s.edit(e.target.value)}
          placeholder="端口"
          inputMode="numeric"
          h="30px"
          w="104px"
          minW="104px"
          bg="white"
          borderRadius="0"
          borderY={0}
          borderColor={s.error ? "red.500" : "grayModern.200"}
          isInvalid={!!s.error}
          fontSize="12px"
          px="10px"
        />
      </Tooltip>
      <Box flex={1} />
      <Tooltip label={s.dirty ? "提交成功后可复制新地址" : "复制访问地址"}>
        <Button
          variant="unstyled"
          aria-label="复制访问地址"
          h="30px"
          minW="36px"
          px="10px"
          fontSize="12px"
          color="grayModern.500"
          isDisabled={!s.current || s.dirty}
          onClick={s.copy}
        >
          复制
        </Button>
      </Tooltip>
    </>
  );
}
export function InlinePortHint() {
  return null;
}
