# Clash 到 V2Ray 转换器

嘿，这是一个我自己折腾出来的小网页工具，用来在 Clash YAML 格式和 V2Ray base64 订阅链接之间转换代理配置。主要是为了学习 Next.js 和 YAML 解析，纯属个人项目，想搞明白这些订阅格式是怎么回事的。如果你用 Clash 或 V2RayN 之类的代理工具，偶尔转换配置时可能有点用，不用装一堆软件。

灵感来自 Clash 官方文档和 V2Ray 协议规范，还有 GitHub 上一些开源例子处理 URI 方案（感谢 clash-verge 和 v2ray-core 之类的项目，参考了 ss://、vmess:// 等 URI 的解析方式）。代码没直接抄，是用标准的 YAML 和 base64 处理写的。

## 功能简介

- **Clash YAML → V2Ray Base64**：输入 Clash 的代理（ss、vmess、vless、hysteria2/hy2、tuic、ssr），输出 base64 编码的 URI 节点列表，直接导入 V2RayN 或 Clash Meta 就能用。
- **V2Ray Base64 → Clash YAML**：反过来，拿 base64 订阅链接，解码 URI，生成基本的 Clash 配置，包括 proxies。

支持基础参数如 server/port/password/uuid/alterId/cipher/network/tls/sni，但忽略高级选项如 WebSocket 路径、插件或混淆，保持简单。全客户端处理，不上传服务器，隐私友好。

## 演示

部署到 Vercel 上？直接访问 URL 粘贴配置就行。或者本地跑（下面有说明）。界面简单：选方向，丢进 YAML 或 base64（或者 URL，不过 CORS 可能挡路），点转换，复制输出。

## 本地运行

标准的 Next.js 项目，用 TypeScript 和 Tailwind。如果你想自己跑：

1. 把文件复制到文件夹里。
2. 在终端 cd 到那，运行：
   ```
   npm install
   ```
3. 启动开发服务器：
   ```
   npm run dev
   ```
4. 浏览器打开 http://localhost:3000。

生产构建用 `npm run build` 和 `npm start`。就这些，没额外依赖，package.json 里都有。

## 限制

- 只支持基础代理类型：ss/ssr、vmess、vless、hy2 (hysteria2)、tuic。不支持 trojan、ShadowsocksR 扩展，或规则/策略组。
- URL 获取？浏览器 CORS 可能挡远程 YAML/base64，拉不下来就直接粘贴内容。
- 名称带表情/特殊字符？URI 里应该行，但测试下你的客户端。
- 错误处理简单，输入乱了就报错。

这不是生产级的东西，就为了学格式怎么映射（比如 vmess JSON 怎么变 base64 URI）。实际用还是官方工具或完整转换器如 subconverter。

## 学习笔记

我做这个主要是想搞懂 js-yaml 解析 YAML 和代理 URI 编码。心得：
- Clash 代理是简单对象，但 V2Ray URI 把一切塞进 scheme://auth@host:port?params#label。
- 订阅 base64 就是 URI 列表的打包 – 解码，用 URL() 解析，提取参数。
- Next.js app router 客户端用 'use client' 超方便，Tailwind 快速样式。

想学的话，看看：
- [Clash Premium 配置格式](https://github.com/Dreamacro/clash/wiki/configuration)
- [V2Ray URI 方案](https://www.v2fly.org/en_US/basics/url_scheme.html)
- js-yaml 文档，安全加载。

纯个人/学习用 – 别商用或重分发，没改就别。坏了看控制台调试，我从错误里学了不少。
