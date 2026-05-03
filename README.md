# AI Design to Web

一个前后端分离的 AI UI 工作流控制台，目标是替代传统 UI 设计师和产品原型设计师在早期方案阶段的大量重复工作。用户只需要用自然语言描述产品、页面、风格和业务约束，系统就可以自动完成产品原型拆解、UI 设计图生成、切图补齐、HTML 还原、视觉复核和 Figma 交接。

后端使用 Go 提供 REST API，前端使用 Vue 3 + Vite 实现可视化执行面板、文档阅读、阶段状态管理和对话式 Agent 调度。

## 产品定位

AI Design to Web 面向“从一句产品需求到可评审原型”的完整设计生产线：

- 替代 UI 设计师的工作：自动生成移动端/网页端高保真 UI 设计图、视觉风格、页面结构、图标和复杂视觉切图。
- 替代产品原型设计师的流程工作：自动拆 PRD、页面清单、组件结构、交互说明和可交付 HTML 原型。
- 替代人工切图和走查：用 Gemini 3.1 + GPT-5.5 多轮复核 UI 图、切图资产和最终 HTML，发现缺失切图后继续调用 GPT Image 2 补齐。
- 连接 Figma 工作流：可生成 Figma 本地插件导入包，把 UI 设计图、HTML 效果截图、切图网格、设计 token 和节点骨架自动写入 Figma 页面，方便后续精修、评审或交付。

> Figma 原生 `.fig` 格式不是公开标准。本项目的可靠路线是“导出 Figma 导入包 → 在 Figma 桌面端运行本地插件 → 自动创建页面并导入素材和规格骨架”，而不是伪造不可用的原生 `.fig` 文件。

## 开源协议

本项目使用 [MIT License](./LICENSE) 开源。

## 项目结构

```text
ai-design-to-web/
  backend/
    cmd/server/
    internal/httpapi/
    internal/workflow/
  frontend/
    src/
      components/
      services/
```

## 本地启动

启动后端：

```bash
cd backend
PORT=8081 go run ./cmd/server
```

启动前端：

```bash
cd frontend
npm install
VITE_API_BASE=http://localhost:8081/api npm run dev
```

默认地址：

```text
后端：http://localhost:8081
前端：http://localhost:5173
Make 页面：http://localhost:5173/make
单图生成页面：http://localhost:5173/image-make
```

真实生成 15 页海鲜配送 App：

```bash
node scripts/generate-seafood-delivery.mjs
```

生成后打开：

```text
http://localhost:5173/make?project=seafood-delivery-15
```

## 配置项

可以从 `.env.example` 复制一份本地 `.env`，再填入自己的模型服务配置。不要把真实 API Key 提交到仓库。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | Go API 服务端口 |
| `WORKFLOW_STORE_PATH` | `data/workflow-state.json` | 阶段状态持久化文件，从 `backend` 目录启动时对应 `backend/data/workflow-state.json` |
| `IMAGE_MAKE_HISTORY_DB_PATH` | `data/image-make-history.sqlite` | 单图生成历史 SQLite 数据库路径，从 `backend` 目录启动时对应 `backend/data/image-make-history.sqlite` |
| `WORKFLOW_DOCS_ROOT` | 自动向上查找 | Markdown 模板文档所在目录 |
| `VITE_API_BASE` | `/api` | 前端调用后端的 API 前缀 |
| `VITE_API_PROXY_TARGET` | `http://localhost:8081` | Vite dev server 代理到 Go 后端的地址；本机 8080 被占用时使用 8081 |
| `VITE_GPT55_BASE_URL` | `https://api.ai6800.com` | GPT-5.5 的 CN API Base URL，从工作区根目录 `.env` 读取 |
| `VITE_GPT55_MODEL` | `gpt-5.5` | 默认聊天/代码模型 |
| `VITE_GPT55_CHAT_PATH` | `/v1/chat/completions` | GPT-5.5 Chat Completions 端点 |
| `VITE_GPT55_RESPONSES_PATH` | `/v1/responses` | GPT-5.5 Responses API 端点 |
| `VITE_GPT55_API_KEY` | `${model_gpt_key}` | GPT-5.5 默认 Key，当前从 `.env` 的 `model_gpt_key` 引用 |
| `VITE_GEMINI31_BASE_URL` | `https://api.ai6800.com/v1beta` | Gemini 3.1 Pro 的 CN API Base URL，从工作区根目录 `.env` 读取 |
| `VITE_GEMINI31_MODEL` | `gemini-3.1-pro-preview` | 默认审图、结构化标注和视觉 QA 模型 |
| `VITE_GEMINI31_API_KEY` | `${model_gemini_key}` | Gemini 3.1 Pro 默认 Key，当前从 `.env` 的 `model_gemini_key` 引用 |
| `VITE_IMAGE2_BASE_URL` | `https://api.ai6800.com` | GPT Image 2 的 CN API Base URL，从工作区根目录 `.env` 读取 |
| `VITE_IMAGE2_MODEL` | `gpt-image-2` | 默认图片生成模型 |
| `VITE_IMAGE2_GENERATE_PATH` | `/v1/media/generate` | GPT Image 2 创建任务端点 |
| `VITE_IMAGE2_STATUS_PATH` | `/v1/media/status` | GPT Image 2 查询任务端点 |
| `VITE_IMAGE2_DEFAULT_SIZE` | `1024x1024` | 默认图片尺寸 |
| `VITE_IMAGE2_DEFAULT_QUALITY` | `auto` | 默认图片质量 |
| `VITE_IMAGE2_API_KEY` | `${image2_key}` | GPT Image 2 默认 Key，当前从 `.env` 的 `image2_key` 引用 |

