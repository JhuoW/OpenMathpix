<p align="center">
  <img src="image/OpenMathpix-logo.png" alt="OpenMathpix" width="300" />
</p>

<h1 align="center">OpenMathpix</h1>

<p align="center"><a href="README.md">English</a> · <strong>简体中文</strong></p>

<p align="center">
  开源桌面截图识别工具，使用 <a href="https://huggingface.co/breezedeus/pix2text-mfr-1.5">Pix2Text MFR-1.5</a> 在本地将公式截图转换为 LaTeX，也可通过 <a href="https://github.com/PaddlePaddle/PaddleOCR">PaddleOCR</a> API 识别文字、表格和文档版面。
</p>

---

## 安装

### Windows 便携版

1. 打开 [最新发布页面](https://github.com/JhuoW/OpenMathpix/releases/latest)，在 **Assets** 中下载 **OpenMathpix-portable.exe**（Windows x64）。
2. 如需使用本地公式识别，请确保已安装 [Microsoft Visual C++ x64 运行库](https://aka.ms/vc14/vc_redist.x64.exe)；已安装的用户可跳过此步。
3. 双击 **OpenMathpix-portable.exe** 启动便携版应用。
4. 按照下方的 [本地公式识别](#本地公式识别推荐) 步骤下载并测试 MFR-1.5。

### 从源码构建

需要 Node.js 22.12 或更高版本，以及 npm。

```bash
git clone git@github.com:JhuoW/OpenMathpix.git
cd OpenMathpix
npm install
npm run dev
npm run check      # TypeScript 检查、ESLint、回归测试和生产构建
npm run package
```

## 快速开始

### 本地公式识别（推荐）

1. 打开 **Settings（设置）**，选择 **Local [MFR-1.5](https://huggingface.co/breezedeus/pix2text-mfr-1.5)**，然后点击 **Download MFR-1.5（下载模型）**。
2. 首次配置需从官方 Hugging Face 仓库下载约 **120 MB** 的模型文件。下载时会显示进度并校验 SHA-256，失败后可重试。这一步需要联网，下载完成后可离线识别。
3. 点击 **Save & Test Local Model（保存并测试本地模型）**，保存引擎选择并识别一张测试公式图。
4. 截取单个公式并保留少量边距，也可以粘贴图片或将图片拖入窗口。

本地模式无需账号、API Token、Python、GPU 或本地大语言模型服务。图片由独立后台进程在本机 CPU 上处理，使用两个 CPU 线程。连续截图时会复用已加载的模型，空闲五分钟后释放资源。识别失败时不会自动切换到云端。新安装的应用默认使用 MFR；已配置 PaddleOCR URL 的用户会保留原来的云端引擎和凭据。

<div align="center">
  <img src="instruct/MFR-example.png" alt="本地 MFR-1.5 设置示例" width="50%" style="margin: 0 1.5%;"/>
</div>

MFR 适合识别 **单独截取的公式区域**，不处理图文混排页面、表格或文档版面。Markdown 输出会将识别结果包裹为独立公式，Text 输出则保留 LaTeX 源码。复杂排版、手写公式和不常见的截图仍需核对。对于空白或损坏的图片、识别超时及输出超长的情况，应用会显示错误，不会复制不完整的结果。

模型保存在 Electron 用户数据目录下的 `models/mfr-1.5/1cef9f0bdcd6a4c63df7de1311fb0894593340cc/` 中；Linux 上的用户数据目录通常为 `~/.config/openmathpix/`。固定的模型版本和所有文件校验值见 `src/services/mfr-model.ts`。如需离线安装，可将这八个原始模型文件从另一台电脑复制到相同目录，应用启动时会验证文件。

### 可选：获取 PaddleOCR API 凭据

1. 访问 [百度 AIStudio PaddleOCR](https://aistudio.baidu.com/paddleocr)，登录或注册免费账号。
2. 点击 **API** 按钮打开模型列表，选择模型（例如 PaddleOCR-VL），查看示例代码以及对应的 API URL 和 Access Token。

<div align="center">
  <img src="instruct/0.png" alt="在 AIStudio 中获取 API 配置" width="50%" style="margin: 0 1.5%;"/>
</div>

3. 从示例代码中复制以下两项：
   - **API URL**：该模型的接口地址，例如 `https://xxxxxx.aistudio-app.com/layout-parsing`。
   - **Access Token**：身份验证令牌，也可在 [Access Token 页面](https://aistudio.baidu.com/index/accessToken) 查看。

> 每个模型都有对应的 API URL，子域名可能不同。更换模型时，请同时更新接口地址。

### 可选：配置 PaddleOCR

1. 启动 OpenMathpix。
2. 点击工具栏中的 **Settings（设置）**。
3. 选择 **PaddleOCR API**，在 **API Configuration（API 配置）** 中填写：
   - **API URL**：粘贴模型对应的接口地址。
   - **Access Token**：粘贴身份验证令牌。
   - **Pipeline**：选择与 AIStudio 中的模型一致的识别流程。
4. 点击 **Save & Test Connection（保存并测试连接）**，保存配置并用一张测试图片验证连接。

<div align="center">
  <img src="instruct/1.png" alt="OpenMathpix 的 PaddleOCR 配置" width="50%" style="margin: 0 1.5%;"/>
</div>

### 截图并识别

#### 屏幕截图

点击工具栏中的 **Snip（截图）**，再点击 **New Snip（新建截图）**，屏幕会变暗并进入框选模式。

<div align="center">
  <img src="instruct/2.png" alt="开始截图" width="50%" style="margin: 0 1.5%;"/>
</div>

按住鼠标并拖动以选择区域，松开鼠标后完成截图。

<div align="center">
  <img src="instruct/3.png" alt="框选公式区域" width="50%" style="margin: 0 1.5%;"/>
  <img src="instruct/4.png" alt="查看截图识别结果" width="50%" style="margin: 0 1.5%;"/>
</div>

## 查看结果

识别完成后，可通过四个标签页查看结果：

| 标签页       | 说明                                                                |
| ------------ | ------------------------------------------------------------------- |
| **LaTeX**    | 通过 KaTeX 渲染识别出的公式，并提供可复制的 LaTeX 源码。            |
| **Markdown** | 显示结构化内容，例如标题、表格和行内公式；本地 MFR 输出为独立公式。 |
| **Text**     | 显示去除格式后的纯文本；本地 MFR 保留 LaTeX 源码。                  |
| **Image**    | 显示原始截图。                                                      |

点击 **Copy（复制）** 可复制当前标签页的内容。每次识别完成后，应用也会自动复制所选默认格式的结果。

## 识别引擎与流程

| 引擎或流程           | 适用场景                                     | 输出                               |
| -------------------- | -------------------------------------------- | ---------------------------------- |
| **MFR-1.5（本地）**  | 单个公式的截图                               | LaTeX，以及包含独立公式的 Markdown |
| **PP-OCRv5**         | 通用文字，包括中日韩文字及英文               | 纯文本                             |
| **PP-StructureV3**   | 公式、表格、图表及混合版面                   | Markdown + LaTeX                   |
| **PaddleOCR-VL**     | 视觉语言文档解析                             | Markdown + LaTeX                   |
| **PaddleOCR-VL-1.5** | 更高精度的文档解析，以及印章和不规则文字识别 | Markdown + LaTeX                   |

> 使用 PaddleOCR 时，各个流程在 AIStudio 上都有对应的 API URL。切换流程后，请在设置中同步更新地址。

## 设置

| 设置项                        | 默认值             | 说明                                                     |
| ----------------------------- | ------------------ | -------------------------------------------------------- |
| OCR Engine（识别引擎）        | Local MFR-1.5      | 选择本地公式识别或 PaddleOCR API；已有云端配置会被保留。 |
| API URL                       | —                  | PaddleOCR AIStudio 接口地址。                            |
| Access Token                  | —                  | 通过 safeStorage 加密后存储在本地。                      |
| Pipeline（识别流程）          | PP-StructureV3     | 使用 PaddleOCR 时选择对应的识别流程。                    |
| Snip Hotkey（截图快捷键）     | `Ctrl+Shift+S`     | 屏幕截图的全局快捷键。                                   |
| Default Output（默认输出）    | LaTeX              | 识别完成后自动复制的格式。                               |
| Theme（主题）                 | System（跟随系统） | 支持浅色、深色或跟随系统。                               |
| History Limit（历史记录上限） | 100                | 最多保存的识别记录数，可设置为 10–500。                  |

**自托管服务：** 将 API URL 设置为自己的服务地址（例如 `http://localhost:8080`），并将 Token 留空。

点击 **Save Settings（保存设置）** 应用更改。快捷键和主题的修改会立即生效。如果新快捷键不可用，应用会保留之前的设置和快捷键。无效的 URL 和超出范围的历史记录上限会被拒绝；保存 Token 时，如果系统密钥环不可用，应用会给出提示。

## 历史记录

点击工具栏中的 **History（历史记录）** 浏览之前的识别结果。每条记录都包含缩略图、时间和结果预览。可以使用搜索栏筛选，也可以点击记录重新打开结果。

<div align="center">
  <img src="instruct/5.png" alt="浏览识别历史记录" width="50%" style="margin: 0 1.5%;"/>
</div>

## 系统托盘

关闭窗口后，应用会最小化到系统托盘。右键点击托盘图标可使用以下功能：

- **Snip**：开始截图。
- **Open Window**：显示主窗口。
- **Settings**：打开设置。
- **Quit**：退出应用。

## 快捷键

| 快捷键         | 功能                     |
| -------------- | ------------------------ |
| `Ctrl+Shift+S` | 屏幕截图（全局快捷键）。 |
| `Ctrl+V`       | 粘贴图片并识别。         |
| `Escape`       | 取消截图。               |

## 许可证

MIT
