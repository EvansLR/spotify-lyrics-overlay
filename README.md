# Spotify Lyrics Overlay

English | [中文](#中文)

Spotify Lyrics Overlay is a minimal Windows desktop lyrics overlay for Spotify. It shows the current Spotify track's lyrics in a transparent always-on-top window, similar to desktop lyrics in music players.

The app uses Spotify Web API for current playback state and LRCLIB for synced lyrics. Spotify does not provide lyrics through the official Web API.

![Spotify Lyrics Overlay preview](example.png)

> Preview image is for UI demonstration only.

## Features

- Transparent always-on-top desktop lyrics window
- Spotify OAuth PKCE authorization
- Current track detection from Spotify
- Synced line-by-line lyrics via LRCLIB
- Plain lyrics fallback when synced lyrics are unavailable
- One-line or two-line display mode
- Long lyric lines auto-scroll horizontally
- Lock mode with mouse click-through
- Hover unlock button while locked
- Global lock toggle shortcut: `Ctrl + Alt + L`
- Local token and lyrics cache
- Windows installer build via `electron-builder`

## Requirements

- Windows
- Node.js and npm
- A Spotify Developer app
- Spotify running on any device

## Spotify Developer Setup

1. Open the Spotify Developer Dashboard.
2. Create an app.
3. Copy the app's Client ID.
4. Add this Redirect URI:

```text
http://127.0.0.1:8766/callback
```

Required Spotify scopes:

```text
user-read-currently-playing
user-read-playback-state
```

## Development

```powershell
npm.cmd install
npm.cmd start
```

On first launch, enter your Spotify Client ID and authorize the app in your browser.

## Build Windows Installer

```powershell
npm.cmd run dist
```

The installer will be generated in:

```text
dist/Spotify Lyrics Overlay Setup 0.1.2.exe
```

This project currently builds an unsigned installer. Windows may show an unknown publisher warning. A production release should use a valid code signing certificate.

## Notes

- Spotify does not provide lyrics via its official API.
- LRCLIB coverage varies by song.
- Synced lyrics may not always match perfectly.
- Lock mode makes the lyrics window click-through; move the mouse over the lyrics area to reveal the unlock button.

## Privacy

- Spotify tokens are stored locally in Electron's user data directory.
- Lyrics results are cached locally.
- This app does not run a remote backend.
- Spotify and LRCLIB API requests are made directly from the local app.

## License

MIT

See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

# 中文

Spotify Lyrics Overlay 是一个极简的 Windows 桌面歌词悬浮窗，用于显示 Spotify 当前播放歌曲的歌词，类似 QQ 音乐这类播放器的桌面歌词。

本应用使用 Spotify Web API 获取当前播放状态，使用 LRCLIB 获取同步歌词。Spotify 官方 Web API 不提供歌词接口。

![Spotify Lyrics Overlay 预览图](example.png)

> 预览图仅用于展示界面效果。

## 功能

- 透明、置顶的桌面歌词窗口
- Spotify OAuth PKCE 授权
- 自动检测 Spotify 当前播放歌曲
- 通过 LRCLIB 显示逐行同步歌词
- 没有同步歌词时回退到纯文本歌词
- 支持一行 / 两行歌词显示
- 长歌词自动横向滚动
- 锁定模式，支持鼠标穿透
- 锁定后鼠标悬停在歌词区域可显示解锁按钮
- 全局锁定快捷键：`Ctrl + Alt + L`
- 本地保存 token 和歌词缓存
- 支持用 `electron-builder` 打包 Windows 安装包

## 环境要求

- Windows
- Node.js 和 npm
- 一个 Spotify Developer 应用
- Spotify 正在任意设备上播放

## Spotify Developer 设置

1. 打开 Spotify Developer Dashboard。
2. 创建一个应用。
3. 复制应用的 Client ID。
4. 添加这个 Redirect URI：

```text
http://127.0.0.1:8766/callback
```

需要的 Spotify scope：

```text
user-read-currently-playing
user-read-playback-state
```

## 本地开发

```powershell
npm.cmd install
npm.cmd start
```

首次启动时，输入 Spotify Client ID，然后在浏览器里完成授权。

## 打包 Windows 安装包

```powershell
npm.cmd run dist
```

安装包会生成在：

```text
dist/Spotify Lyrics Overlay Setup 0.1.0.exe
```

当前安装包未做代码签名，Windows 可能会提示未知发布者。正式发布建议使用有效的代码签名证书。

## 说明

- Spotify 官方 API 不提供歌词。
- LRCLIB 的歌词覆盖率取决于歌曲。
- 同步歌词不一定总是完全精准。
- 锁定模式会让歌词窗口鼠标穿透；将鼠标移动到歌词区域上方会显示解锁按钮。

## 隐私

- Spotify token 只保存在本机 Electron 用户数据目录。
- 歌词结果会缓存在本机。
- 本应用没有远程后端。
- Spotify 和 LRCLIB 请求都由本地应用直接发起。

## License

MIT

详见 [LICENSE](LICENSE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
