import type { Language } from './types';

/** English copy is also the translation key, so missing developer diagnostics remain readable. */
const chinese = {
  Snip: '截图',
  History: '历史记录',
  Settings: '设置',
  'New Snip': '新建截图',
  'Local MFR-1.5': '本地 MFR-1.5',
  'Local TexTeller': '本地 TexTeller',
  'Paused {percent}%': '已暂停 {percent}%',
  'A picture of the formula, for slides and chat apps without LaTeX':
    '公式图片，适合不支持 LaTeX 的幻灯片和聊天软件',
  'Cancel {model} download': '取消下载 {model}',
  'Cancel Download': '取消下载',
  'Copy Image': '复制图片',
  'Development build: the installer was saved to {file}':
    '开发版本不会安装更新，安装包已保存到 {file}',
  Discard: '删除',
  'Discard {model} download': '删除已下载的部分 {model}',
  'Download cancelled. Download again to continue where it stopped.':
    '下载已取消。再次下载会从中断处继续。',
  'Downloading OpenMathpix {version}...': '正在下载 OpenMathpix {version}…',
  'Image saved: {file}': '图片已保存：{file}',
  Later: '稍后',
  'OpenMathpix {version} is ready. Restart to install it; your data is kept.':
    'OpenMathpix {version} 已下载。重启即可完成安装，数据会保留。',
  'Restart and Install': '重启并安装',
  Resume: '继续下载',
  'Resume {model} download': '继续下载 {model}',
  'Resume Download': '继续下载',
  'Save as PNG, or as SVG for sharp scaling in slides and documents':
    '保存为 PNG，或保存为可无损缩放的 SVG（适合幻灯片和文档）',
  'Save Image...': '保存图片…',
  'Update download': '更新下载进度',
  'Update failed: {message}': '更新失败：{message}',
  'Copied as an image!': '已复制为图片！',
  'There is no result to copy yet.': '还没有可复制的识别结果。',
  'This LaTeX cannot be turned into an image. Check the source for errors.':
    '无法将此 LaTeX 生成图片，请检查源码是否有误。',
  'The update checksum file is invalid.': '更新的校验文件无效。',
  'The update checksum does not match GitHub’s record.': '更新的校验值与 GitHub 记录不一致。',
  'The update has an unexpected size.': '更新文件大小异常。',
  'The downloaded update is incomplete or damaged. Please try again.':
    '下载的更新不完整或已损坏，请重试。',
  'The update download stalled. Check your connection and try again.':
    '更新下载已停滞，请检查网络后重试。',
  'Could not download the update.': '无法下载更新。',
  'Start OpenMathpix when I sign in': '登录 Windows 时自动启动 OpenMathpix',
  'It starts in the notification area, so the snip hotkey works right away.':
    '启动后位于通知区域（托盘），截图快捷键可立即使用。',
  '{model} is installed. Choose it under Recognition Engine to use it.':
    '{model} 已安装。在“识别引擎”中选择它即可使用。',
  'About {size} MB': '约 {size} MB',
  'About {size} MB download': '下载约 {size} MB',
  'Already have the model files, or prefer the PaddleOCR cloud API?':
    '已有模型文件，或想使用 PaddleOCR 云端 API？',
  'Also available from the View → Language menu.': '也可通过“视图 → 语言”菜单切换。',
  'Best for long, multi-line and complex formulas.': '最适合长公式、多行公式和复杂公式。',
  'Change {model} storage location': '更改 {model} 的存储位置',
  'Checking and loading {model}...': '正在检查并加载 {model}…',
  'Choose a model': '选择模型',
  'Clear History...': '清空历史记录…',
  'Deletes every saved snip and its result. Settings and models are kept.':
    '删除所有保存的截图及识别结果。设置和模型会保留。',
  Disconnect: '断开',
  'Disconnect {model}': '断开 {model}',
  Done: '完成',
  Download: '下载',
  'Download {model}': '下载 {model}',
  'Download, test or remove each model here. This does not change the engine in use.':
    '可在这里分别下载、测试或删除各个模型，不会改变正在使用的引擎。',
  'Downloading {percent}%': '正在下载 {percent}%',
  'Fast and small. Handles most everyday formulas.': '速度快、体积小，适合大多数常见公式。',
  General: '通用',
  'Import {model}...': '导入 {model}…',
  'Import...': '导入…',
  Language: '语言',
  'Loading {model}...': '正在加载 {model}…',
  'Local Models': '本地模型',
  'Matches the original formula': '与原公式一致',
  'Model loaded in {seconds} s': '模型加载用时 {seconds} 秒',
  'Most accurate': '最准确',
  'Needs attention': '需要处理',
  'Not installed': '未安装',
  'Open {model} folder': '打开 {model} 所在文件夹',
  'Open Settings': '打开设置',
  'Open the model folder': '打开模型文件夹',
  Recognition: '识别',
  'Recognition history': '识别历史',
  'Recognize a sample formula': '识别示例公式',
  'Recognize a sample formula with this model': '用此模型识别一个示例公式',
  'Recognized in {seconds} s': '识别用时 {seconds} 秒',
  'Recognizing the sample formula...': '正在识别示例公式…',
  'Recognizing with {model}...': '正在使用 {model} 识别…',
  'Sample formula image': '示例公式图片',
  'Sample formula test': '示例公式测试',
  'Set up offline formula recognition. Your screenshots never leave this computer.':
    '设置离线公式识别。截图只在本机处理，不会上传。',
  'Settings sections': '设置分类',
  'Setup steps': '设置步骤',
  'Snip a formula': '截取公式',
  Test: '测试',
  'Test {model}': '测试 {model}',
  'This continues in the background; you can switch to other apps.':
    '下载会在后台继续，您可以先切换到其他应用。',
  'Try it': '试一试',
  'Try it on a sample formula, then snip your own from any app.':
    '先用示例公式试一试，然后就可以在任意应用中截取公式了。',
  Uninstall: '卸载',
  'Uninstall {model}': '卸载 {model}',
  'Use {model}': '使用 {model}',
  'Use a different {model} folder': '改用其他 {model} 文件夹',
  'Welcome to OpenMathpix': '欢迎使用 OpenMathpix',
  'History cleared.': '历史记录已清空。',
  Installed: '已安装',
  'Downloading...': '正在下载…',
  '{engine} stays in use until this model is installed.': '此模型安装完成前，将继续使用{engine}。',
  'Model uninstalled. Switched to {model}.': '模型已卸载，已切换到 {model}。',
  'Model disconnected. Switched to {model}.': '已断开模型，已切换到 {model}。',
  'Most accurate offline model for long and complex formulas':
    '最准确的离线模型，擅长长公式和复杂公式',
  'Downloading {model}...': '正在下载 {model}…',
  '{model} is ready': '{model} 已就绪',
  '{model} model download': '{model} 模型下载进度',
  '{model} model files': '{model} 模型文件',
  'Offline formula recognition, about {size} MB, no API account needed':
    '离线公式识别 · 约 {size} MB · 无须 API 账号',
  'Select an accessible folder containing the TexTeller model files.':
    '请选择包含 TexTeller 模型文件且可访问的文件夹。',
  'Download all six original files from the linked TexTeller revision into one folder (without the onnx subfolder), then select that folder.':
    '请从链接中的 TexTeller 版本页面下载全部六个原始文件，放在同一个文件夹中（不要保留 onnx 子文件夹），再选择该文件夹。',
  'You can also download the six model files from Hugging Face and use Import Existing Model.':
    '也可以从 Hugging Face 手动下载六个模型文件，然后点击“导入已有模型”。',
  'TexTeller model is not ready. Download it or use Import Existing Model in Settings.':
    'TexTeller 模型尚未就绪，请在设置中下载模型或点击“导入已有模型”。',
  'The local model is inactive. Download or import a model in Settings first.':
    '本地模型尚未启用，请先在设置中下载或导入模型。',
  'Model removal was incomplete. Retry Uninstall Model in Settings.':
    '模型未完全移除，请在设置中再次点击“卸载模型”。',
  Recommended: '推荐',
  Inactive: '未启用',
  'Checking...': '正在检查…',
  'Connecting...': '正在连接…',
  'Connect & Use': '连接并使用',
  Cancel: '取消',
  'Choose an engine and complete its setup below.': '选择识别引擎，然后完成下方配置。',
  'Choose a model folder outside the OpenMathpix installation folder so updates and uninstall can preserve it.':
    '请选择 OpenMathpix 安装文件夹之外的模型目录，避免更新或卸载软件时删除模型文件。',
  'Click Connect & Use to apply this engine. Other preferences save automatically.':
    '点击“连接并使用”以启用此引擎，其他偏好设置会自动保存。',
  'Leave blank if your self-hosted server does not require authentication.':
    '自行部署且无需身份验证的服务可留空。',
  'Connect runs one test recognition request and enables this engine after success.':
    '连接时会进行一次测试识别请求，成功后自动启用此引擎。',
  'Removing model...': '正在移除模型…',
  '{model} is installed': '{model} 已安装',
  '{model} is not installed': '尚未安装 {model}',
  'Click New Snip in the top-right corner to start.': '点击右上角“新建截图”即可开始使用。',
  'Offline formula recognition, about 120 MB, no API account needed':
    '离线公式识别 · 约 120 MB · 无须 API 账号',
  or: '或',
  'Choose one. The model is checked and enabled automatically.':
    '任选一种方式，模型会自动检查并启用。',
  'Uninstall Model': '卸载模型',
  'Disconnect Model': '断开模型',
  'Advanced model options': '高级模型选项',
  'Saved for future downloads. Existing model files stay where they are.':
    '此位置用于之后的下载，已有模型文件会保留在原目录。',
  'Use the mirror if the official download is slow or unavailable.':
    '官方下载缓慢或无法访问时，可使用镜像。',
  'Download these files into one folder, then choose Import Existing Model.':
    '将以下文件下载到同一文件夹，再选择“导入已有模型”。',
  'Model disconnected. Your files were kept.': '模型已断开，原文件已保留。',
  'Local model uninstalled. Download or import a model to use it again.':
    '本地模型已卸载，重新下载或导入后即可使用。',
  'Testing connection...': '正在测试连接…',
  'Connection unavailable': '连接不可用',
  'Use Connect & Use to validate and enable this engine.': '请点击“连接并使用”验证并启用此引擎。',
  'Invalid local model state.': '本地模型状态无效。',
  'Image exceeds 25 MB. Please capture a smaller formula region.':
    '图片超过 25 MB，请截取更小的公式区域。',
  'Automatic download': '自动下载',
  'Or import an existing model': '或导入已有模型',
  'Import Existing Model...': '导入已有模型…',
  'Model storage location': '模型存储位置',
  'Application data folder (default)': '应用数据目录（默认）',
  'Change...': '更改…',
  'Download folder: {path}': '下载目录：{path}',
  'This location is saved for future downloads. Existing model files are kept in their current folder.':
    '此位置会保存并用于之后的下载。已有模型文件仍保留在原目录。',
  'Download the model automatically (about 120 MB), or import files you already have. Choose either option; both verify and configure the model for you.':
    '自动下载模型（约 120 MB），或导入已有模型文件。两种方式任选其一，均会自动验证并配置模型。',
  'Already have the eight model files? Select their folder. No download is needed.':
    '已有八个模型文件？选择它们所在的文件夹即可，无须再次下载。',
  'Model setup complete. Click New Snip in the top-right corner to start.':
    '模型已配置成功。点击右上角“新建截图”即可开始使用。',
  'Check the folder and retry verification, repair the download, or import a complete model below.':
    '请检查模型目录并重新验证，或使用下方“修复下载”或“导入已有模型”恢复完整模型。',
  'Verify Model': '验证模型',
  'Repair Download': '修复下载',
  'Optional: download files in your browser': '可选：在浏览器中下载模型文件',
  'Use this only if automatic download is unavailable. Skip it if the model is already ready.':
    '仅在自动下载不可用时使用此方式。模型已就绪时，无须执行此操作。',
  'MFR-1.5 model files': 'MFR-1.5 模型文件',
  'Click Import Existing Model and choose the folder containing those files.':
    '点击“导入已有模型”，选择包含这些文件的文件夹。',
  'Model maintenance': '模型维护',
  'Clear files in the download folder above and release the selected model. Model files in other locations are kept.':
    '清理上方下载目录中的模型文件并解除当前模型选择。其他位置的模型文件会保留。',
  'PaddleOCR API': 'PaddleOCR API',
  'Recognition Engine': '识别引擎',
  'Active engine: {engine}.': '当前引擎：{engine}。',
  'The selected engine will activate after validation.': '所选引擎将在验证成功后启用。',
  Active: '使用中',
  'Pending validation': '等待验证',
  'Fast offline formula recognition on your CPU': '在本机 CPU 上快速离线识别公式',
  'Cloud or self-hosted service that also reads text, tables and documents':
    '云端或自行部署的服务，还可识别文字、表格和文档',
  'Checking and applying recognition settings...': '正在检查并应用识别设置…',
  'Applying changes...': '正在应用更改…',
  'Changes will apply automatically when you finish typing.': '输入完成后将自动应用更改。',
  'Some changes could not be applied. Correct the fields below to try again.':
    '部分更改未能生效，请修改下方字段后重试。',
  'Changes are saved and applied automatically.': '设置会自动保存并生效。',
  'Previous settings remain active.': '之前的设置仍然有效。',
  'Change the interface language in View → Language.': '可在“视图 → 语言”中切换界面语言。',
  'API Configuration': 'API 配置',
  'API URL': 'API 地址',
  'Access Token': '访问令牌',
  Hide: '隐藏',
  Show: '显示',
  'The connection is checked automatically before changes become active. For a self-hosted server without authentication, leave the Access Token empty.':
    '更改生效前会自动检查连接。自行部署且无需身份验证的服务可留空访问令牌。',
  Pipeline: '识别流程',
  'Pipeline: {pipeline}': '识别流程：{pipeline}',
  'General text (CJK + English)': '通用文字（中日韩及英文）',
  'Tables, formulas, charts, mixed layout': '表格、公式、图表和混合版面',
  'Vision-language document parsing': '视觉语言文档解析',
  'Upgraded vision-language document parsing': '增强版视觉语言文档解析',
  'Snip Hotkey': '截图快捷键',
  'Default Output Format': '默认输出格式',
  LaTeX: 'LaTeX',
  Latex: 'LaTeX',
  Markdown: 'Markdown',
  Text: '文本',
  Image: '图片',
  Theme: '主题',
  Light: '浅色',
  Dark: '深色',
  System: '跟随系统',
  'History Limit': '历史记录数量上限',
  About: '关于',
  'Local Formula Model': '本地公式模型',
  'Download Pix2Text MFR-1.5 once (about 120 MB), or select an existing model folder. Files are verified and the model is tested automatically before it becomes available for offline recognition on your CPU.':
    '下载一次 Pix2Text MFR-1.5（约 120 MB），或选择已有的模型文件夹。应用会自动校验文件并测试模型，成功后即可使用 CPU 离线识别。',
  'Snip a single formula with a small margin. Use PaddleOCR for text, tables, or mixed page layouts. No API account is needed for the local model.':
    '请截取单个公式并保留少量边距。文字、表格或混合版面请使用 PaddleOCR。本地模型无需 API 账号。',
  'Verifying local model files...': '正在校验本地模型文件…',
  'Loading and testing local model...': '正在加载并测试本地模型…',
  'Downloading MFR-1.5...': '正在下载 MFR-1.5…',
  'Selecting and checking a model folder...': '正在选择并检查模型文件夹…',
  'Preparing local model...': '正在准备本地模型…',
  'MFR-1.5 is ready': 'MFR-1.5 已就绪',
  'Checking local model...': '正在检查本地模型…',
  'Model setup needs attention': '模型配置需要处理',
  'Model has not been downloaded': '尚未下载模型',
  'Clearing model cache...': '正在清理模型缓存…',
  'MFR-1.5 model download': 'MFR-1.5 模型下载进度',
  'Preparing download...': '正在准备下载…',
  'Model folder: {path}': '模型目录：{path}',
  'This folder is remembered across restarts. Keep it in this location so the model stays available.':
    '重启后会记住所选目录。请勿移动或删除此目录，以保持模型可用。',
  'Download Local Model': '下载本地模型',
  'Select Local Model': '选择本地模型',
  'Clear Model Cache': '清理模型缓存',
  'Clear downloaded model files and release the selected model. External model folders you selected are kept.':
    '清除已下载的模型缓存并解除当前模型选择。手动选择的外部模型目录会保留。',
  'Your previous model remains available.': '之前的模型仍可继续使用。',
  'If the download fails or times out, download the model files in your browser and use Select Local Model. Follow the manual download instructions below.':
    '如果下载失败或超时，请按下方说明在浏览器中下载文件，再点击“选择本地模型”。',
  'Manual download': '手动下载',
  'MFR-1.5 files on Hugging Face': 'Hugging Face 上的 MFR-1.5 文件',
  'Open the supported model version:': '打开受支持的模型版本：',
  'Download all eight files listed below into the same folder, keeping their names.':
    '将下方八个文件下载到同一个文件夹中，并保留原始文件名。',
  'Click Select Local Model and choose the folder containing those files.':
    '点击“选择本地模型”，选择包含这些文件的文件夹。',
  'Required model files (8)': '必需的模型文件（8 个）',
  'Local model validated and ready': '本地模型已通过验证，可以使用',
  'Model cache cleared. You can download or select a model again.':
    '模型缓存已清理，可重新下载或选择模型。',
  'Checking model...': '正在检查模型…',
  'Model ready': '模型已就绪',
  'Downloading model...': '正在下载模型…',
  'Verifying model...': '正在校验模型…',
  'Loading model...': '正在加载模型…',
  'Model unavailable': '模型不可用',
  'Model download required': '需要下载模型',
  Configured: '已配置',
  'Not configured': '尚未配置',
  'Recognizing...': '正在识别…',
  'Preparing model...': '正在准备模型…',
  Ready: '就绪',
  'Setup needed': '需要配置',
  'Recognizing with MFR-1.5...': '正在使用 MFR-1.5 识别…',
  'Processing the formula on this device.': '正在本机处理公式。',
  Copy: '复制',
  Retry: '重试',
  'Open Model Settings': '打开模型设置',
  'Verifying your local formula model': '正在校验本地公式模型',
  'Loading and testing your local formula model': '正在加载并测试本地公式模型',
  'Your local formula model is downloading': '正在下载本地公式模型',
  'Set up local formula recognition': '配置本地公式识别',
  'The model will be available when verification and initialization finish.':
    '校验和初始化完成后即可使用模型。',
  'Download MFR-1.5 once (about 120 MB), or select an existing model folder, to recognize formulas offline.':
    '下载 MFR-1.5（约 120 MB），或选择已有模型文件夹，即可离线识别公式。',
  'View Model Status': '查看模型状态',
  'View Download': '查看下载',
  'No result yet. Capture a snip or paste an image.': '暂无结果，请截图或粘贴图片。',
  'No image captured.': '尚未截取图片。',
  Captured: '截图',
  'No LaTeX formula found. Try a clearer snip containing a single formula.':
    '未识别到 LaTeX 公式，请尝试更清晰的单公式截图。',
  'No LaTeX formulas found. Try PP-StructureV3 or PaddleOCR-VL pipeline.':
    '未识别到 LaTeX 公式，请尝试 PP-StructureV3 或 PaddleOCR-VL 识别流程。',
  'Parse error: {message}': '解析错误：{message}',
  'Search history...': '搜索历史记录…',
  'Clear All': '全部清空',
  'Clear all history?': '确定清空全部历史记录吗？',
  'No history yet.': '暂无历史记录。',
  Delete: '删除',
  'Drag to select a region. Press Esc or right-click to cancel.':
    '拖动选择区域，按 Esc 或单击右键取消。',
  'Selection too small. Select a larger area, or press Esc to cancel.':
    '所选区域过小，请选择更大范围，或按 Esc 取消。',
  'Could not load settings. Please reopen the app.': '无法加载设置，请重新打开应用。',
  'Could not start screen capture.': '无法开始截图。',
  'Unsupported file type': '不支持此文件类型',
  'Could not read the image file.': '无法读取图片文件。',
  'Could not check the local model.': '无法检查本地模型。',
  'Recognition in progress. Please wait.': '正在识别，请稍候。',
  'No image found in the clipboard.': '剪贴板中没有图片。',
  'Could not read the clipboard image.': '无法读取剪贴板图片。',
  'Copied!': '已复制！',
  'Recognized successfully. Copy failed; use the Copy button to retry.':
    '识别成功，但复制失败，请点击“复制”重试。',
  'Could not copy. Please try again.': '复制失败，请重试。',
  'Could not update recognition history.': '无法更新识别历史记录。',
  'Could not load history.': '无法加载历史记录。',
  'Could not delete the history item.': '无法删除这条历史记录。',
  'Could not clear history.': '无法清空历史记录。',
  'Could not apply this setting.': '无法应用此设置。',
  'Recognition failed': '识别失败',
  'Invalid settings.': '设置无效。',
  'Unsupported OCR engine.': '不支持此识别引擎。',
  'Local model directory must be a valid path.': '本地模型目录必须是有效路径。',
  'API URL must be text.': 'API 地址必须为文本。',
  'Enter a valid HTTP or HTTPS API URL.': '请输入有效的 HTTP 或 HTTPS API 地址。',
  'Enter an HTTP or HTTPS API URL without credentials or a fragment.':
    '请输入不含登录凭据或片段标识的 HTTP 或 HTTPS API 地址。',
  'Access Token must be text.': '访问令牌必须为文本。',
  'Snip Hotkey cannot be empty.': '截图快捷键不能为空。',
  'Unsupported OCR pipeline.': '不支持此识别流程。',
  'Unsupported output format.': '不支持此输出格式。',
  'Unsupported theme.': '不支持此主题。',
  'Unsupported language.': '不支持此语言。',
  'History Limit must be a whole number between 10 and 500.':
    '历史记录上限必须为 10 到 500 之间的整数。',
  'Invalid snip hotkey. Use an accelerator such as CommandOrControl+Shift+S.':
    '截图快捷键无效，请使用 CommandOrControl+Shift+S 等组合。',
  'This snip hotkey is unavailable. Choose a different shortcut.':
    '此截图快捷键不可用，请选择其他组合。',
  'Enter an API URL before enabling PaddleOCR.': '启用 PaddleOCR 前，请先填写 API 地址。',
  'API URL not configured. Please set it in Settings.': '尚未配置 API 地址，请在设置中填写。',
  'API URL not configured.': '尚未配置 API 地址。',
  'Authentication failed. Check your Access Token and API URL in Settings.':
    '身份验证失败，请检查设置中的访问令牌和 API 地址。',
  'API rate limit reached. Please wait and retry.': 'API 请求频率已达上限，请稍后重试。',
  'Request timed out. Please retry.': '请求超时，请重试。',
  'Cannot reach the API. Check your network and API URL in Settings.':
    '无法连接 API，请检查网络和设置中的 API 地址。',
  'API endpoint not found (HTTP 404). Check your API URL in Settings.':
    '找不到 API 接口（HTTP 404），请检查设置中的 API 地址。',
  'Unexpected PaddleOCR response. Check that the API URL points to an OCR endpoint.':
    'PaddleOCR 返回了意外内容，请确认 API 地址指向识别接口。',
  'A model operation is in progress. Please wait.': '正在处理模型，请稍候。',
  'Another model operation is in progress. Please wait.': '正在进行另一项模型操作，请稍候。',
  'Model is already ready. Clear the model cache before downloading again.':
    '模型已就绪，如需重新下载，请先清理模型缓存。',
  'Wait for model setup or recognition to finish before clearing the model cache.':
    '请等待模型配置或识别完成后，再清理模型缓存。',
  'The local model cache is being cleared. Please wait.': '正在清理本地模型缓存，请稍候。',
  'The model cache parent is not a regular application directory.':
    '模型缓存的上级目录不是普通应用目录，无法安全清理。',
  'Invalid application model cache location.': '应用模型缓存位置无效。',
  'The model cache directory changed during cleanup.': '清理期间模型缓存目录发生变化。',
  'The model cache directory changed before cleanup could be cancelled.':
    '取消清理前，模型缓存目录发生了变化。',
  'Cache cleanup failed.': '缓存清理失败。',
  'Could not restore the model cache.': '无法恢复模型缓存。',
  'The local model process has not exited. Please retry.': '本地模型进程尚未退出，请重试。',
  'Select an absolute local model folder path.': '请选择本地模型文件夹的绝对路径。',
  'Select an accessible folder containing the MFR-1.5 model files.':
    '请选择可访问且包含 MFR-1.5 模型文件的文件夹。',
  'Download all eight original files from the linked MFR-1.5 revision, then select the folder containing them.':
    '请从链接中的 MFR-1.5 固定版本下载全部八个原始文件，再选择包含这些文件的文件夹。',
  'Model download cancelled or timed out. Please retry.': '模型下载已取消或超时，请重试。',
  'Could not connect to the model download server in time. Check your network or system proxy and retry.':
    '连接模型下载服务器超时，请检查网络或系统代理后重试。',
  'Could not reach the model download server. Check your network or system proxy and retry.':
    '无法连接模型下载服务器，请检查网络或系统代理后重试。',
  'You can also download the eight model files from Hugging Face and use Import Existing Model.':
    '也可从 Hugging Face 下载八个模型文件，再点击“导入已有模型”。',
  'MFR-1.5 model is not ready. Download it or use Import Existing Model in Settings.':
    'MFR-1.5 模型尚未就绪，请在设置中下载模型或点击“导入已有模型”。',
  'Local recognition is already running. Please wait.': '本地识别正在进行，请稍候。',
  'Invalid image or image exceeds 25 MB. Please crop a smaller formula.':
    '图片无效或超过 25 MB，请截取更小的公式区域。',
  'Local recognition stopped. Please retry.': '本地识别已停止，请重试。',
  'Local recognition timed out. Please crop a smaller formula and retry.':
    '本地识别超时，请截取更小的公式后重试。',
  'The local model process failed to start.': '本地模型进程启动失败。',
  'The local model process exited. Please retry.': '本地模型进程已退出，请重试。',
  'Local model returned no formula.': '本地模型未返回公式。',
  'No display is available for screen capture.': '没有可用于截图的显示器。',
  'The captured image is empty or invalid.': '截图为空或无效。',
  'Secure token storage is unavailable. Enable your system keyring and try again.':
    '安全令牌存储不可用，请启用系统密钥环后重试。',

  // Result view
  Result: '结果',
  'New Snip ({hotkey})': '新建截图（{hotkey}）',
  'Snip a formula to get LaTeX': '截取公式，获取 LaTeX',
  'Snip from any app': '在任意应用中截图',
  'Paste an image': '粘贴图片',
  'Drop an image file here': '将图片文件拖到此处',
  'Drop the image to recognize it': '松开鼠标即可识别图片',
  'Show the captured image': '查看截图原图',
  'Nothing to preview.': '没有可预览的内容。',
  'LaTeX source': 'LaTeX 源码',
  'Markdown source': 'Markdown 源码',
  'Edit the source to correct the result; copies and history use your changes.':
    '可直接修改源码来纠正结果，复制内容和历史记录会同步使用修改后的版本。',
  Edited: '已修改',
  Reset: '还原',
  'The model was unsure about at least one symbol. Please check the result.':
    '模型对至少一个符号不太确定，请核对结果。',
  'Copy as': '复制为',
  'Change the copy style in Settings.': '可在设置中更改复制格式。',
  'Plain LaTeX source': '纯 LaTeX 源码',
  'Inline math for Markdown and LaTeX documents': '行内公式，适用于 Markdown 和 LaTeX 文档',
  'Display math for Markdown and LaTeX documents': '独立公式，适用于 Markdown 和 LaTeX 文档',
  'LaTeX display math': 'LaTeX 独立公式',
  'Numbered LaTeX equation environment': '带编号的 LaTeX equation 环境',
  'MathML, pastes as an editable equation in Microsoft Word':
    'MathML，粘贴到 Microsoft Word 中会成为可编辑公式',
  'Copied to clipboard': '已复制到剪贴板',
  'Copied as MathML': '已复制为 MathML',
  'Click to open OpenMathpix': '点击打开 OpenMathpix',
  'OpenMathpix is still running': 'OpenMathpix 仍在运行',
  'Use the snip shortcut any time. To exit, right-click the tray icon and choose Exit.':
    '随时可以使用截图快捷键。如需退出，请右键单击托盘图标并选择“退出”。',
  Close: '关闭',
  'The snip hotkey {hotkey} is used by another application. Choose a different shortcut in Settings.':
    '截图快捷键 {hotkey} 已被其他应用占用，请在设置中更换快捷键。',
  'No key was received. If you pressed a shortcut, another application is probably using it. Try a different one.':
    '没有收到按键。如果你按的是快捷键，它很可能已被其他应用占用，请换一个。',
  'This shortcut is used by another application, so it does not work. Choose a different shortcut, or close that application and retry.':
    '该快捷键已被其他应用占用，目前无法使用。请更换快捷键，或关闭占用它的应用后重试。',
  'Could not apply the copy style; copied plain LaTeX instead.':
    '无法转换为所选复制格式，已改为复制纯 LaTeX。',
  'Could not save your changes to history.': '无法将修改保存到历史记录。',

  // History
  Open: '打开',
  'No matching history.': '没有匹配的历史记录。',

  // Settings
  Snipping: '截图',
  'After a snip': '截图完成后',
  'Show the result window': '显示结果窗口',
  'Bring OpenMathpix to the front to review and edit the result.':
    '将 OpenMathpix 切换到前台，便于查看和修改结果。',
  'Copy in the background': '后台复制',
  'Stay in your current app. The result is copied and a notification appears.':
    '留在当前应用中，识别结果会自动复制，并弹出提示。',
  'Press the new shortcut. Esc cancels.': '请按下新的快捷键，按 Esc 取消。',
  'Click to change': '点击修改',
  Output: '输出',
  'Opened after recognition and copied automatically.': '识别完成后打开此格式并自动复制。',
  'LaTeX copy style': 'LaTeX 复制格式',
  'Used for automatic copying and the Copy button on the LaTeX tab.':
    '用于自动复制和 LaTeX 标签页的“复制”按钮。',
  'Tidy local model LaTeX': '整理本地模型输出的 LaTeX',
  'Removes extra spaces and redundant braces, e.g. b ^ { 2 } becomes b^{2}. The formula itself is unchanged. Applies to new recognitions.':
    '去除多余空格和冗余花括号，例如 b ^ { 2 } 会变为 b^{2}，公式本身不变。仅对之后的识别生效。',
  'Appearance and History': '外观与历史记录',
  'Download source': '下载源',
  'Hugging Face (official)': 'Hugging Face（官方）',
  'hf-mirror.com (mirror)': 'hf-mirror.com（镜像）',
  'Try the mirror if Hugging Face is slow or unreachable. Every file is verified with SHA-256 either way.':
    '如果 Hugging Face 速度慢或无法访问，可改用镜像。无论使用哪个下载源，每个文件都会进行 SHA-256 校验。',
  'Unsupported snip action.': '不支持此截图后操作。',
  'Unsupported LaTeX copy style.': '不支持此 LaTeX 复制格式。',
  'LaTeX cleanup must be on or off.': 'LaTeX 整理选项必须为开启或关闭。',
  'Unsupported model download source.': '不支持此模型下载源。',
  'Invalid history update.': '历史记录更新无效。',
  'Invalid clipboard text.': '剪贴板内容无效。',
} as const;

