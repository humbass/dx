# dx

[English](README.md) | [简体中文](README_CN.md) | [繁體中文](README_TC.md)

這是一個 node.js 編寫的命令行文件傳輸工具。

## 安裝

```bash
# node version >= 20
npm install --global dx
```

## 使用

### 發送檔案

您可以使用 `dx send` 命令來發送檔案。指定傳輸碼的方式有以下幾種：

- 使用環境變量 `DX_CODE`：

```bash
export DX_CODE="888888" && dx send --file /path/to/name
```

- 直接通過 --code 參數指定：

```bash
dx send --file /path/to/name --code 123456
```

- 不指定傳輸碼（自动生成）：

```bash
dx send --file /path/to/name
```

如果同時設置了 `DX_CODE` 環境變量和 `--code` 參數，`--code` 參數將覆蓋 `DX_CODE`。 
如果兩者均未設置，**dx** 將自動生成一個隨機傳輸碼

### 接收檔案

接收檔案，請使用 `dx receive` 命令並指定傳輸碼：

```bash
dx receive --code 123456
```

發送方使用 `DX_CODE` 方式，接收方可以使用 `DX_CODE` 或 `--code` 來接收。

```bash
export DX_CODE="888888" && dx receive
# or
dx receive --code 888888
```

## 注意事項

由於部分防火牆的限制，可能會導致兩個終端無法通過 STUN 伺服器建立有效的 WebRTC 連接，從而使檔案傳輸無法進行。請注意，dx 伺服器僅用於信令傳遞，不進行數據中轉。 您的檔案數據是直接在兩個終端之間傳輸的。


