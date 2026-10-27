# IP 模式端口编辑原型

基于当前仓库 `release-v5.1/applaunchpad` 的真实表单、页头、主题和图标组件。
默认回填随机分配的端口 `31080`，允许直接修改；IP 只读，地址栏下没有提示文字。
使用顶部“变更”提交，旧地址失效提示合并到现有更新确认弹窗。

## 启动

在仓库根目录执行（沿用 release-v5.1 的 Node 20 / pnpm 8 环境）：

```sh
cd release-v5.1
pnpm install --frozen-lockfile
pnpm dev:prototype
```

访问 http://localhost:3218/?name=hello-world 。固定使用本地端口 3218。

## 文件

- `pages/index.tsx`：原型状态、校验和变更确认。
- `components/PrototypePort.tsx`：IP 只读、端口输入框、复制及错误浮层。
- `components/NetworkSection.tsx`：原版网络配置组件的原型副本。
- `next.config.js`：复用原版 Form，仅替换它引用的网络配置组件。

输入 `32080` 可演示变更成功，`32081` 演示占用冲突，`80` 演示范围错误。
IP、30000–32767 范围和保存结果均为演示数据。提交只修改浏览器中的状态，不调用真实部署接口。
Devbox 不在本次原型范围。