说明：

- 阶段状态会保存到 `backend/data/workflow-state.json`，该文件属于本地运行态数据，已加入 `.gitignore`。
- 单图生成历史会同时保存到浏览器 `localStorage` 和 SQLite，SQLite 默认文件是 `backend/data/image-make-history.sqlite`，该运行态数据库已加入 `.gitignore`。
- 文档库会读取真实 Markdown 文件内容，例如 `brief.md`、`prd.md`、`workflow-execution-plan.md`。
- 如果本机 `8080` 已被占用，可以像上面示例一样使用 `8081`。
- 修改工作区根目录 `.env` 后需要重启前端 dev server，Vite 才会重新读取 `VITE_GPT55_*`、`VITE_GEMINI31_*` 和 `VITE_IMAGE2_*` 配置。
- 写入 `VITE_*_API_KEY` 的 Key 会进入前端运行时，只建议本地单人使用；多人或线上部署建议继续在右上角“模型设置”里手动填 Key，或改为后端代理。

## 前端功能

- 工作流阶段看板：查看从需求、image2 设计稿、Gemini 审图、图生图切图到图生 HTML 的完整阶段。
- 对话式执行台：用自然语言调用产品原型 Agent、image2 UI Agent、image2 图生图切图 Agent、Gemini 审图 Agent、图生 HTML 还原 Agent。
- Make 独立页面：`/make` 提供类似 Figma Make 的三栏工作台，包括对话组件、Agent 执行过程组件和效果画布组件。
- 单图生成页面：`/image-make` 提供“对话生成单张 UI 图 → 生成对应切图 → 扫描并生成缺失切图 → 用图片和切图生成 HTML”的独立流水线，每个阶段都可下载，并自动保存历史到本地与 SQLite，刷新后可恢复产物。
- Figma 自动导入：`/image-make` 可导出 Figma 本地插件导入包，在 Figma 桌面端运行后会自动创建页面，并把 UI 图、HTML 截图、切图网格、设计规格和 token 写入 Figma 画布。
- HTML/素材完整打包：`/image-make` 可导出完整 HTML + 素材 ZIP、设计节点树和实验 `.fig` 交接文件，方便进入 Figma/OpenPencil/MCP 或代码还原流程继续精修。
- 细节扫描补切图：Gemini 会先复核 UI 设计图细节，再对比现有 asset-map，识别商品图、Hero、地图路线、状态插画等遗漏的复杂视觉资产，再交给 GPT Image 2 追加生成，避免 HTML 还原时缺图。
- HTML 还原前复核：重新生成 HTML 前会额外让 Gemini 复核一次设计图比例、区块顺序、真实文案、视觉资产边界和还原锚点，再把复核结果交给 Gemini HTML、GPT-5.5 代码审核和最终视觉 QA。
- image2 UI 设计稿批量：Stage 3 可设置固定张数或自由规划，逐张调用 image2，并在画布中展示每一张生成的 UI 设计图。
- 模型与 Agent 设置：页面右上角可配置多组模型的 Base URL、模型名和 API Key，并把不同 Agent 绑定到不同模型。
- 供应商预设：参考 Open CoDesign 的 BYOK/多模型思路，内置 CN API GPT-5.5、Gemini 3.1 Pro、GPT Image 2、OpenRouter 和 Ollama 本地模型预设。
- 路线模板：参考 OpenPencil、Open CoDesign、Prodotypor，Make 对话区可一键切换“可编辑设计稿”“本地 BYOK 原型”“多页面规划”三条执行路线。
- 产物协议：参考 OpenPencil 的设计节点、token 和导出理念，每个 Agent 都会展示应交付的文件清单和设计 Lint，方便进入 Figma/OpenPencil/MCP 或代码还原阶段。
- GPT-5.5 接入：默认文本与代码模型使用 CN API 的 `gpt-5.5`，支持 Chat Completions 和 Responses API。
- Gemini 3.1 Pro 接入：默认审图、结构化标注和视觉 QA 使用 CN API 的 `gemini-3.1-pro-preview`，走 Google Gemini `generateContent` 协议，并通过 `x-goog-api-key` 鉴权。
- Gemini 通道兜底：如果 `gemini-3.1-pro-preview` 返回渠道不可用、下线或参数组合不支持，前端会优先按 `x-goog-api-key`、Bearer、URL key 重试，再尝试 `VITE_GEMINI31_FALLBACK_MODELS` 配置的 Gemini 同族模型；全部失败后才把核心参考图和同一阶段任务交给 GPT-5.5 多模态接口继续执行。UI 设计图和切图生成仍强制走 GPT Image 2。
- GPT Image 2 接入：默认内置 `CN API · GPT Image 2` 协议，走 `POST /v1/media/generate` 创建任务，再轮询 `/v1/media/status` 获取图片结果。
- Web 端直连执行：开启后，Agent 任务由浏览器直接请求配置的模型接口，不再经过后端 `/api/agent-runs`。
- Agent 交接 Prompt：后端根据当前阶段、用户指令和关联 Markdown 文档生成可复制的 handoff prompt。
- 文档库：读取真实 Markdown 模板内容，并显示文件存在状态和大小。
- 试跑计划：根据产品名称、目标用户、P0 页面和视觉风格生成执行建议。