export type TranslationKey = keyof typeof chinese;
export type TranslationParams = Record<string, string | number>;

export function translate(
  language: Language,
  key: TranslationKey,
  params: TranslationParams = {},
): string {
  const message: string = language === 'zh-CN' ? chinese[key] : key;
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder,
  );
}

const engineErrors: Record<string, string> = {
  'TexTeller 模型文件不兼容或已损坏，请重新下载模型。':
    'The TexTeller model files are incompatible or corrupt. Please download the model again.',
  'TexTeller 引擎已关闭，请重新启用本地识别。':
    'The TexTeller engine has closed. Please enable local recognition again.',
  'TexTeller 正在识别另一张截图，请稍候再试。':
    'TexTeller is recognizing another screenshot. Please wait and retry.',
  'MFR 模型配置无效，请重新下载模型。':
    'Invalid MFR configuration. Please download the model again.',
  'MFR 图像处理配置不兼容，请重新下载官方 MFR-1.5 模型。':
    'Incompatible image processing configuration. Please download the official MFR-1.5 model again.',
  '截图为空，请重新框选公式。': 'The screenshot is empty. Please capture the formula again.',
  '截图文件超过 25 MB，请缩小框选范围。':
    'The screenshot exceeds 25 MB. Please select a smaller region.',
  '无法读取截图，请使用有效的 PNG/JPEG 图片并缩小框选范围。':
    'Cannot read the image. Use a valid PNG/JPEG image and select a smaller region.',
  '截图无法转换为 RGB 图片。': 'Cannot convert the screenshot to an RGB image.',
  '截图中没有可辨认的公式，请重新框选公式区域。':
    'No recognizable formula in the screenshot. Please capture a formula region again.',
  'MFR ONNX 模型接口不兼容，请重新下载官方 MFR-1.5 模型。':
    'Incompatible ONNX model. Please download the official MFR-1.5 model again.',
  'MFR 生成配置不兼容，请重新下载官方 MFR-1.5 模型。':
    'Incompatible generation configuration. Please download the official MFR-1.5 model again.',
  '本地公式识别超时，请缩小截图范围或减少公式长度后重试。':
    'Local formula recognition timed out. Select a smaller region or a shorter formula and retry.',
  'MFR encoder 返回了无效结果，请重新下载模型。':
    'The MFR encoder returned an invalid result. Please download the model again.',
  'MFR decoder 返回了无效结果，请重新下载模型。':
    'The MFR decoder returned an invalid result. Please download the model again.',
  'MFR 返回了无效概率，请重试或重新下载模型。':
    'MFR returned invalid probabilities. Retry or download the model again.',
  '没有识别到公式，请框选清晰的单个公式后重试。':
    'No formula recognized. Capture a clear single formula and retry.',
  'MFR 引擎已关闭，请重新启用本地识别。':
    'The MFR engine has closed. Please enable local recognition again.',
  'MFR 正在识别另一张截图，请稍候再试。':
    'MFR is recognizing another screenshot. Please wait and retry.',
  'MFR tokenizer.json 格式不正确，请重新下载模型。':
    'Invalid tokenizer.json. Please download the model again.',
  'MFR 需要 ByteLevel BPE tokenizer，请重新下载官方 MFR-1.5 模型。':
    'MFR requires a ByteLevel BPE tokenizer. Please download the official MFR-1.5 model again.',
  'MFR tokenizer 的词表 ID 无效，请重新下载模型。':
    'Invalid tokenizer vocabulary IDs. Please download the model again.',
  'MFR tokenizer 含有无效的 ByteLevel 字符。':
    'The MFR tokenizer contains an invalid ByteLevel character.',
  'MFR tokenizer 词表为空，请重新下载模型。':
    'The MFR tokenizer vocabulary is empty. Please download the model again.',
};

