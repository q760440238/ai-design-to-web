export const MODEL_PROVIDER_PRESETS = [
  {
    id: 'cn-gpt55',
    name: 'CN API · GPT-5.5',
    description: '适合产品拆解、代码生成、页面还原和修复。',
    protocol: 'openai-compatible',
    baseUrl: import.meta.env.VITE_GPT55_BASE_URL || 'https://api.ai6800.com',
    endpoint: import.meta.env.VITE_GPT55_CHAT_PATH || '/v1/chat/completions',
    responsesEndpoint: import.meta.env.VITE_GPT55_RESPONSES_PATH || '/v1/responses',
    model: import.meta.env.VITE_GPT55_MODEL || 'gpt-5.5',
    apiKey: import.meta.env.VITE_GPT55_API_KEY || '',
    temperature: 0.2
  },
  {
    id: 'cn-gemini31',
    name: 'CN API · Gemini 3.1 Pro',
    description: '适合审图、结构化标注、视觉 QA 和长上下文理解。',
    protocol: 'gemini',
    baseUrl: import.meta.env.VITE_GEMINI31_BASE_URL || 'https://api.ai6800.com/v1beta',
    endpoint: '',
    responsesEndpoint: '/v1/responses',
    model: import.meta.env.VITE_GEMINI31_MODEL || 'gemini-3.1-pro-preview',
    apiKey: import.meta.env.VITE_GEMINI31_API_KEY || '',
    temperature: 0.1
  },
  {
    id: 'cn-image2',
    name: 'CN API · GPT Image 2',
    description: '适合 UI 设计稿生成和图生图切图资产。',
    protocol: 'cn-image2',
    baseUrl: import.meta.env.VITE_IMAGE2_BASE_URL || 'https://api.ai6800.com',
    endpoint: import.meta.env.VITE_IMAGE2_GENERATE_PATH || '/v1/media/generate',
    statusEndpoint: import.meta.env.VITE_IMAGE2_STATUS_PATH || '/v1/media/status',
    model: import.meta.env.VITE_IMAGE2_MODEL || 'gpt-image-2',
    apiKey: import.meta.env.VITE_IMAGE2_API_KEY || '',
    temperature: 0.2,
    size: import.meta.env.VITE_IMAGE2_DEFAULT_SIZE || '1024x1024',
    quality: import.meta.env.VITE_IMAGE2_DEFAULT_QUALITY || 'auto',
    pollIntervalMs: 3000,
    maxPollAttempts: 40
  },
  {
    id: 'openrouter',
    name: 'OpenRouter / 兼容网关',
    description: '适合把 Claude、GPT、Gemini、DeepSeek、Qwen 等统一成 OpenAI-compatible。',
    protocol: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    endpoint: '/chat/completions',
    responsesEndpoint: '/responses',
    model: 'openai/gpt-4.1',
    apiKey: '',
    temperature: 0.2
  },
  {
    id: 'ollama-local',
    name: 'Ollama 本地模型',
    description: '适合本地草稿、离线产品拆解和低成本预检查。',
    protocol: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    endpoint: '/chat/completions',
    responsesEndpoint: '/responses',
    model: 'qwen2.5-coder:latest',
    apiKey: 'ollama',
    temperature: 0.2
  }
]