说明：默认仍使用后端模拟 Agent 调度层生成结构化执行建议和交接 prompt。需要真实模型执行时，可以在工作区根目录 `.env` 配好 `VITE_GPT55_*`、`VITE_GEMINI31_*` 和 `VITE_IMAGE2_*`，前端会在模型配置完整时自动允许 Web 端直连；也可以在右上角“模型设置”里手动填写并保存。右上角手动填写的 API Key 只保存在当前浏览器的 `localStorage`，不会提交给 Go 后端；写入 `VITE_*` 的 Key 会进入前端运行时，只适合本地工具场景。

## 参考路线

| 路线 | 借鉴点 | 当前项目落地 |
| --- | --- | --- |
| OpenPencil / Figma 节点路线 | AI-native 设计编辑器、Figma/.fig、MCP、design token、JSX/Tailwind 导出 | `Gemini 结构化标注 Agent` 输出节点树、组件实例、token 和 Figma/OpenPencil 交接说明 |
| Open CoDesign 原型路线 | BYOK、多模型、本地优先、Prompt 到 prototype/slides/PDF/ZIP | 模型设置预设 + `图生 HTML 还原 Agent` 输出 Vue/HTML 文件树、sandbox 预览和 ZIP 交付结构 |
| Prodotypor 多页面路线 | 产品想法到 Figma screens 的多 Agent 分阶段流程 | `产品原型 Agent` 输出 PRD、backlog、pages.yaml、component inventory，再批量进入 image2/Gemini/HTML 链路 |

## Figma 自动导入

`/image-make` 页面右上角的 `Figma 导入包` 会生成一个 ZIP，里面包含：

- `figma-plugin/manifest.json`：Figma 本地开发插件入口。
- `figma-plugin/code.js` / `ui.html`：自动导入脚本，会在当前 Figma 文件中新建页面。
- `assets/design/`：第一步生成或上传的 UI 设计图。
- `assets/generated/`：GPT Image 2 生成的切图、小图标和视觉素材。
- `assets/preview/`：HTML 还原后的效果截图。
- `design-node-tree.json` / `design-tokens.json`：给 Figma、OpenPencil 或后续 Agent 使用的结构化设计规格。
- `source/index.html`：当前 HTML 原型源码。

导入方式：

1. 在 `/image-make` 生成 UI 设计图、切图和 HTML。
2. 点击右上角 `Figma 导入包` 下载 ZIP。
3. 解压后打开 Figma 桌面端。
4. 进入 `Plugins > Development > Import plugin from manifest`。
5. 选择 `figma-plugin/manifest.json`。
6. 运行 `AI Design to Web Importer`，点击 `Import current export`。

完成后，Figma 会自动生成一个页面，放入 UI 设计图、HTML 效果截图、切图网格和可编辑的规格骨架。HTML 不能直接 1:1 转成完全可编辑的 Figma 图层，但这个导入包已经把继续精修所需的设计证据和素材集中到同一个 Figma 页面里。

## API

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 后端健康检查 |
| GET | `/api/workflow` | 获取工作流阶段、文档和汇总数据 |
| GET | `/api/documents` | 获取文档库列表 |
| GET | `/api/documents/{slug}` | 获取单个文档说明 |
| POST | `/api/agent-runs` | 根据阶段、Agent 类型和自然语言指令生成执行交接 prompt |
| POST | `/api/project-plans` | 根据产品信息生成执行建议 |
| PATCH | `/api/stages/{id}/status` | 更新阶段状态 |

## 验证

```bash
cd backend
go test ./...

cd ../frontend
npm run build
```
