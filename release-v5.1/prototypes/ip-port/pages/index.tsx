import {
  Box,
  Flex,
  Text,
  Button,
  AlertDialog,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { useMessage } from "@sealos/ui";
import { useTranslation } from "next-i18next";
import { useForm } from "react-hook-form";
import { defaultEditVal } from "@/constants/editApp";
import Form from "@/pages/app/edit/components/Form";
import Header from "@/pages/app/edit/components/Header";
import { serviceSideProps } from "@/utils/i18n";
import { PortContext } from "@/components/PrototypePort";
export default function Preview() {
  const form = useForm({
    defaultValues: {
      ...defaultEditVal,
      appName: "hello-world",
      networks: [
        {
          ...defaultEditVal.networks[0],
          openNodePort: true,
          appProtocol: "TCP",
          nodePort: 31080,
        },
      ],
    },
  });
  const [port, setPort] = useState("31080"),
    [current, setCurrent] = useState<any>(31080),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [fresh, setFresh] = useState(false);
  const cancelRef = useRef(null);
  const { message: toast } = useMessage();
  const { t } = useTranslation();
  const dirty = port !== String(current || "");
  const edit = (v: string) => {
    setPort(v);
    setError("");
  };
  const submit = () => {
    if (!/^\d+$/.test(port)) {
      setError("请输入整数端口。");
      return;
    }
    if (port && (+port < 30000 || +port > 32767)) {
      setError("端口超出允许范围，请输入 30000–32767 内的整数（示例范围）。");
      return;
    }
    if (port === "32081") {
      setError("端口 32081 已被占用，请更换端口。");
      return;
    }
    if (!dirty && !fresh) {
      toast({ title: "配置未发生变化", status: "info" });
      return;
    }
    setConfirm(true);
  };
  const apply = () => {
    setBusy(true);
    setTimeout(() => {
      const next = Number(port);
      setCurrent(next);
      setPort(String(next));
      form.setValue("networks.0.nodePort", next);
      setConfirm(false);
      setBusy(false);
      toast({ title: t("Update Successful"), status: "success" });
      setFresh(false);
    }, 600);
  };
  useEffect(() => {
    (window as any).prototypeScene = (s: string) => {
      setError("");
      setConfirm(s === "confirm");
      setBusy(false);
      toast.closeAll();
      if (s === "success")
        toast({ title: t("Update Successful"), status: "success" });
      setFresh(false);
      const c = s === "success" ? 32080 : 31080;
      setCurrent(c);
      form.setValue("networks.0.nodePort", c);
      setPort(
        s === "invalid"
          ? "80"
          : s === "conflict"
          ? "32081"
          : ["custom", "confirm", "success"].includes(s)
          ? "32080"
          : "31080"
      );
      if (s === "invalid")
        setError("端口超出允许范围，请输入 30000–32767 内的整数（示例范围）。");
      if (s === "conflict") setError("端口 32081 已被占用，请更换端口。");
    };
  }, []);
  const copy = async () => {
    await navigator.clipboard.writeText("tcp://203.0.113.24:" + current);
    toast({ title: "复制成功", status: "success", duration: 1200 });
  };
  return (
    <PortContext.Provider value={{ port, current, error, dirty, edit, copy }}>
      <Flex
        flexDirection="column"
        alignItems="center"
        h="100%"
        minWidth="1024px"
        backgroundColor="grayModern.100"
        overflowY="auto"
      >
        <Header
          appName="hello-world"
          title={fresh ? "Application Deployment" : "Update Application"}
          yamlList={[]}
          applyCb={submit}
          applyBtnText={fresh ? "Deploy Application" : "Update"}
        />
        <Box flex="1 0 0" h={0} w="100%" pb={4}>
          <Form
            formHook={form as any}
            already={true}
            existingStores={[]}
            countGpuInventory={() => 0}
            pxVal={50}
            refresh={false}
            isAdvancedOpen={false}
          />
        </Box>
      </Flex>
      <AlertDialog
        isOpen={confirm}
        leastDestructiveRef={cancelRef}
        onClose={() => !busy && setConfirm(false)}
        closeOnOverlayClick={false}
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              {fresh ? "确认部署应用？" : "确认更新应用？"}
            </AlertDialogHeader>
            <AlertDialogBody>
              <Text mb={4}>
                对外访问端口：{current || "待分配"} → {port || "自动分配"}
              </Text>
              {!fresh && (
                <Text color="orange.700" fontSize="13px" lineHeight="22px">
                  变更成功后，旧访问地址 203.0.113.24:{current}{" "}
                  将失效，请同步更新外部系统的连接配置。
                </Text>
              )}
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button
                ref={cancelRef}
                width="88px"
                variant="outline"
                isDisabled={busy}
                onClick={() => setConfirm(false)}
              >
                取消
              </Button>
              <Button
                width="88px"
                ml={3}
                isLoading={busy}
                loadingText="提交中"
                onClick={apply}
              >
                确认
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </PortContext.Provider>
  );
}
export async function getServerSideProps(ctx: any) {
  return { props: await serviceSideProps(ctx) };
}