export const WORKFLOW_ROUTE_TEMPLATES = [
  {
    id: 'openpencil-figma',
    name: 'OpenPencil / Figma 节点路线',
    stageId: 'stage-5',
    agentType: 'gemini-spec-agent',
    badge: '可编辑设计稿',
    description: '把设计稿转成可落到 Figma-like 画布的节点、tokens 和组件层级。',
    prompt: [
      '参考 OpenPencil 的“AI-native design editor + Figma/.fig + MCP + token/JSX/Tailwind 导出”方向，从 Stage 5 开始输出可编辑设计节点规格。',
      '请把输入设计稿拆成：design-node-tree.json、component-instances.json、design-tokens-final.json、layout-constraints.json、figma-export-notes.md。',
      '每个节点必须包含 name、type、bbox、autoLayout、fills、typography、constraints、textContent、semanticRole、htmlHint。',
      '同时输出 lint 规则：不要把文字和按钮切成图片；组件命名要稳定；token 必须可复用；Desktop/Mobile 要有响应式约束。',
      '目标是后续可以进入 OpenPencil/Figma Plugin/MCP 执行画布生成，再导出 JSX/Tailwind 或继续转 Vue。'
    ].join('\n')
  },
  {
    id: 'codesign-prototype',
    name: 'Open CoDesign 原型路线',
    stageId: 'stage-7',
    agentType: 'code-restore-agent',
    badge: '本地 BYOK 原型',
    description: '直接产出可运行 HTML/Vue 原型、文件树、预览和可下载交付物。',
    prompt: [
      '参考 Open CoDesign 的“BYOK、多模型、本地优先、Prompt 到 prototype/slides/PDF/ZIP”的方向，从 Stage 7 开始生成 Web 原型实现计划。',
      '请输出：files.json、index.html 或 Vue SFC、styles.css、asset-map.json、preview-checklist.md、handoff-to-figma.md。',
      '代码主体必须用 HTML/CSS/Vue 实现，图片只来自 asset-map.json；页面要响应式；不要生成营销式说明页。',
      '同时给出 sandbox 预览步骤、下载 ZIP 的文件结构，以及如果要导入 Figma 时应使用的截图/节点映射策略。'
    ].join('\n')
  },
  {
    id: 'prodotypor-scale',
    name: 'Prodotypor 多页面路线',
    stageId: 'stage-1',
    agentType: 'product-agent',
    badge: '30-100 页面规划',
    description: '先拆 PRD、页面清单、设计模式研究，再进入批量生成。',
    prompt: [
      '参考 Prodotypor 的“产品想法到 Figma screens 的多 Agent 分阶段流程”，从 Stage 1 开始把产品拆成可批量设计的页面计划。',
      '请输出：prd-final.md、backlog.yaml、pages.yaml、user-flows.md、component-inventory.md、design-system-brief.md。',
      '页面规划要分 P0/P1/P2，每个页面包含目标、关键状态、核心组件、数据需求、空/错/加载状态、是否需要 image2 生成复杂资产。',
      '后续 Stage 3 只先跑 1 个 P0 页面验证链路，再复制到 30-100 页面批处理。'
    ].join('\n')
  }
]

