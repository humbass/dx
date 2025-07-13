# dx

[English](README.md) | [简体中文](README_CN.md) | [繁體中文](README_TC.md)

这是一个 node.js 编写的命令行文件传输工具。

## 安装

```bash
# node version >= 20
npm install --global dx 
```

## 使用

### 发送文件

您可以使用 dx send 命令来发送文件。有以下几种方式指定传输码：

- 使用环境变量 `DX_CODE`：

```bash
export DX_CODE="888888" && dx send --file /path/to/name
```

- 直接通过 --code 参数指定：

```bash
dx send --file /path/to/name --code 123456
```

- 不指定传输码（自动生成）：

```bash
dx send --file /path/to/name
```

如果同时设置了 `DX_CODE` 环境变量和 `--code` 参数，`--code` 参数将覆盖 `DX_CODE`。 
如果两者均未设置，**dx** 将自动生成一个随机传输码。

### 接收文件

接收文件，请使用 dx receive 命令并指定传输码：

```bash
dx receive --code 123456
```

发送方使用 `DX_CODE` 方式，接收方可以使用 `DX_CODE` 或 `--code` 来接收，

```bash
export DX_CODE="888888" && dx receive
# or
dx receive --code 888888
```

## 注意事项

由于部分防火墙的限制，可能会导致两个终端无法通过 STUN 服务器建立有效的 WebRTC 连接，从而使文件传输无法进行。请注意，dx 服务器仅用于信令传递，不进行数据中转。 您的文件数据是直接在两个终端之间传输的。