const translatedMessages = (Object.entries(chinese) as [TranslationKey, string][])
  // Short UI labels are exact-match only: replacing "Text" inside a path or Pix2Text
  // would corrupt diagnostics. Only complete messages may occur in composed toasts.
  .filter(
    ([key]) => !key.includes('{') && ((key.length > 25 && /[.!?]$/.test(key)) || key === 'Copied!'),
  )
  .sort(([a], [b]) => b.length - a.length);

/** Translate display messages only. Model output, file paths and technical details are preserved. */
export function localizeError(language: Language, original: string): string {
  const message = original.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
  if (language === 'en') {
    if (engineErrors[message]) return engineErrors[message];
    return message
      .replace(
        /^公式输出超过 (\d+) 个 token，结果可能不完整，请分别框选较短的公式。$/,
        'Formula output exceeded $1 tokens. Capture shorter formulas separately to avoid incomplete output.',
      )
      .replace(
        /^MFR 模型输入 (.+) 类型不兼容，请重新下载模型。$/,
        'Incompatible MFR input $1. Please download the model again.',
      )
      .replace(
        /^MFR 模型输出 (.+) 类型不兼容，请重新下载模型。$/,
        'Incompatible MFR output $1. Please download the model again.',
      )
      .replace(/^MFR 输出了无效的词表 ID：(.+)。$/, 'MFR returned an invalid vocabulary ID: $1.');
  }
  if (Object.prototype.hasOwnProperty.call(chinese, message))
    return chinese[message as TranslationKey];
  let translated = message;
  for (const [key, value] of translatedMessages) translated = translated.split(key).join(value);
  return translated
    .replace(
      /^The model is disabled, but some cached files could not be removed\. Remaining cache: (.+)\. Close programs using these files and retry Clear Model Cache\.$/,
      '模型已停用，但部分缓存文件未能删除。剩余缓存：$1。请关闭占用这些文件的程序，再次点击“清理模型缓存”。',
    )
    .replace(/Missing or unreadable files: (.+?)\.(?=\s|$)/g, '缺失或无法读取的文件：$1。')
    .replace(
      /Incomplete, corrupt, or incompatible files: (.+?)\.(?=\s|$)/g,
      '不完整、损坏或版本不匹配的文件：$1。',
    )
    .replace(
      /Model integrity check failed: (.+?)\. Please retry the download\./g,
      '模型文件校验失败：$1。请重新下载。',
    )
    .replace(
      /PaddleOCR server error \((\d+)\)\. Please retry later\./g,
      'PaddleOCR 服务错误（$1），请稍后重试。',
    )
    .replace(
      /Model download failed \(HTTP (\d+)\): (.+?)\.(?=\s|$)/g,
      '模型下载失败（HTTP $1）：$2。',
    );
}