const ARTIFACTS_BY_AGENT = {
  'product-agent': [
    ['prd-final.md', '产品目标、用户、范围、P0/P1/P2 页面'],
    ['pages.yaml', '页面清单、路由、状态和优先级'],
    ['copywriting.md', '真实可用的界面文案']
  ],
  'style-agent': [
    ['visual-direction.md', '品牌气质、参考风格和禁用项'],
    ['design-tokens-draft.json', '颜色、字体、间距、圆角和阴影 token 草案'],
    ['image2-style-constraints.md', '给 image2 的统一视觉约束']
  ],
  'image2-ui-agent': [
    ['image2-ui-prompt.md', 'Desktop/Mobile 高保真 UI 设计稿提示词'],
    ['selected-ui-desktop.png', '最终入选 Desktop 设计稿'],
    ['selected-ui-mobile.png', '最终入选 Mobile 设计稿']
  ],
  'gemini-review-agent': [
    ['gemini-review.md', '设计稿质量、可还原性和重生成建议'],
    ['design-risk-list.md', 'P0/P1/P2 视觉和实现风险'],
    ['next-regenerate-prompt.md', '需要回到 image2 时的修正提示词']
  ],
  'gemini-spec-agent': [
    ['design-spec.json', '页面结构、节点、组件和布局约束'],
    ['component-instances.json', '组件实例、状态、文案和语义角色'],
    ['design-tokens-final.json', '最终 token 映射']
  ],
  'gpt-asset-audit-agent': [
    ['missing-icon-audit.json', '小图标、徽章、装饰符号和局部视觉切图缺失清单'],
    ['asset-gap-report.md', '按区块说明哪些切图缺失、为什么需要补图'],
    ['image2-icon-prompts.md', '交给 image2 生成小图标切图的提示词']
  ],
  'gpt-html-visual-review-agent': [
    ['html-visual-diff.json', 'UI 设计图与 HTML 截图的视觉差异、代码问题和缺失切图清单'],
    ['html-repair-plan.md', '按优先级整理的 HTML/CSS 修复计划'],
    ['missing-assets-from-html-review.json', 'HTML 复核阶段发现的补切图清单']
  ],
  'image2-assets-agent': [
    ['asset-prompts.md', '每个复杂图片资产的图生图提示词'],
    ['generated-assets/*', '按固定张数或自由规划数量生成的一整套切图'],
    ['asset-map.json', '资产名称、用途、尺寸和引用路径'],
    ['asset-lint.md', '确认没有把 HTML 元素切成图片']
  ],
  'code-restore-agent': [
    ['files.json', '待生成文件树和依赖说明'],
    ['Vue pages / HTML files', '可同时放进画布预览的多页面代码'],
    ['responsive-checklist.md', 'Desktop/Mobile 还原检查项']
  ],
  'qa-agent': [
    ['visual-qa-report.md', '设计稿与页面截图差异报告'],
    ['fix-ticket-list.md', 'P0/P1/P2 修复票据'],
    ['acceptance-record.md', '验收结论和剩余风险']
  ],
  'code-fix-agent': [
    ['patch-plan.md', '具体修复方案'],
    ['changed-files.md', '修改文件和原因'],
    ['recheck-report.md', '复验结果']
  ],
  'delivery-agent': [
    ['delivery-summary.md', '最终交付物和版本说明'],
    ['known-issues.md', '已知问题和边界'],
    ['next-roadmap.md', '下一阶段扩展计划']
  ]
}

export const DESIGN_LINT_RULES = [
  '文本、按钮、导航、表格、表单必须用 HTML/CSS 实现，不进入切图。',
  '设计稿专属小图标、徽章、装饰符号可以进入切图；只切图形本身，不切旁边文字。',
  '每个页面必须同时考虑 Desktop 和 Mobile 视口。',
  '每个视觉资产必须有明确用途、尺寸、命名和替代文本。',
  '设计 token 必须覆盖颜色、字体、间距、圆角、阴影和状态色。',
  'Figma/OpenPencil 节点命名应稳定，避免自动生成的无语义名称。'
]

export function createModelConfigFromPreset(preset, suffix = Date.now()) {
  return {
    id: `${preset.id}-${suffix}`,
    name: preset.name,
    protocol: preset.protocol,
    baseUrl: preset.baseUrl,
    endpoint: preset.endpoint || '',
    responsesEndpoint: preset.responsesEndpoint || '/v1/responses',
    statusEndpoint: preset.statusEndpoint || '/v1/media/status',
    model: preset.model,
    apiKey: preset.apiKey || '',
    temperature: preset.temperature ?? 0.2,
    size: preset.size || '1024x1024',
    quality: preset.quality || 'auto',
    pollIntervalMs: preset.pollIntervalMs || 3000,
    maxPollAttempts: preset.maxPollAttempts || 40
  }
}

export function applyModelPreset(target, preset) {
  Object.assign(target, createModelConfigFromPreset(preset, target.id || Date.now()), {
    id: target.id || `${preset.id}-${Date.now()}`
  })
}

export function artifactManifestForAgentType(agentType) {
  return (ARTIFACTS_BY_AGENT[agentType] || ARTIFACTS_BY_AGENT['delivery-agent']).map(([name, description]) => ({
    name,
    description
  }))
}

export function artifactManifestForRun(run) {
  if (!run?.agent?.type) return []
  return artifactManifestForAgentType(run.agent.type)
}

export function artifactPromptForAgent(agentType) {
  return artifactManifestForAgentType(agentType)
    .map((artifact) => `- ${artifact.name}：${artifact.description}`)
    .join('\n')
}
