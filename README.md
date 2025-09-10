# ChatGPT 下载回答图片

一个 Tampermonkey脚本，在 ChatGPT 网页的分享弹窗中添加“下载图片”按钮，把当前回答以官方排版导出为图片，便于在无法访问分享链接或仅允许上传截图的平台转发。

## 安装（目前仅支持Chorme内核浏览器）

### 一键安装

安装 Tampermonkey。然后打开下方 Raw 链接，浏览器会弹出安装对话框。

**Raw 安装链接：**

 [点击跳转](https://raw.githubusercontent.com/chixi4/chatgpt-answer-image-dl/main/ChatGPT%20下载回答图片.user.js)

### 备用安装

在仓库页面进入脚本文件，点击 Raw 按钮即可获取原始链接。也可以下载 `.user.js` 后，在 Tampermonkey 仪表盘中新建脚本并粘贴保存。

## 使用方法

在任意回答下点击分享，弹出分享弹窗后，点击新增的下载图片按钮。等待脚本渲染完成，浏览器开始保存图片到下载目录；在支持的模式下会弹出保存对话框。

## 权限与设置

1.对于携带图片的回答的图片下载，首次使用会弹出如下提示：

<img width="2432" height="1432" alt="屏幕截图 2025-08-26 190305" src="https://github.com/user-attachments/assets/75c4abc4-d43e-44d5-9fcd-6c26c1c2cb5a" />

点击“总是允许此域名”即可正常下载。

2.脚本使用 `GM_download` 保存图片，需要在 Tampermonkey 中允许下载能力，并将 `png` 后缀加入白名单。未启用、未在白名单或未授予权限时，Tampermonkey 可能报出相应错误。该设置 Tampermonkey 的选项页。

## 常见问题

* 点击后下载失败

  * 优先检查 Tampermonkey 是否启用下载功能并允许 `png` 后缀。
  * 查看控制台日志，脚本会打印失败原因。
* 图片过大或生成较慢

  * 默认像素比偏高以保证清晰度。需要更小体积时，可以在源码中将 `pixelRatio` 固定为 `2`。

## 目录与文件

```
chatgpt-answer-image-dl/
├─ ChatGPT 下载回答图片.user.js
├─ LICENSE
└─ README.md
```

## 许可证

MIT

## 致谢

* `html-to-image` 用于将 DOM 渲染为图片。
* Tampermonkey 提供脚本运行与下载接口。
