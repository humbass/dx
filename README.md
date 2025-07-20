# dx

[English](README.md) | [简体中文](README_CN.md)

This is a command-line file transfer tool written in node.js.

## Installation

```bash
# node version >= 20
npm install --global dx
```

## Usage

### Sending Files

Using the dx send command to send files. There are several ways to specify the transfer code:

- Using the `DX_CODE` environment variable:

```bash
export DX_CODE=020-9255-896 && dx send --file /path/to/name
```

- Directly specifying with the `--code` parameter:

```bash
dx send --file /path/to/name --code 020-9255-896
```

- Not specifying a transfer code (auto-generated):

```bash
dx send --file /path/to/name
```

- If both the `DX_CODE` environment variable and the `--code` parameter are set, the `--code` parameter will override `DX_CODE`. 
- If neither is set, **dx** will automatically generate a random transfer code.

### Receiving Files

To receive files, use the `dx receive` command and specify the transfer code:

```bash
dx receive --code 020-9255-896
```

The sender uses the `DX_CODE` method, and the receiver can use either `DX_CODE` or `--code` to receive.

```bash
export DX_CODE="020-9255-896" && dx receive
# or
dx receive --code 020-9255-896
```

## Notes

Dx server is only used for signaling and does not relay data. Your file data is transferred directly between the two terminals.


