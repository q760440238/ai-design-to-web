import { DESIGN_LINT_RULES, artifactPromptForAgent } from './workflowOptimizations'

const STORAGE_KEY = 'ai-design-to-web.agent-runtime.v1'
const IMAGE2_ENV_DEFAULTS = {
  baseUrl: import.meta.env.VITE_IMAGE2_BASE_URL || 'https://api.ai6800.com',
  model: import.meta.env.VITE_IMAGE2_MODEL || 'gpt-image-2',
  generatePath: import.meta.env.VITE_IMAGE2_GENERATE_PATH || '/v1/media/generate',
  statusPath: import.meta.env.VITE_IMAGE2_STATUS_PATH || '/v1/media/status',
  size: import.meta.env.VITE_IMAGE2_DEFAULT_SIZE || '1024x1024',
  quality: import.meta.env.VITE_IMAGE2_DEFAULT_QUALITY || 'auto',
  apiKey: import.meta.env.VITE_IMAGE2_API_KEY || ''
}
const GPT55_ENV_DEFAULTS = {
  baseUrl: import.meta.env.VITE_GPT55_BASE_URL || 'https://api.ai6800.com',
  model: import.meta.env.VITE_GPT55_MODEL || 'gpt-5.5',
  chatPath: import.meta.env.VITE_GPT55_CHAT_PATH || '/v1/chat/completions',
  responsesPath: import.meta.env.VITE_GPT55_RESPONSES_PATH || '/v1/responses',
  apiKey: import.meta.env.VITE_GPT55_API_KEY || ''
}
const GEMINI31_ENV_DEFAULTS = {
  baseUrl: import.meta.env.VITE_GEMINI31_BASE_URL || 'https://api.ai6800.com/v1beta',
  model: import.meta.env.VITE_GEMINI31_MODEL || 'gemini-3.1-pro-preview',
  fallbackModels: import.meta.env.VITE_GEMINI31_FALLBACK_MODELS || 'gemini-3.1-flash-lite-preview,gemini-3-pro-preview,gemini-3-flash-preview',
  apiKey: import.meta.env.VITE_GEMINI31_API_KEY || ''
}
const GEMINI_REFERENCE_COMPRESS_THRESHOLD = 700_000
const GEMINI_REFERENCE_MAX_LONG_EDGE = 1400
const GEMINI_REFERENCE_JPEG_QUALITY = 0.78
const IMAGE2_BATCH_CONCURRENCY = 3
const IMAGE2_BATCH_RETRY_COUNT = 2
const IMAGE2_PROMPT_MAX_CHARS = 4800

export const AGENT_PROFILES = [
  {
    type: 'product-agent',
    name: '产品原型 Agent',
    description: '把业务需求转成 PRD、页面结构、用户流程和真实文案。',
    mode: 'text-to-spec',
    defaultInstruction: '把模糊业务需求拆成产品原型、页面结构、用户流程、信息架构和真实可用文案。'
  },
  {
    type: 'style-agent',
    name: '视觉方向 Agent',
    description: '收敛品牌气质、设计 token、组件风格和 image2 视觉约束。',
    mode: 'text-to-style',
    defaultInstruction: '基于产品定位输出视觉方向、设计 token、组件气质和后续 image2 提示词约束。'
  },
  {
    type: 'image2-ui-agent',
    name: 'image2 UI 设计稿 Agent',
    description: '根据产品规格和视觉方向生成可还原的高保真 UI 设计稿提示词。',
    mode: 'text-to-image',
    defaultInstruction: '生成 image2 可直接使用的 UI 设计稿提示词，强调正视角网页截图、真实可读文案和可 HTML/CSS 还原。'
  },
  {
    type: 'gemini-review-agent',
    name: 'Gemini 审图 Agent',
    description: '审查设计稿质量、前端可还原性和是否能进入结构化标注。',
    mode: 'image-to-review',
    defaultInstruction: '审查设计稿质量、信息完整度、前端可还原性和进入结构化标注前的风险。'
  },
  {
    type: 'gemini-spec-agent',
    name: 'Gemini 结构化标注 Agent',
    description: '把设计稿转为 design-spec、layout、components、tokens 和 assets_needed。',
    mode: 'image-to-json',
    defaultInstruction: '把设计稿结构化成 sections、components、tokens、assets_needed 和 html_css_elements。'
  },
  {
    type: 'gpt-asset-audit-agent',
    name: 'GPT-5.5 小图标缺失审核 Agent',
    description: '二次查看设计稿和 asset-map，专门补查小图标、徽章、装饰符号和局部视觉切图缺口。',
    mode: 'image-to-json',
    defaultInstruction: '作为多模态审图模型，专门找出设计稿里未被 asset-map 覆盖的小图标、徽章、装饰符号和局部视觉资产；输出严格 JSON。'
  },
  {
    type: 'gpt-html-visual-review-agent',
    name: 'GPT-5.5 HTML 视觉复核 Agent',
    description: '对比 UI 设计图、HTML 效果截图和代码，找出视觉偏差、代码问题与缺失切图。',
    mode: 'image-compare-code-review',
    defaultInstruction: '作为多模态视觉与代码复核模型，直接比较设计图和 HTML 截图，结合源码与 asset-map 输出严格 JSON，包括差异、修复建议和缺失切图。'
  },
  {
    type: 'image2-assets-agent',
    name: 'image2 图生图切图 Agent',
    description: '基于设计稿局部重新生成 Hero、空状态、产品图等可用切图资产。',
    mode: 'image-to-image',
    defaultInstruction: '只处理需要图片化的复杂视觉资产和设计稿专属小图标，输出图生图提示词和 asset-map 约束，不要把文字、按钮、导航切成图片。'
  },
  {
    type: 'code-restore-agent',
    name: '图生 HTML 还原 Agent',
    description: '根据设计稿、结构化规格和切图资产生成 HTML/CSS/JS 或 Vue 页面。',
    mode: 'image-to-html',
    defaultInstruction: '把设计稿、结构化规格和资产映射转成可运行 Web 页面，主体必须用 HTML/CSS/Vue 还原。'
  },
  {
    type: 'gemini-html-agent',
    name: 'Gemini HTML 还原 Agent',
    description: '直接查看 UI 设计图、设计参数和切图资产，生成更贴近设计稿的 HTML。',
    mode: 'image-to-html',
    defaultInstruction: '先看设计图，再结合设计规格、设计参数和切图资产生成完整 HTML；必须贴近原图布局、尺寸、层级、颜色和间距。'
  },
  {
    type: 'code-review-agent',
    name: 'GPT-5.5 代码审核 Agent',
    description: '审查并修订 HTML/CSS/JS，补齐响应式、语义、资源引用和安全问题。',
    mode: 'code-review',
    defaultInstruction: '审查 HTML/CSS/JS 的结构、响应式、资源引用、可访问性和还原风险；必要时直接输出修订后的完整 HTML。'
  },
  {
    type: 'qa-agent',
    name: '视觉 QA Agent',
    description: '对比设计稿和页面截图，输出 P0/P1/P2 修复建议。',
    mode: 'image-compare',
    defaultInstruction: '对设计稿和页面截图做视觉验收，按 P0/P1/P2 输出位置、原因和具体修改建议。'
  },
  {
    type: 'code-fix-agent',
    name: '代码修复 Agent',
    description: '根据视觉 QA 结果修复前端代码并复验。',
    mode: 'code-fix',
    defaultInstruction: '根据视觉 QA 结果修复前端代码，并保持布局、响应式和可维护性。'
  },
  {
    type: 'delivery-agent',
    name: '交付归档 Agent',
    description: '整理最终产物、验收结果、已知问题和扩展计划。',
    mode: 'delivery',
    defaultInstruction: '整理最终交付物、验收记录、风险、已知问题和后续扩展建议。'
  }
]

const DEFAULT_MODEL_CONFIGS = [
  {
    id: 'text-model',
    name: 'GPT-5.5 文本与代码模型',
    protocol: 'openai-compatible',
    baseUrl: GPT55_ENV_DEFAULTS.baseUrl,
    endpoint: GPT55_ENV_DEFAULTS.chatPath,
    responsesEndpoint: GPT55_ENV_DEFAULTS.responsesPath,
    model: GPT55_ENV_DEFAULTS.model,
    apiKey: GPT55_ENV_DEFAULTS.apiKey,
    temperature: 0.2
  },
  {
    id: 'vision-model',
    name: 'Gemini 3.1 Pro 视觉理解模型',
    protocol: 'gemini',
    baseUrl: GEMINI31_ENV_DEFAULTS.baseUrl,
    endpoint: '',
    model: GEMINI31_ENV_DEFAULTS.model,
    fallbackModels: GEMINI31_ENV_DEFAULTS.fallbackModels,
    apiKey: GEMINI31_ENV_DEFAULTS.apiKey,
    temperature: 0.1
  },
  {
    id: 'image-model',
    name: 'GPT Image 2 图像模型',
    protocol: 'cn-image2',
    baseUrl: IMAGE2_ENV_DEFAULTS.baseUrl,
    endpoint: IMAGE2_ENV_DEFAULTS.generatePath,
    statusEndpoint: IMAGE2_ENV_DEFAULTS.statusPath,
    model: IMAGE2_ENV_DEFAULTS.model,
    apiKey: IMAGE2_ENV_DEFAULTS.apiKey,
    temperature: 0.2,
    size: IMAGE2_ENV_DEFAULTS.size,
    quality: IMAGE2_ENV_DEFAULTS.quality,
    pollIntervalMs: 3000,
    maxPollAttempts: 40
  }
]

const DEFAULT_AGENT_BINDINGS = {
  'product-agent': 'text-model',
  'style-agent': 'text-model',
  'image2-ui-agent': 'image-model',
  'gemini-review-agent': 'vision-model',
  'gemini-spec-agent': 'vision-model',
  'gpt-asset-audit-agent': 'text-model',
  'gpt-html-visual-review-agent': 'text-model',
  'image2-assets-agent': 'image-model',
  'code-restore-agent': 'text-model',
  'gemini-html-agent': 'vision-model',
  'code-review-agent': 'text-model',
  'qa-agent': 'vision-model',
  'code-fix-agent': 'text-model',
  'delivery-agent': 'text-model'
}

function defaultAgentBindings() {
  return Object.fromEntries(
    AGENT_PROFILES.map((agent) => [
      agent.type,
      {
        modelConfigId: DEFAULT_AGENT_BINDINGS[agent.type] || 'text-model',
        taskInstruction: agent.defaultInstruction
      }
    ])
  )
}

export function createDefaultAgentRuntimeSettings() {
  return {
    browserDirectEnabled: hasUsableDefaultModelConfigs(),
    modelConfigs: DEFAULT_MODEL_CONFIGS.map((config) => ({ ...config })),
    agentBindings: defaultAgentBindings()
  }
}

export function loadAgentRuntimeSettings() {
  if (typeof window === 'undefined') return createDefaultAgentRuntimeSettings()

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultAgentRuntimeSettings()
    return normalizeSettings(JSON.parse(raw))
  } catch {
    return createDefaultAgentRuntimeSettings()
  }
}

export function saveAgentRuntimeSettings(settings) {
  const normalized = normalizeSettings(settings)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent('agent-runtime-settings-changed', { detail: normalized }))
  return normalized
}

export function normalizeSettings(settings = {}) {
  const defaults = createDefaultAgentRuntimeSettings()
  const savedModels = Array.isArray(settings.modelConfigs) ? settings.modelConfigs : []
  const savedBindings = settings.agentBindings && typeof settings.agentBindings === 'object'
    ? settings.agentBindings
    : {}

  const modelConfigs = [
    ...DEFAULT_MODEL_CONFIGS.map((defaultConfig) => {
      const savedConfig = savedModels.find((item) => item.id === defaultConfig.id)
      const isLegacyEmptyImageModel = defaultConfig.id === 'image-model'
        && savedConfig?.protocol === 'openai-compatible'
        && !savedConfig?.baseUrl
        && !savedConfig?.model
      const isLegacyOpenAITextModel = defaultConfig.id === 'text-model'
        && savedConfig?.baseUrl === 'https://api.openai.com/v1'
        && savedConfig?.model === 'gpt-4o-mini'
        && !savedConfig?.apiKey
      const isLegacyGoogleVisionModel = defaultConfig.id === 'vision-model'
        && savedConfig?.baseUrl === 'https://generativelanguage.googleapis.com/v1beta'
        && ['gemini-3.1-pro', 'gemini-3.1-pro-preview'].includes(savedConfig?.model)
        && !savedConfig?.apiKey

      return {
        ...defaultConfig,
        ...(isLegacyEmptyImageModel || isLegacyOpenAITextModel || isLegacyGoogleVisionModel ? {} : savedConfig || {})
      }
    }),
    ...savedModels.filter((item) => !DEFAULT_MODEL_CONFIGS.some((defaultConfig) => defaultConfig.id === item.id))
  ].map((item, index) => ({
    id: item.id || `model-${Date.now()}-${index}`,
    name: item.name || '未命名模型',
    protocol: item.protocol || 'openai-compatible',
    baseUrl: item.baseUrl || '',
    endpoint: item.endpoint ?? '/chat/completions',
    responsesEndpoint: item.responsesEndpoint || GPT55_ENV_DEFAULTS.responsesPath,
    statusEndpoint: item.statusEndpoint || '/v1/media/status',
    model: item.model || '',
    fallbackModels: item.fallbackModels || DEFAULT_MODEL_CONFIGS.find((defaultConfig) => defaultConfig.id === item.id)?.fallbackModels || '',
    apiKey: item.apiKey || DEFAULT_MODEL_CONFIGS.find((defaultConfig) => defaultConfig.id === item.id)?.apiKey || '',
    temperature: Number.isFinite(Number(item.temperature)) ? Number(item.temperature) : 0.2,
    size: item.size || IMAGE2_ENV_DEFAULTS.size,
    quality: item.quality || IMAGE2_ENV_DEFAULTS.quality,
    pollIntervalMs: Number.isFinite(Number(item.pollIntervalMs)) ? Number(item.pollIntervalMs) : 3000,
    maxPollAttempts: Number.isFinite(Number(item.maxPollAttempts)) ? Number(item.maxPollAttempts) : 40
  }))

  const agentBindings = Object.fromEntries(
    AGENT_PROFILES.map((agent) => {
      const binding = savedBindings[agent.type] || defaults.agentBindings[agent.type]
      return [
        agent.type,
        {
          modelConfigId: binding?.modelConfigId || defaults.agentBindings[agent.type].modelConfigId,
          taskInstruction: binding?.taskInstruction || agent.defaultInstruction
        }
      ]
    })
  )

  return {
    browserDirectEnabled: settings.browserDirectEnabled === undefined
      ? defaults.browserDirectEnabled
      : Boolean(settings.browserDirectEnabled),
    modelConfigs,
    agentBindings
  }
}

export function ensureBrowserDirectEnabled(settings = {}, agentTypes = []) {
  const runtime = normalizeSettings(settings)
  if (runtime.browserDirectEnabled) return runtime
  if (!hasRunnableBrowserAgentSettings(runtime, agentTypes)) return runtime

  return {
    ...runtime,
    browserDirectEnabled: true
  }
}

export function hasRunnableBrowserAgentSettings(settings = {}, agentTypes = []) {
  const runtime = normalizeSettings(settings)
  const targetAgentTypes = agentTypes.length ? agentTypes : AGENT_PROFILES.map((agent) => agent.type)

  return targetAgentTypes.every((agentType) => {
    const normalizedAgentType = normalizeAgentType(agentType)
    const binding = runtime.agentBindings[normalizedAgentType]
    const modelConfig = runtime.modelConfigs.find((item) => item.id === binding?.modelConfigId)
    return isUsableModelConfig(modelConfig)
  })
}

export function getAgentProfile(agentType) {
  return AGENT_PROFILES.find((agent) => agent.type === agentType) || AGENT_PROFILES[0]
}

export function normalizeAgentType(agentType, message, stage) {
  if (agentType && agentType !== 'auto') return agentType

  const value = `${agentType || ''} ${message || ''}`.trim().toLowerCase()
  if (value.includes('图生html') || value.includes('html') || value.includes('code') || value.includes('还原')) {
    return 'code-restore-agent'
  }
  if (value.includes('图生图') || value.includes('image2') || value.includes('设计稿')) {
    return Number(stage?.number) >= 6 ? 'image2-assets-agent' : 'image2-ui-agent'
  }
  if (value.includes('gemini') || value.includes('审图') || value.includes('验收')) {
    return Number(stage?.number) >= 8 ? 'qa-agent' : 'gemini-review-agent'
  }
  if (value.includes('切图') || value.includes('asset')) return 'image2-assets-agent'
  if (value.includes('prd') || value.includes('产品') || value.includes('原型')) return 'product-agent'

  switch (Number(stage?.number)) {
    case 0:
    case 1:
      return 'product-agent'
    case 2:
      return 'style-agent'
    case 3:
      return 'image2-ui-agent'
    case 4:
      return 'gemini-review-agent'
    case 5:
      return 'gemini-spec-agent'
    case 6:
      return 'image2-assets-agent'
    case 7:
      return 'code-restore-agent'
    case 8:
      return 'qa-agent'
    case 9:
      return 'code-fix-agent'
    default:
      return 'delivery-agent'
  }
}

export async function runBrowserAgent({ request, stage, documents = [], settings }) {
  const agentType = normalizeAgentType(request.agentType, request.message, stage)
  const runtime = ensureBrowserDirectEnabled(settings || loadAgentRuntimeSettings(), [agentType])
  if (!runtime.browserDirectEnabled) {
    throw new Error('Web 端直连未开启，且当前 Agent 绑定的模型配置不完整。')
  }

  const agent = getAgentProfile(agentType)
  const binding = runtime.agentBindings[agent.type]
  const boundModelConfig = runtime.modelConfigs.find((item) => item.id === binding?.modelConfigId)
  const modelConfig = resolveModelConfigForAgent(runtime, agent, boundModelConfig)
  const fallbackModelConfig = resolveVisionFallbackModelConfig(runtime, agent, modelConfig)

  validateModelConfig(modelConfig, agent.name)
  validateAgentModelProtocol(agent, modelConfig)

  const handoffPrompt = buildHandoffPrompt(agent, stage, request.message, documents, request.designBatch, request.assetBatch)
  const modelResult = await callModel({
    modelConfig,
    agent,
    designBatch: request.designBatch,
    assetBatch: request.assetBatch,
    referenceImages: request.referenceImages || [],
    systemPrompt: buildSystemPrompt(agent, binding),
    userPrompt: handoffPrompt,
    fallbackModelConfig
  })
  const resolvedModelConfig = modelResult.modelConfig || modelConfig

  return {
    id: `web-agent-run-${Date.now()}`,
    createdAt: new Date().toISOString(),
    stageID: stage.id,
    stageId: stage.id,
    stageTitle: stage.title,
    agent,
    reply: modelResult.text,
    handoffPrompt,
    requiredInputs: stage.inputs || [],
    expectedOutputs: stage.outputs || [],
    checklist: agentChecklist(agent.type, stage),
    nextActions: agentNextActions(agent.type),
    suggestedStatus: stage.status === 'pending' ? 'active' : stage.status,
    relatedDocuments: documents,
    modelRun: {
      source: 'browser',
      configName: resolvedModelConfig.name,
      model: resolvedModelConfig.model,
      protocol: resolvedModelConfig.protocol,
      baseUrl: resolvedModelConfig.baseUrl,
      fallbackFrom: modelResult.fallbackFrom || ''
    },
    mediaResult: modelResult.mediaResult || null,
    designBatchArtifact: modelResult.designBatchArtifact || null,
    assetBatchArtifact: modelResult.assetBatchArtifact || null,
    htmlPagesArtifact: modelResult.htmlPagesArtifact || inferHtmlPagesArtifact(agent, modelResult.text)
  }
}

function validateModelConfig(modelConfig, agentName) {
  if (!modelConfig) {
    throw new Error(`${agentName} 没有绑定模型配置`)
  }
  if (!isFilledRuntimeValue(modelConfig.baseUrl)) {
    throw new Error(`${modelConfig.name} 缺少 Base URL`)
  }
  if (!isFilledRuntimeValue(modelConfig.model)) {
    throw new Error(`${modelConfig.name} 缺少模型名称`)
  }
  if (!isFilledRuntimeValue(modelConfig.apiKey)) {
    throw new Error(`${modelConfig.name} 缺少 API Key`)
  }
}

function resolveModelConfigForAgent(runtime, agent, boundModelConfig) {
  if (!requiresImage2Model(agent?.type) || boundModelConfig?.protocol === 'cn-image2') {
    return boundModelConfig
  }

  return runtime.modelConfigs.find((item) => item.protocol === 'cn-image2' && isUsableModelConfig(item)) || boundModelConfig
}

function validateAgentModelProtocol(agent, modelConfig) {
  if (requiresImage2Model(agent?.type) && modelConfig?.protocol !== 'cn-image2') {
    throw new Error(`${agent.name} 必须使用 GPT Image 2 图像模型（protocol=cn-image2）。请在右上角“模型设置”里确认该 Agent 绑定到 GPT Image 2 图像模型。`)
  }
}

function requiresImage2Model(agentType) {
  return ['image2-ui-agent', 'image2-assets-agent'].includes(agentType)
}

function resolveVisionFallbackModelConfig(runtime, agent, primaryModelConfig) {
  if (!canUseOpenAIVisionFallback(agent?.type) || primaryModelConfig?.protocol !== 'gemini') {
    return null
  }

  const usableConfigs = runtime.modelConfigs.filter((item) => {
    return isUsableModelConfig(item) && ['openai-compatible', 'openai-responses'].includes(item.protocol)
  })

  return usableConfigs.find((item) => item.id === 'text-model') || usableConfigs[0] || null
}

function canUseOpenAIVisionFallback(agentType) {
  return ['gemini-review-agent', 'gemini-spec-agent', 'gemini-html-agent', 'qa-agent'].includes(agentType)
}

async function tryGeminiModelFallbacks(modelConfig, systemPrompt, userPrompt, referenceImages = [], agent = null, originalError = null) {
  if (!isGeminiModelUnavailableError(originalError)) return null

  const fallbackModels = geminiFallbackModelNames(modelConfig)
  if (!fallbackModels.length) return null

  const fallbackReferences = selectCoreGeminiReferenceImages(referenceImages)
  for (const model of fallbackModels) {
    const nextModelConfig = {
      ...modelConfig,
      name: `${modelConfig.name} · ${model}`,
      model
    }
    try {
      const response = await callGemini(
        nextModelConfig,
        systemPrompt,
        userPrompt,
        fallbackReferences,
        agent
      )
      return {
        response,
        modelConfig: nextModelConfig
      }
    } catch {
      // Try the next Gemini model before leaving the Gemini family.
    }
  }

  return null
}

function geminiFallbackModelNames(modelConfig) {
  const configured = String(modelConfig.fallbackModels || GEMINI31_ENV_DEFAULTS.fallbackModels || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const candidates = configured.length
    ? configured
    : ['gemini-3.1-flash-lite-preview', 'gemini-3-pro-preview', 'gemini-3-flash-preview']
  const primary = String(modelConfig.model || '').trim()
  return [...new Set(candidates)].filter((model) => model && model !== primary)
}

function hasUsableDefaultModelConfigs() {
  return DEFAULT_MODEL_CONFIGS.every(isUsableModelConfig)
}

function isUsableModelConfig(modelConfig) {
  return Boolean(
    modelConfig
    && isFilledRuntimeValue(modelConfig.baseUrl)
    && isFilledRuntimeValue(modelConfig.model)
    && isFilledRuntimeValue(modelConfig.apiKey)
  )
}

function isFilledRuntimeValue(value) {
  const text = String(value || '').trim()
  return Boolean(text && !/^\$\{[^}]+\}$/.test(text))
}

function buildSystemPrompt(agent, binding) {
  return [
    `你是${agent.name}。`,
    binding?.taskInstruction || agent.defaultInstruction,
    '你需要直接完成用户交给你的任务，输出可复制到下一阶段使用的结果。',
    '使用中文，结构清晰，避免泛泛解释。'
  ].join('\n')
}

function buildHandoffPrompt(agent, stage, message, documents, designBatch, assetBatch) {
  const lines = [
    `当前 Agent：${agent.name}`,
    `当前阶段：Stage ${stage.number} - ${stage.title}`,
    `阶段目标：${stage.summary}`,
    `用户指令：${message || `请根据“${stage.title}”给出可执行下一步。`}`,
    '',
    '必须使用的输入：',
    ...(stage.inputs || []).map((item) => `- ${item}`),
    '',
    '必须产出的结果：',
    ...(stage.outputs || []).map((item) => `- ${item}`),
    '',
    '验收门禁：',
    ...(stage.gate || []).map((item) => `- ${item}`)
  ]

  if (documents.length) {
    lines.push('', '参考文档摘要：')
    documents.forEach((document) => {
      const content = String(document.content || document.description || '').trim().slice(0, 900)
      lines.push(`## ${document.title} (${document.path})`, content || document.description || '')
    })
  }

  if (agent.type === 'image2-ui-agent') {
    lines.push('', '额外约束：输出 image2 提示词，强调正视角网页截图、真实可读文字、不要设备外壳、不要透视图、不要把整页做成图片。')
    if (designBatch) {
      const normalizedBatch = normalizeDesignBatchConfig(designBatch, message)
      lines.push(
        '',
        'UI 设计稿批量约束：',
        `- 数量模式：${normalizedBatch.mode === 'free' ? '自由规划数量' : '固定张数'}`,
        `- ${normalizedBatch.mode === 'free' ? '规划张数' : '必须张数'}：${normalizedBatch.count}`,
        ...(normalizedBatch.mode === 'free' ? [`- 自由规划上限：${normalizedBatch.maxCount}`] : []),
        '- 每张设计稿必须是一张完整 UI 画面，包含真实可读中文文案、信息层级和业务状态。',
        '- 每张设计稿都要能被单独拿去给 Gemini 审图，再进入结构化标注和 HTML 还原。'
      )
    }
  }
  if (agent.type === 'image2-assets-agent') {
    lines.push('', '额外约束：输出图生图/切图提示词，只生成复杂视觉资产或设计稿专属小图标；不要包含标题、按钮、表单、表格、导航和状态标签本身。')
    if (assetBatch) {
      const normalizedBatch = normalizeAssetBatchConfig(assetBatch, message)
      lines.push(
        '',
        '切图批量约束：',
        `- 数量模式：${normalizedBatch.mode === 'free' ? '自由规划数量' : '固定张数'}`,
        `- ${normalizedBatch.mode === 'free' ? '规划张数' : '必须张数'}：${normalizedBatch.count}`,
        ...(normalizedBatch.mode === 'free' ? [`- 自由规划上限：${normalizedBatch.maxCount}`] : []),
        '- 每张资产必须输出独立 image2 图生图提示词、文件名、用途、尺寸、透明背景要求、alt 文案和 Web 引用路径。',
        '- 资产清单必须是一整套，不是单张图。'
      )
    }
  }
  if (agent.type === 'code-restore-agent') {
    lines.push('', '额外约束：输出前端实现代码或实现指令；页面主体必须用 HTML/CSS/JS 或 Vue 组件实现；图片只来自 asset-map.json；必须响应式；如果产品包含多个 P0 页面，请分别输出多个 HTML 页面代码块，供画布同时展示。')
  }
  if (agent.type === 'gemini-html-agent') {
    lines.push('', '额外约束：你必须把参考设计图当作第一依据，结合设计规格、设计参数和切图资产生成完整 HTML；只输出 HTML，不要解释；不得把整张设计图作为背景；文本、按钮、导航、表单和价格必须用 HTML/CSS 实现。')
  }
  if (agent.type === 'code-review-agent') {
    lines.push('', '额外约束：你是 GPT-5.5 代码审核与修订 Agent；检查 HTML/CSS/JS 的语义、响应式、可访问性、资源引用、安全和设计还原风险；必要时输出修订后的完整 HTML。')
  }
  if (agent.type === 'gpt-asset-audit-agent') {
    lines.push('', '额外约束：你是 GPT-5.5 多模态切图缺失审核 Agent；必须直接查看参考设计图，重点扫描 12-80px 的小图标、徽章、装饰符号和局部视觉资产；只输出合法 JSON。')
  }
  if (agent.type === 'gpt-html-visual-review-agent') {
    lines.push('', '额外约束：你是 GPT-5.5 多模态 HTML 视觉复核 Agent；必须直接查看第 1 张 UI 设计图和第 2 张 HTML 截图，结合 HTML 源码与 asset-map 找差异；只输出合法 JSON，不要输出完整 HTML。')
  }
  if (agent.type === 'gemini-spec-agent') {
    lines.push('', '额外约束：优先输出合法 JSON，包含 sections、components、tokens、assets_needed、html_css_elements。')
  }
  if (agent.type === 'qa-agent') {
    lines.push('', '额外约束：按 P0/P1/P2 输出问题，每条必须包含位置、原因和具体修改建议。')
  }

  lines.push(
    '',
    '本阶段产物协议：',
    artifactPromptForAgent(agent.type),
    '',
    '设计与还原 Lint：',
    ...DESIGN_LINT_RULES.map((rule) => `- ${rule}`)
  )

  return lines.join('\n')
}

async function callModel({ modelConfig, agent, designBatch, assetBatch, referenceImages = [], systemPrompt, userPrompt, fallbackModelConfig = null }) {
  const protocol = modelConfig.protocol || 'openai-compatible'
  if (protocol === 'cn-image2') {
    if (agent?.type === 'image2-ui-agent' && designBatch) {
      return callCNImage2DesignBatch(modelConfig, userPrompt, designBatch, referenceImages)
    }
    if (agent?.type === 'image2-assets-agent' && assetBatch) {
      return callCNImage2Batch(modelConfig, userPrompt, assetBatch, referenceImages)
    }
    return callCNImage2(modelConfig, userPrompt, referenceImages)
  }
  if (protocol === 'openai-responses') {
    const response = shouldUseOpenAIVision(agent, referenceImages)
      ? await callOpenAIVisionDirect(modelConfig, systemPrompt, userPrompt, referenceImages, agent)
      : await callOpenAIResponses(modelConfig, systemPrompt, userPrompt)
    const text = extractModelText(response)
    if (!text) {
      throw new Error('模型没有返回可显示内容')
    }
    return { text, htmlPagesArtifact: inferHtmlPagesArtifact(agent, text) }
  }

  let response
  if (protocol === 'gemini') {
    try {
      response = await callGemini(modelConfig, systemPrompt, userPrompt, referenceImages, agent)
    } catch (error) {
      const geminiFallback = await tryGeminiModelFallbacks(modelConfig, systemPrompt, userPrompt, referenceImages, agent, error)
      if (geminiFallback) {
        const geminiFallbackText = extractModelText(geminiFallback.response)
        if (!geminiFallbackText) {
          throw new Error(`${geminiFallback.modelConfig.model} 没有返回可显示内容`)
        }
        return {
          text: geminiFallbackText,
          htmlPagesArtifact: inferHtmlPagesArtifact(agent, geminiFallbackText),
          modelConfig: geminiFallback.modelConfig,
          fallbackFrom: `${modelConfig.name} / ${modelConfig.model}`
        }
      }

      if (!fallbackModelConfig || !isGeminiModelUnavailableError(error)) {
        throw error
      }

      validateModelConfig(fallbackModelConfig, `${agent.name} 备用多模态模型`)
      const fallbackReferences = selectCoreGeminiReferenceImages(referenceImages)
      const fallbackResponse = await callOpenAIVisionFallback(
        fallbackModelConfig,
        systemPrompt,
        userPrompt,
        fallbackReferences,
        agent,
        error
      )
      const fallbackText = extractModelText(fallbackResponse)
      if (!fallbackText) {
        throw new Error('GPT-5.5 多模态兜底没有返回可显示内容')
      }
      return {
        text: fallbackText,
        htmlPagesArtifact: inferHtmlPagesArtifact(agent, fallbackText),
        modelConfig: fallbackModelConfig,
        fallbackFrom: `${modelConfig.name} / ${modelConfig.model}`
      }
    }
  } else {
    try {
      response = shouldPreferOpenAIStreaming(agent)
        ? await retryModelRequest(() => callOpenAICompatibleStreaming(modelConfig, systemPrompt, userPrompt, agent), 1)
        : shouldUseOpenAIVision(agent, referenceImages)
          ? await callOpenAIVisionDirect(modelConfig, systemPrompt, userPrompt, referenceImages, agent)
          : await callOpenAICompatible(modelConfig, systemPrompt, userPrompt)
    } catch (error) {
      if (!['code-restore-agent', 'code-review-agent'].includes(agent?.type) || !modelConfig.responsesEndpoint) {
        throw error
      }
      response = await callOpenAIResponses(modelConfig, systemPrompt, userPrompt)
    }
  }

  const text = extractModelText(response)
  if (!text) {
    throw new Error('模型没有返回可显示内容')
  }
  return { text, htmlPagesArtifact: inferHtmlPagesArtifact(agent, text), modelConfig }
}

async function callOpenAICompatible(modelConfig, systemPrompt, userPrompt) {
  const response = await safeFetch(resolveOpenAIEndpoint(modelConfig), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${modelConfig.apiKey}`
    },
    body: JSON.stringify({
      model: modelConfig.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: modelConfig.temperature,
      stream: false
    })
  }, {
    label: 'OpenAI Chat Completions',
    modelConfig
  })
  return response
}

async function callOpenAICompatibleStreaming(modelConfig, systemPrompt, userPrompt, agent = null) {
  const rawText = await safeFetchText(resolveOpenAIEndpoint(modelConfig), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${modelConfig.apiKey}`
    },
    body: JSON.stringify({
      model: modelConfig.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: modelConfig.temperature,
      stream: true
    })
  }, {
    label: 'OpenAI Chat Completions Stream',
    modelConfig,
    agentType: agent?.type,
    timeoutMs: 240000
  })
  return parseOpenAIChatStreamPayload(rawText)
}

function shouldPreferOpenAIStreaming(agent) {
  return ['code-review-agent'].includes(agent?.type)
}

function shouldUseOpenAIVision(agent, referenceImages = []) {
  return ['gpt-asset-audit-agent', 'gpt-html-visual-review-agent'].includes(agent?.type)
    && normalizeOpenAIReferenceImageParts(referenceImages).length > 0
}

async function callOpenAIVisionDirect(modelConfig, systemPrompt, userPrompt, referenceImages = [], agent = null) {
  const imageParts = normalizeOpenAIReferenceImageParts(referenceImages)
  if (!imageParts.length) {
    return callOpenAICompatible(modelConfig, systemPrompt, userPrompt)
  }

  if (modelConfig.protocol === 'openai-responses') {
    return callOpenAIResponsesVision(modelConfig, systemPrompt, userPrompt, imageParts, agent)
  }

  return safeFetch(resolveOpenAIEndpoint(modelConfig), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${modelConfig.apiKey}`
    },
    body: JSON.stringify({
      model: modelConfig.model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            ...imageParts
          ]
        }
      ],
      temperature: modelConfig.temperature,
      stream: false
    })
  }, {
    label: 'GPT-5.5 多模态审图',
    modelConfig,
    agentType: agent?.type,
    referenceCount: imageParts.length
  })
}

async function callOpenAIVisionFallback(modelConfig, systemPrompt, userPrompt, referenceImages = [], agent = null, originalError = null) {
  const imageParts = normalizeOpenAIReferenceImageParts(referenceImages)
  const fallbackPrompt = [
    'Gemini 原生视觉接口当前不可用，请你作为多模态视觉模型接管这个阶段。',
    originalError?.message ? `原 Gemini 错误摘要：${String(originalError.message).split('\n').slice(0, 8).join('\n')}` : '',
    '请严格完成原阶段任务，不要因为模型切换而改变输出协议。',
    '',
    userPrompt
  ].filter(Boolean).join('\n')

  if (modelConfig.protocol === 'openai-responses') {
    return callOpenAIResponsesVision(modelConfig, systemPrompt, fallbackPrompt, imageParts, agent)
  }

  return safeFetch(resolveOpenAIEndpoint(modelConfig), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${modelConfig.apiKey}`
    },
    body: JSON.stringify({
      model: modelConfig.model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: fallbackPrompt },
            ...imageParts
          ]
        }
      ],
      temperature: modelConfig.temperature,
      stream: false
    })
  }, {
    label: 'GPT-5.5 多模态兜底',
    modelConfig,
    agentType: agent?.type,
    referenceCount: imageParts.length
  })
}

async function callOpenAIResponsesVision(modelConfig, systemPrompt, userPrompt, imageParts = [], agent = null) {
  const responseImageParts = imageParts.map((part) => ({
    type: 'input_image',
    image_url: part.image_url?.url,
    detail: part.image_url?.detail || 'high'
  })).filter((part) => part.image_url)

  return safeFetch(resolveOpenAIResponsesEndpoint(modelConfig), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${modelConfig.apiKey}`
    },
    body: JSON.stringify({
      model: modelConfig.model,
      input: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: userPrompt },
            ...responseImageParts
          ]
        }
      ],
      temperature: modelConfig.temperature,
      stream: false
    })
  }, {
    label: 'GPT-5.5 Responses 多模态兜底',
    modelConfig,
    agentType: agent?.type,
    referenceCount: responseImageParts.length
  })
}

async function callOpenAIResponses(modelConfig, systemPrompt, userPrompt) {
  const response = await safeFetch(resolveOpenAIResponsesEndpoint(modelConfig), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${modelConfig.apiKey}`
    },
    body: JSON.stringify({
      model: modelConfig.model,
      input: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      temperature: modelConfig.temperature,
      stream: false
    })
  }, {
    label: 'OpenAI Responses',
    modelConfig
  })
  return response
}

async function callGemini(modelConfig, systemPrompt, userPrompt, referenceImages = [], agent = null) {
  const originalReferences = Array.isArray(referenceImages) ? referenceImages : []

  try {
    return await executeGeminiRequest(modelConfig, systemPrompt, userPrompt, originalReferences, agent)
  } catch (error) {
    const fallbackReferences = selectCoreGeminiReferenceImages(originalReferences)
    if (!isGeminiReferenceFallbackError(error) || fallbackReferences.length >= originalReferences.length) {
      throw error
    }

    try {
      return await executeGeminiRequest(modelConfig, systemPrompt, userPrompt, fallbackReferences, agent, '核心参考图重试')
    } catch (fallbackError) {
      throw new Error([
        error.message,
        '',
        `已自动减少 Gemini 参考图数量重试（${originalReferences.length} -> ${fallbackReferences.length}），仍然失败：`,
        fallbackError.message
      ].join('\n'))
    }
  }
}

async function executeGeminiRequest(modelConfig, systemPrompt, userPrompt, referenceImages = [], agent = null, labelSuffix = '') {
  const referenceParts = await normalizeGeminiReferenceParts(referenceImages)
  const parts = [
    { text: `${systemPrompt}\n\n${userPrompt}` },
    ...referenceParts
  ]
  const baseLabel = shouldPreferGeminiStreaming(agent) ? 'Gemini StreamGenerateContent' : 'Gemini GenerateContent'
  const context = {
    label: labelSuffix ? `${baseLabel} · ${labelSuffix}` : baseLabel,
    modelConfig,
    referenceCount: referenceParts.length
  }
  const body = JSON.stringify({
    contents: [
      {
        role: 'user',
        parts
      }
    ],
    generationConfig: {
      temperature: modelConfig.temperature,
      maxOutputTokens: geminiMaxOutputTokens(agent)
    }
  })

  if (shouldPreferGeminiStreaming(agent)) {
    try {
      return await retryModelRequest(() => callGeminiStreaming(modelConfig, body, context), 2)
    } catch (streamError) {
      try {
        return await retryModelRequest(() => callGeminiNonStreaming(modelConfig, body, {
          ...context,
          label: 'Gemini GenerateContent'
        }), 1)
      } catch (nonStreamError) {
        throw new Error([
          streamError.message,
          '',
          '已尝试回退非流式 Gemini 调用，仍然失败：',
          nonStreamError.message
        ].join('\n'))
      }
    }
  }

  return retryModelRequest(() => callGeminiNonStreaming(modelConfig, body, context), 1)
}

function selectCoreGeminiReferenceImages(referenceImages = []) {
  const images = Array.isArray(referenceImages) ? referenceImages.filter(Boolean) : []
  if (images.length <= 1) return images

  const requiredImages = images.filter((image) => typeof image === 'string' || !image?.optional)
  if (requiredImages.length && requiredImages.length < images.length) {
    return requiredImages.slice(0, 3)
  }

  return images.slice(0, 1)
}

function isGeminiReferenceFallbackError(error) {
  return /403|400|渠道分组|不可用|已下线|不支持当前参数组合|reference|参考图|parts\[\d+\]|inlineData|inline_data|oneof field/i
    .test(String(error?.message || ''))
}

function isGeminiModelUnavailableError(error) {
  return /403|渠道分组|不可用|已下线|不支持当前参数组合|Gemini GenerateContent|Gemini StreamGenerateContent/i
    .test(String(error?.message || ''))
}

async function callGeminiNonStreaming(modelConfig, body, context) {
  return callGeminiWithAuthFallback({
    modelConfig,
    body,
    context,
    endpointResolver: resolveGeminiEndpoint,
    labelPrefix: 'Gemini GenerateContent',
    responseMode: 'json'
  })
}

async function callGeminiStreaming(modelConfig, body, context) {
  const rawText = await callGeminiWithAuthFallback({
    modelConfig,
    body,
    context,
    endpointResolver: resolveGeminiStreamEndpoint,
    labelPrefix: 'Gemini StreamGenerateContent',
    responseMode: 'text'
  })
  return parseGeminiStreamPayload(rawText)
}

async function callGeminiWithAuthFallback({ modelConfig, body, context = {}, endpointResolver, labelPrefix, responseMode }) {
  const modes = geminiAuthModes(modelConfig)
  const errors = []

  for (const mode of modes) {
    const nextContext = {
      ...context,
      label: `${labelPrefix} · ${geminiAuthModeLabel(mode)}`,
      authMode: mode
    }
    const request = {
      method: 'POST',
      headers: buildGeminiHeaders(modelConfig, mode),
      body
    }
    const url = resolveGeminiEndpointForAuth(modelConfig, endpointResolver, mode)

    try {
      if (responseMode === 'text') {
        return await safeFetchText(url, request, nextContext)
      }
      return await safeFetch(url, request, nextContext)
    } catch (error) {
      errors.push(error)
      if (!isGeminiAuthFallbackError(error) || mode === modes[modes.length - 1]) {
        throw combineGeminiAuthErrors(errors)
      }
    }
  }

  throw combineGeminiAuthErrors(errors)
}

function geminiAuthModes(modelConfig) {
  return isCNApiBaseUrl(modelConfig.baseUrl) ? ['bearer', 'query-key', 'google-key'] : ['google-key']
}

function geminiAuthModeLabel(mode) {
  if (mode === 'google-key') return 'x-goog-api-key'
  if (mode === 'bearer') return 'Bearer'
  if (mode === 'query-key') return 'URL key'
  return mode
}

function resolveGeminiEndpointForAuth(modelConfig, endpointResolver, mode) {
  const url = endpointResolver(modelConfig)
  if (mode !== 'query-key') return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}key=${encodeURIComponent(modelConfig.apiKey)}`
}

function isGeminiAuthFallbackError(error) {
  return /400|401|403|CORS|Failed to fetch|渠道分组|不可用|已下线|不支持当前参数组合|API key|x-goog|Bearer|oneof field|inline/i
    .test(String(error?.message || ''))
}

function combineGeminiAuthErrors(errors = []) {
  const lastError = errors[errors.length - 1]
  if (errors.length <= 1) return lastError || new Error('Gemini 请求失败')
  return new Error([
    lastError?.message || 'Gemini 请求失败',
    '',
    'Gemini 鉴权/格式兜底已依次尝试：',
    ...errors.map((error, index) => `${index + 1}. ${error.message.split('\n').slice(0, 4).join(' | ')}`)
  ].join('\n'))
}

function shouldPreferGeminiStreaming(agent) {
  return ['gemini-html-agent', 'qa-agent'].includes(agent?.type)
}

function geminiMaxOutputTokens(agent) {
  if (agent?.type === 'gemini-html-agent') return 8192
  if (agent?.type === 'gemini-spec-agent') return 4096
  if (agent?.type === 'qa-agent') return 4096
  return 4096
}

async function retryModelRequest(task, retryCount = 1) {
  let lastError = null
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await task(attempt)
    } catch (error) {
      lastError = error
      if (attempt >= retryCount || !isRetryableModelError(error)) {
        throw error
      }
      await delay(900 * (attempt + 1))
    }
  }
  throw lastError
}

function isRetryableModelError(error) {
  return /502|503|504|timeout|timed out|Failed to fetch|network|超时|请求发送失败|awaiting response headers/i
    .test(String(error?.message || ''))
}

async function callCNImage2(modelConfig, userPrompt, referenceImages = []) {
  const imageInputs = normalizeReferenceImageInputs(referenceImages)
  const prompt = clampImage2Prompt(userPrompt)
  const params = {
    size: modelConfig.size || IMAGE2_ENV_DEFAULTS.size,
    quality: modelConfig.quality || IMAGE2_ENV_DEFAULTS.quality
  }
  if (imageInputs.length) {
    params.images = imageInputs
  }

  const created = await safeFetch(resolveMediaGenerateEndpoint(modelConfig), {
    method: 'POST',
    headers: buildMediaHeaders(modelConfig),
    body: JSON.stringify({
      model: modelConfig.model,
      prompt,
      params
    })
  }, {
    label: 'GPT Image 2 创建任务',
    modelConfig,
    referenceCount: imageInputs.length
  })

  const taskId = created?.data?.task_id || created?.task_id
  if (!taskId) {
    const immediateResultUrl = created?.data?.result_url || created?.result_url
    if (immediateResultUrl) {
      return {
        text: `GPT Image 2 已返回图片结果：${immediateResultUrl}`,
        mediaResult: {
          taskId: '',
          state: 'success',
          progress: '100%',
          resultUrl: immediateResultUrl,
          resultType: created?.data?.result_type || created?.result_type || 'image',
          cost: created?.data?.cost || created?.cost || 0
        }
      }
    }
    throw new Error('GPT Image 2 没有返回 task_id')
  }

  const status = await pollMediaStatus(modelConfig, taskId)
  if (status.state === 'failed') {
    throw new Error(status.error || 'GPT Image 2 任务失败')
  }

  return {
    text: [
      `GPT Image 2 任务已完成。`,
      `task_id：${taskId}`,
      status.result_url ? `result_url：${status.result_url}` : '',
      status.cost ? `cost：${status.cost}` : ''
    ].filter(Boolean).join('\n'),
    mediaResult: {
      taskId,
      state: status.state,
      progress: status.progress,
      resultUrl: status.result_url,
      resultType: status.result_type || 'image',
      cost: status.cost || 0
    }
  }
}

async function callCNImage2DesignBatch(modelConfig, userPrompt, designBatch, referenceImages = []) {
  const normalizedBatch = normalizeDesignBatchConfig(designBatch, userPrompt)
  const designPlan = createDesignPlan(normalizedBatch, userPrompt)

  const designs = await mapWithConcurrency(designPlan, IMAGE2_BATCH_CONCURRENCY, async (design) => {
    try {
      const result = await callCNImage2WithRetry(
        { ...modelConfig, size: design.imageSize || modelConfig.size },
        design.prompt,
        referenceImages
      )
      return {
        ...design,
        status: 'success',
        taskId: result.mediaResult?.taskId || '',
        resultUrl: result.mediaResult?.resultUrl || '',
        resultType: result.mediaResult?.resultType || 'image',
        cost: result.mediaResult?.cost || 0
      }
    } catch (error) {
      return {
        ...design,
        status: 'failed',
        error: error.message
      }
    }
  })

  const successfulDesigns = designs.filter((design) => design.status === 'success')
  if (!successfulDesigns.length) {
    const firstError = designs.find((design) => design.error)?.error || '整套 UI 设计稿生成失败'
    throw new Error(firstError)
  }

  return {
    text: [
      `GPT Image 2 UI 设计稿已完成：${successfulDesigns.length}/${designs.length} 张成功。`,
      `数量模式：${normalizedBatch.mode === 'free' ? '自由规划' : '固定张数'}`,
      '每张设计图都已进入画布，可单独打开、审图和交给后续 HTML 还原阶段。'
    ].join('\n'),
    mediaResult: successfulDesigns[0]?.resultUrl ? {
      taskId: successfulDesigns[0].taskId,
      state: 'success',
      progress: `${successfulDesigns.length}/${designs.length}`,
      resultUrl: successfulDesigns[0].resultUrl,
      resultType: successfulDesigns[0].resultType || 'image',
      cost: designs.reduce((total, design) => total + (Number(design.cost) || 0), 0)
    } : null,
    designBatchArtifact: {
      mode: normalizedBatch.mode,
      requestedCount: normalizedBatch.count,
      generatedCount: successfulDesigns.length,
      summary: normalizedBatch.mode === 'free'
        ? `Agent 自由规划并生成了 ${designs.length} 张以内的 UI 设计稿。`
        : `Agent 严格按固定张数生成了 ${designs.length} 张 UI 设计稿。`,
      designs
    }
  }
}

async function callCNImage2Batch(modelConfig, userPrompt, assetBatch, referenceImages = []) {
  const normalizedBatch = normalizeAssetBatchConfig(assetBatch, userPrompt)
  const assetPlan = createAssetPlan(normalizedBatch, userPrompt)

  const assets = await mapWithConcurrency(assetPlan, IMAGE2_BATCH_CONCURRENCY, async (asset) => {
    try {
      const result = await callCNImage2WithRetry(
        {
          ...modelConfig,
          size: asset.imageSize || image2SizeForAssetSize(asset.size, modelConfig.size)
        },
        asset.prompt,
        referenceImages
      )
      return {
        ...asset,
        status: 'success',
        taskId: result.mediaResult?.taskId || '',
        resultUrl: result.mediaResult?.resultUrl || '',
        resultType: result.mediaResult?.resultType || 'image',
        cost: result.mediaResult?.cost || 0
      }
    } catch (error) {
      return {
        ...asset,
        status: 'failed',
        error: error.message
      }
    }
  })

  const successfulAssets = assets.filter((asset) => asset.status === 'success')
  if (!successfulAssets.length) {
    const firstError = assets.find((asset) => asset.error)?.error || '整套切图生成失败'
    throw new Error(firstError)
  }

  return {
    text: [
      `GPT Image 2 批量切图已完成：${successfulAssets.length}/${assets.length} 张成功。`,
      `数量模式：${normalizedBatch.mode === 'free' ? '自由规划' : '固定张数'}`,
      'asset-map.json 可使用画布中的文件名、用途、尺寸和 result_url 继续进入 HTML 阶段。'
    ].join('\n'),
    mediaResult: successfulAssets[0]?.resultUrl ? {
      taskId: successfulAssets[0].taskId,
      state: 'success',
      progress: `${successfulAssets.length}/${assets.length}`,
      resultUrl: successfulAssets[0].resultUrl,
      resultType: successfulAssets[0].resultType || 'image',
      cost: assets.reduce((total, asset) => total + (Number(asset.cost) || 0), 0)
    } : null,
    assetBatchArtifact: {
      mode: normalizedBatch.mode,
      requestedCount: normalizedBatch.count,
      generatedCount: successfulAssets.length,
      summary: normalizedBatch.mode === 'free'
        ? `Agent 自由规划并生成了 ${assets.length} 张以内的复杂视觉资产。`
        : `Agent 严格按固定张数生成了 ${assets.length} 张复杂视觉资产。`,
      assets
    }
  }
}

async function callCNImage2WithRetry(modelConfig, prompt, referenceImages = []) {
  let lastError = null

  for (let attempt = 1; attempt <= IMAGE2_BATCH_RETRY_COUNT; attempt += 1) {
    try {
      return await callCNImage2(modelConfig, prompt, referenceImages)
    } catch (error) {
      lastError = error
      if (attempt < IMAGE2_BATCH_RETRY_COUNT) {
        await delay(1200 * attempt)
      }
    }
  }

  throw lastError || new Error('image2 任务重试失败')
}

async function mapWithConcurrency(items, limit, iterator) {
  const list = Array.isArray(items) ? items : []
  const results = new Array(list.length)
  let cursor = 0
  const workerCount = Math.min(Math.max(1, limit), list.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < list.length) {
      const index = cursor
      cursor += 1
      results[index] = await iterator(list[index], index)
    }
  }))

  return results
}

function normalizeDesignBatchConfig(designBatch = {}, userPrompt = '') {
  const mode = designBatch.mode === 'free' ? 'free' : 'fixed'
  const promptCount = extractAssetCount(userPrompt)
  const maxCount = Math.max(1, Math.min(24, Number(designBatch.maxCount || designBatch.count) || 6))
  const viewport = normalizeDesignViewport(designBatch.viewport || inferDesignViewport(userPrompt))
  const imageSize = String(designBatch.imageSize || imageSizeForDesignViewport(viewport)).trim()
  const plannedDesigns = Array.isArray(designBatch.designs)
    ? designBatch.designs.map(normalizePlannedDesign).filter((design) => design.fileName || design.purpose).slice(0, 24)
    : []
  const baseDesign = normalizePlannedDesign({
    fileName: designBatch.fileName,
    purpose: designBatch.purpose,
    viewport,
    imageSize,
    focus: designBatch.focus
  })

  if (mode === 'free') {
    const plannedCount = promptCount || inferFreeDesignCount(userPrompt)
    return {
      mode,
      maxCount,
      count: Math.max(1, Math.min(maxCount, Number(plannedCount) || 1)),
      viewport,
      imageSize,
      designs: plannedDesigns,
      baseDesign
    }
  }

  return {
    mode,
    count: Math.max(1, Math.min(24, Number(designBatch.count || plannedDesigns.length || promptCount || 2) || 1)),
    viewport,
    imageSize,
    designs: plannedDesigns,
    baseDesign
  }
}

function normalizeAssetBatchConfig(assetBatch = {}, userPrompt = '') {
  const mode = assetBatch.mode === 'free' ? 'free' : 'fixed'
  const promptCount = extractAssetCount(userPrompt)
  const plannedAssets = Array.isArray(assetBatch.assets)
    ? assetBatch.assets.map(normalizePlannedAsset).filter((asset) => asset.fileName || asset.purpose).slice(0, 24)
    : []
  const maxCount = Math.max(1, Math.min(24, Number(assetBatch.maxCount || assetBatch.count || plannedAssets.length) || 12))

  if (mode === 'free') {
    const plannedCount = plannedAssets.length || promptCount || inferFreeAssetCount(userPrompt)
    return {
      mode,
      maxCount,
      count: Math.max(1, Math.min(maxCount, Number(plannedCount) || 1)),
      reason: assetBatch.reason || '',
      assets: plannedAssets
    }
  }

  const fixedCount = Math.max(1, Math.min(24, Number(assetBatch.count || plannedAssets.length || promptCount || 6) || 1))
  return {
    mode,
    count: fixedCount,
    reason: assetBatch.reason || '',
    assets: plannedAssets.slice(0, fixedCount)
  }
}

function inferFreeDesignCount(value) {
  const prompt = String(value || '').toLowerCase()
  const explicitCount = extractAssetCount(prompt)
  if (explicitCount) return explicitCount
  if (prompt.includes('15') || prompt.includes('十五')) return 15
  if (prompt.includes('多页面') || prompt.includes('整套') || prompt.includes('完整')) return 6
  if (prompt.includes('desktop') && prompt.includes('mobile')) return 2
  return 2
}

function extractAssetCount(value) {
  const match = String(value || '').match(/(\d+)\s*(张|个|份|套|assets?|images?)/i)
  return match ? Number(match[1]) : 0
}

function inferFreeAssetCount(value) {
  const prompt = String(value || '').toLowerCase()
  if (prompt.includes('简单') || prompt.includes('轻量') || prompt.includes('mvp')) return 4
  if (prompt.includes('多页面') || prompt.includes('复杂') || prompt.includes('整套') || prompt.includes('完整')) return 8
  return 6
}

function createDesignPlan(designBatch, userPrompt) {
  const defaultDesigns = designBatch.viewport === 'mobile' ? [
    ['mobile-ui-design.png', 'Mobile App 高保真 UI 设计稿', 'mobile', designBatch.imageSize || '1152x2048', 'iPhone 纵向移动端页面、顶部状态区、内容卡片、底部导航和核心操作路径'],
    ['mobile-home-ui.png', 'Mobile 首页高保真 UI 设计稿', 'mobile', '1152x2048', '移动端首页、底部导航、搜索和核心卡片'],
    ['mobile-checkout-ui.png', 'Mobile 购物车和结算 UI 设计稿', 'mobile', '1152x2048', '购物车、地址、配送时间、支付确认'],
    ['mobile-order-tracking-ui.png', 'Mobile 订单追踪 UI 设计稿', 'mobile', '1152x2048', '订单状态、冷链轨迹、售后入口'],
    ['mobile-profile-ui.png', 'Mobile 个人中心 UI 设计稿', 'mobile', '1152x2048', '用户信息、会员权益、订单入口和售后服务']
  ] : [
    ['desktop-home-ui.png', 'Desktop 首页高保真 UI 设计稿', 'desktop', '2048x1152', '首页首屏、推荐内容、导航和核心转化区'],
    ['mobile-home-ui.png', 'Mobile 首页高保真 UI 设计稿', 'mobile', '1024x1536', '移动端首页、底部导航、搜索和核心卡片'],
    ['desktop-product-flow-ui.png', 'Desktop 商品浏览和详情 UI 设计稿', 'desktop', '2048x1152', '分类、商品详情、价格、规格和加入购物车路径'],
    ['mobile-checkout-ui.png', 'Mobile 购物车和结算 UI 设计稿', 'mobile', '1024x1536', '购物车、地址、配送时间、支付确认'],
    ['mobile-order-tracking-ui.png', 'Mobile 订单追踪 UI 设计稿', 'mobile', '1024x1536', '订单状态、冷链轨迹、售后入口'],
    ['desktop-project-history-ui.png', 'Desktop 历史生成和项目管理 UI 设计稿', 'desktop', '2048x1152', '历史项目、生成记录、画布预览和多页面管理']
  ]

  return Array.from({ length: designBatch.count }, (_, index) => {
    const plannedDesign = designBatch.designs?.[index] || (index === 0 ? designBatch.baseDesign : null)
    const [defaultFileName, defaultPurpose, defaultViewport, defaultImageSize, defaultFocus] = defaultDesigns[index] || [
      `ui-design-${index + 1}.png`,
      `UI 页面设计稿 ${index + 1}`,
      designBatch.viewport || (index % 2 === 0 ? 'desktop' : 'mobile'),
      designBatch.imageSize || (index % 2 === 0 ? '2048x1152' : '1152x2048'),
      `第 ${index + 1} 个关键页面或状态`
    ]
    const fileName = plannedDesign?.fileName || defaultFileName
    const purpose = plannedDesign?.purpose || defaultPurpose
    const viewport = plannedDesign?.viewport || defaultViewport
    const imageSize = plannedDesign?.imageSize || defaultImageSize
    const focus = plannedDesign?.focus || defaultFocus

    return {
      id: `design-${index + 1}`,
      fileName,
      purpose,
      viewport,
      imageSize,
      webPath: `/designs/generated/${fileName}`,
      reviewTarget: 'Gemini 审图 Agent',
      prompt: [
        userPrompt,
        '',
        `现在只生成第 ${index + 1}/${designBatch.count} 张 UI 设计稿。`,
        `设计稿文件名：${fileName}`,
        `设计稿用途：${purpose}`,
        `视口：${viewport}`,
        `推荐比例：${imageSize}`,
        `页面重点：${focus}`,
        viewport === 'mobile'
          ? '移动端硬性要求：生成竖向手机 App UI，接近 iPhone 屏幕比例；不要生成桌面网页、横向画板、浏览器界面、PC 侧栏布局或宽屏 Dashboard。'
          : '',
        '画面要求：正视角 UI 截图，不要设备外壳，不要透视，不要 3D 展示，不要营销海报。',
        '内容要求：必须包含真实可读中文文案、导航、卡片、按钮、状态、价格或表单等 UI 元素。',
        '还原要求：布局清晰，边距、栅格、字号、颜色层级可被 HTML/CSS/Vue 还原。'
      ].filter(Boolean).join('\n')
    }
  })
}

function normalizePlannedDesign(design = {}) {
  const viewport = normalizeDesignViewport(design.viewport)
  return {
    fileName: normalizeDesignFileName(design.fileName || design.name),
    purpose: String(design.purpose || '').trim(),
    viewport,
    imageSize: String(design.imageSize || design.size || imageSizeForDesignViewport(viewport)).trim(),
    focus: String(design.focus || design.description || '').trim()
  }
}

function normalizeDesignViewport(value) {
  const text = String(value || '').toLowerCase()
  if (text.includes('mobile') || text.includes('phone') || text.includes('iphone') || text.includes('app') || text.includes('移动') || text.includes('手机')) {
    return 'mobile'
  }
  if (text.includes('desktop') || text.includes('web') || text.includes('pc') || text.includes('电脑') || text.includes('桌面')) {
    return 'desktop'
  }
  return 'mobile'
}

function inferDesignViewport(value) {
  const text = String(value || '').toLowerCase()
  if (text.includes('desktop') || text.includes('web端') || text.includes('pc') || text.includes('电脑端') || text.includes('桌面端')) {
    return 'desktop'
  }
  if (text.includes('mobile') || text.includes('phone') || text.includes('iphone') || text.includes('app') || text.includes('移动端') || text.includes('手机')) {
    return 'mobile'
  }
  return 'mobile'
}

function imageSizeForDesignViewport(viewport) {
  return viewport === 'desktop' ? '2048x1152' : '1152x2048'
}

function normalizeDesignFileName(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const safe = raw
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const basename = safe.replace(/\.(png|jpe?g|webp)$/i, '').replace(/[._-]/g, '')
  if (!safe || !basename) return ''
  return /\.(png|jpe?g|webp)$/i.test(safe) ? safe : `${safe}.png`
}

function createAssetPlan(assetBatch, userPrompt) {
  const defaultAssets = [
    ['hero-visual.webp', '首页 Hero 主视觉', '1280x720', false],
    ['primary-product.webp', '核心商品或功能展示图', '800x800', false],
    ['secondary-product.webp', '第二商品或场景图', '800x800', false],
    ['feature-illustration.webp', '核心功能说明插画', '960x540', false],
    ['workflow-visual.webp', '流程或履约说明图', '960x540', false],
    ['empty-state.webp', '空状态插画', '640x480', true],
    ['success-state.webp', '成功状态插画', '640x480', true],
    ['brand-badge.webp', '品牌/保障徽章', '512x512', true],
    ['category-icon-set.webp', '品类图标集合', '1024x1024', true],
    ['promo-banner.webp', '活动横幅氛围图', '1200x480', false],
    ['map-route.webp', '地图路线或配送轨迹图', '960x540', false],
    ['avatar-or-mascot.webp', '品牌角色或头像资产', '512x512', true]
  ]

  return Array.from({ length: assetBatch.count }, (_, index) => {
    const plannedAsset = assetBatch.assets?.[index]
    const [defaultFileName, defaultPurpose, defaultSize, defaultTransparent] = defaultAssets[index] || [
      `custom-asset-${index + 1}.webp`,
      `自定义复杂视觉资产 ${index + 1}`,
      '800x800',
      true
    ]
    const fileName = plannedAsset?.fileName || plannedAsset?.name || defaultFileName
    const purpose = plannedAsset?.purpose || defaultPurpose
    const size = plannedAsset?.size || defaultSize
    const transparent = typeof plannedAsset?.transparent === 'boolean' ? plannedAsset.transparent : defaultTransparent
    const cropHint = plannedAsset?.cropHint || ''
    const visualBrief = plannedAsset?.visualBrief || plannedAsset?.prompt || ''
    const elementsToKeep = plannedAsset?.elementsToKeep || ''
    const elementsToExclude = plannedAsset?.elementsToExclude || '所有可读文字、按钮、价格、表单、导航、状态标签'
    const customPrompt = plannedAsset?.prompt || ''

    return {
      id: `asset-${index + 1}`,
      fileName,
      purpose,
      size,
      format: 'webp',
      transparent,
      cropHint,
      visualBrief,
      elementsToKeep,
      elementsToExclude,
      webPath: plannedAsset?.webPath || `/assets/generated/${fileName}`,
      imageSize: image2SizeForAssetSize(size),
      prompt: [
        `现在只生成第 ${index + 1}/${assetBatch.count} 张切图资产。`,
        `资产文件名：${fileName}`,
        `资产用途：${purpose}`,
        `推荐尺寸：${size}`,
        cropHint ? `设计稿位置/裁切参考：${cropHint}` : '',
        visualBrief ? `视觉细节要求：${visualBrief}` : '',
        elementsToKeep ? `需要保留的设计特征：${elementsToKeep}` : '',
        `必须排除：${elementsToExclude}`,
        customPrompt ? `Gemini 单图提示词：${customPrompt}` : '',
        `背景要求：${transparent ? '透明背景，适合叠加到 HTML/CSS 布局中' : '干净背景，适合 Web 区块使用'}`,
        '图生图参考：UI 设计图已随本次 image2 请求作为参考图上传，请以它为视觉来源，但只输出当前这一张独立资产。',
        '重要限制：不要生成任何可读文字、按钮、价格、表单、导航、标签、图标文字；这些都由 HTML/CSS 实现。',
        '输出应是单独资产，不是整页截图，不要设备外壳，不要 UI 面板，不要保留原设计稿中的 UI 容器边框。',
        '如果参考设计中该区域包含文字，请只保留无字的图形、商品、氛围、材质、路线或插画。',
        '',
        `整体上下文摘要：${compactForImage2Prompt(userPrompt, 900)}`
      ].filter(Boolean).join('\n')
    }
  })
}

function clampImage2Prompt(value) {
  const text = compactForImage2Prompt(value, IMAGE2_PROMPT_MAX_CHARS)
  if (text.length <= IMAGE2_PROMPT_MAX_CHARS) return text
  return text.slice(0, IMAGE2_PROMPT_MAX_CHARS - 24).trimEnd() + '\n[已压缩]'
}

function compactForImage2Prompt(value, maxChars = 1200) {
  const text = String(value || '')
    .replace(/```[\s\S]*?```/g, '[结构化长内容已省略]')
    .replace(/\{[\s\S]{800,}\}/g, '[JSON 长内容已省略]')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (text.length <= maxChars) return text

  const priorityLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      return line
        && !/^设计图复核摘要/.test(line)
        && !/^现有切图清单/.test(line)
        && !/^Gemini/.test(line)
        && !/^当前 Agent/.test(line)
        && !/^本阶段产物协议/.test(line)
        && !/^设计与还原 Lint/.test(line)
    })
  const compact = priorityLines.join('\n')
  const source = compact.length >= 160 ? compact : text
  if (source.length <= maxChars) return source

  const headLength = Math.max(240, Math.floor(maxChars * 0.62))
  const tailLength = Math.max(160, maxChars - headLength - 36)
  return `${source.slice(0, headLength).trimEnd()}\n[中间长上下文已省略]\n${source.slice(-tailLength).trimStart()}`
}

function normalizePlannedAsset(asset = {}, index = 0) {
  const fileName = normalizeAssetFileName(asset.fileName || asset.name, index)
  return {
    id: String(asset.id || `asset-${index + 1}`).trim(),
    name: fileName,
    fileName,
    purpose: String(asset.purpose || `复杂视觉资产 ${index + 1}`).trim(),
    size: String(asset.size || '').trim(),
    transparent: Boolean(asset.transparent),
    cropHint: String(asset.cropHint || asset.region || asset.position || '').trim(),
    visualBrief: String(asset.visualBrief || asset.description || '').trim(),
    elementsToKeep: String(asset.elementsToKeep || asset.keep || '').trim(),
    elementsToExclude: String(asset.elementsToExclude || asset.exclude || '所有可读文字、按钮、价格、表单、导航、状态标签').trim(),
    prompt: String(asset.prompt || '').trim(),
    webPath: String(asset.webPath || `/assets/generated/${fileName}`).trim()
  }
}

function normalizeAssetFileName(value, index = 0) {
  const fallback = `asset-${index + 1}.webp`
  const raw = String(value || fallback).trim()
  const safe = raw
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const basename = safe.replace(/\.(png|jpe?g|webp)$/i, '').replace(/[._-]/g, '')
  if (!safe || !basename) return fallback
  return /\.(png|jpe?g|webp)$/i.test(safe) ? safe : `${safe}.webp`
}

function image2SizeForAssetSize(size, fallback = IMAGE2_ENV_DEFAULTS.size) {
  const match = String(size || '').match(/(\d+)\s*x\s*(\d+)/i)
  if (!match) return fallback || IMAGE2_ENV_DEFAULTS.size

  const width = Number(match[1])
  const height = Number(match[2])
  if (!width || !height) return fallback || IMAGE2_ENV_DEFAULTS.size

  const ratio = width / height
  if (ratio >= 1.6) return '2048x1152'
  if (ratio >= 1.15) return '1536x1024'
  if (ratio <= 0.55) return '1152x2048'
  if (ratio <= 0.87) return '1024x1536'
  return '1024x1024'
}

async function pollMediaStatus(modelConfig, taskId) {
  const maxAttempts = Math.max(1, Number(modelConfig.maxPollAttempts) || 40)
  const interval = Math.max(1000, Number(modelConfig.pollIntervalMs) || 3000)

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await delay(interval)
    }

    const status = await safeFetch(resolveMediaStatusEndpoint(modelConfig, taskId), {
      method: 'GET',
      headers: buildMediaHeaders(modelConfig)
    }, {
      label: 'GPT Image 2 查询任务',
      modelConfig,
      taskId
    })

    if (status?.is_final === true) {
      return status
    }
  }

  throw new Error('GPT Image 2 任务轮询超时，请稍后到任务状态接口查询。')
}

async function safeFetch(url, options, context = {}) {
  let response
  try {
    response = await fetch(url, options)
  } catch (error) {
    throw new Error(formatFetchFailure(error, url, options, context))
  }

  const rawText = await response.text().catch(() => '')
  const payload = parseResponsePayload(rawText)
  if (!response.ok) {
    throw new Error(formatHttpFailure(response, payload, rawText, url, options, context))
  }
  return payload
}

async function safeFetchText(url, options, context = {}) {
  let response
  const controller = new AbortController()
  const timeoutMs = Number(context.timeoutMs) || 240000
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    response = await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    throw new Error(formatFetchFailure(error, url, options, context))
  } finally {
    window.clearTimeout(timeoutId)
  }

  const rawText = await response.text().catch(() => '')
  const payload = parseResponsePayload(rawText)
  if (!response.ok) {
    throw new Error(formatHttpFailure(response, payload, rawText, url, options, context))
  }
  return rawText
}

function buildMediaHeaders(modelConfig) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${modelConfig.apiKey}`
  }
}

function buildGeminiHeaders(modelConfig, authMode = '') {
  const headers = {
    'Content-Type': 'application/json',
  }

  const mode = authMode || (isCNApiBaseUrl(modelConfig.baseUrl) ? 'google-key' : 'google-key')
  if (mode === 'bearer') {
    headers.Authorization = `Bearer ${modelConfig.apiKey}`
  } else if (mode === 'google-key') {
    headers['x-goog-api-key'] = modelConfig.apiKey
  }

  return headers
}

function isCNApiBaseUrl(value) {
  return /api\.ai6800\.com|api\.ai6700\.com/i.test(String(value || ''))
}

function parseResponsePayload(rawText) {
  if (!rawText) return null
  try {
    return JSON.parse(rawText)
  } catch {
    return null
  }
}

function formatFetchFailure(error, url, options = {}, context = {}) {
  const lines = [
    `Web 端请求失败：${error.message}`,
    `阶段：${context.label || '模型请求'}`,
    `请求：${String(options.method || 'GET').toUpperCase()} ${sanitizeUrl(url)}`,
    context.modelConfig?.name ? `模型配置：${context.modelConfig.name}` : '',
    context.modelConfig?.protocol ? `协议：${context.modelConfig.protocol}` : '',
    context.modelConfig?.model ? `模型：${context.modelConfig.model}` : '',
    Number.isFinite(Number(context.referenceCount)) ? `参考图数量：${context.referenceCount}` : '',
    context.taskId ? `task_id：${context.taskId}` : '',
    '浏览器没有拿到响应，常见原因是 CORS 预检失败、请求头不被允许、网络被拦截、证书问题，或接口不支持浏览器直连。',
    '请打开 DevTools Console / Network 查看更具体的 CORS 文案；Gemini 会按 x-goog-api-key、Bearer、URL key 顺序自动重试。'
  ].filter(Boolean)
  return lines.join('\n')
}

function formatHttpFailure(response, payload, rawText, url, options = {}, context = {}) {
  const message = payload?.error?.message || payload?.error || payload?.msg || rawText.slice(0, 260) || `模型请求失败：${response.status}`
  return [
    `模型请求失败：${response.status} ${response.statusText}`,
    `阶段：${context.label || '模型请求'}`,
    `请求：${String(options.method || 'GET').toUpperCase()} ${sanitizeUrl(url)}`,
    context.modelConfig?.name ? `模型配置：${context.modelConfig.name}` : '',
    context.modelConfig?.protocol ? `协议：${context.modelConfig.protocol}` : '',
    context.modelConfig?.model ? `模型：${context.modelConfig.model}` : '',
    Number.isFinite(Number(context.referenceCount)) ? `参考图数量：${context.referenceCount}` : '',
    context.taskId ? `task_id：${context.taskId}` : '',
    `返回：${message}`
  ].filter(Boolean).join('\n')
}

function sanitizeUrl(url) {
  try {
    const parsed = new URL(String(url))
    const sensitiveParams = [
      'key',
      'api_key',
      'apikey',
      'access_token',
      'token',
      'signature',
      'x-amz-signature',
      'x-goog-signature'
    ]
    for (const [param] of parsed.searchParams) {
      if (sensitiveParams.includes(param.toLowerCase())) {
        parsed.searchParams.set(param, '***')
      }
    }
    return parsed.toString()
  } catch {
    return String(url || '')
      .replace(/([?&](?:key|api_key|apikey|access_token|token|signature|x-amz-signature|x-goog-signature)=)[^&]+/gi, '$1***')
  }
}

function normalizeReferenceImageInputs(referenceImages = []) {
  if (!Array.isArray(referenceImages)) return []
  return referenceImages
    .map((image) => {
      if (typeof image === 'string') return image
      return image?.src || image?.url || image?.dataUrl || image?.resultUrl || ''
    })
    .filter(Boolean)
    .slice(0, 10)
}

function normalizeOpenAIReferenceImageParts(referenceImages = []) {
  return normalizeReferenceImageInputs(referenceImages)
    .filter((source) => source.startsWith('data:') || /^https?:\/\//i.test(source))
    .slice(0, 10)
    .map((source) => ({
      type: 'image_url',
      image_url: {
        url: source,
        detail: 'high'
      }
    }))
}

async function normalizeGeminiReferenceParts(referenceImages = []) {
  if (!Array.isArray(referenceImages)) return []
  const parts = []

  for (const image of referenceImages.slice(0, 10)) {
    const source = typeof image === 'string'
      ? image
      : image?.src || image?.url || image?.dataUrl || image?.resultUrl || ''
    if (!source) continue

    try {
      if (source.startsWith('data:')) {
        const inlinePart = await dataUrlToGeminiInlinePart(source)
        if (inlinePart) parts.push(inlinePart)
        continue
      }

      if (/^https?:\/\//i.test(source)) {
        parts.push(await remoteImageToGeminiInlinePart(source, image?.type))
      }
    } catch (error) {
      if (image?.optional) continue
      throw error
    }
  }

  return parts
}

async function dataUrlToGeminiInlinePart(source) {
  const match = String(source || '').match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) return null
  if (match[2].length > GEMINI_REFERENCE_COMPRESS_THRESHOLD) {
    const blob = await dataUrlToBlob(source)
    const inlineImage = await blobToGeminiImageData(blob, source)
    return {
      inlineData: {
        mimeType: inlineImage.mimeType,
        data: inlineImage.data
      }
    }
  }
  return {
    inlineData: {
      mimeType: match[1],
      data: match[2]
    }
  }
}

async function remoteImageToGeminiInlinePart(source, mimeType = '') {
  let response
  try {
    response = await fetch(source)
  } catch (error) {
    throw new Error(`Gemini 参考图下载失败：${error.message}\n图片地址：${sanitizeUrl(source)}`)
  }

  if (!response.ok) {
    throw new Error(`Gemini 参考图下载失败：${response.status} ${response.statusText}\n图片地址：${sanitizeUrl(source)}`)
  }

  const blob = await response.blob()
  const inlineImage = await blobToGeminiImageData(blob, source, mimeType)
  return {
    inlineData: {
      mimeType: inlineImage.mimeType,
      data: inlineImage.data
    }
  }
}

async function dataUrlToBlob(source) {
  const response = await fetch(source)
  return response.blob()
}

async function blobToGeminiImageData(blob, source = '', preferredMimeType = '') {
  const sourceMimeType = preferredMimeType || blob.type || guessImageMimeType(source)
  const shouldCompress = blob.size > GEMINI_REFERENCE_COMPRESS_THRESHOLD && sourceMimeType.startsWith('image/') && sourceMimeType !== 'image/svg+xml'

  if (!shouldCompress) {
    return {
      mimeType: sourceMimeType,
      data: await blobToBase64(blob)
    }
  }

  try {
    return await compressBlobImageForGemini(blob)
  } catch {
    return {
      mimeType: sourceMimeType,
      data: await blobToBase64(blob)
    }
  }
}

async function compressBlobImageForGemini(blob) {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, GEMINI_REFERENCE_MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const outputBlob = await new Promise((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) resolve(nextBlob)
      else reject(new Error('图片压缩失败'))
    }, 'image/jpeg', GEMINI_REFERENCE_JPEG_QUALITY)
  })

  return {
    mimeType: 'image/jpeg',
    data: await blobToBase64(outputBlob)
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result || '')
      const data = value.includes(',') ? value.split(',').pop() : value
      resolve(data)
    }
    reader.onerror = () => {
      reject(new Error('图片转 base64 失败'))
    }
    reader.readAsDataURL(blob)
  })
}

function guessImageMimeType(value) {
  const path = String(value || '').split('?')[0].toLowerCase()
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

function resolveMediaGenerateEndpoint(modelConfig) {
  const endpoint = modelConfig.endpoint || IMAGE2_ENV_DEFAULTS.generatePath
  if (endpoint.startsWith('http')) return endpoint
  return `${trimRight(modelConfig.baseUrl)}/${endpoint.replace(/^\/+/, '')}`
}

function resolveMediaStatusEndpoint(modelConfig, taskId) {
  const endpoint = modelConfig.statusEndpoint || IMAGE2_ENV_DEFAULTS.statusPath
  const separator = endpoint.includes('?') ? '&' : '?'
  if (endpoint.startsWith('http')) {
    return `${endpoint}${separator}task_id=${encodeURIComponent(taskId)}`
  }
  return `${trimRight(modelConfig.baseUrl)}/${endpoint.replace(/^\/+/, '')}${separator}task_id=${encodeURIComponent(taskId)}`
}

function resolveOpenAIEndpoint(modelConfig) {
  const endpoint = modelConfig.endpoint || '/chat/completions'
  if (endpoint.startsWith('http')) return endpoint

  const base = trimRight(modelConfig.baseUrl)
  if (base.endsWith('/chat/completions') && endpoint.includes('chat/completions')) {
    return base
  }
  return `${base}/${endpoint.replace(/^\/+/, '')}`
}

function resolveOpenAIResponsesEndpoint(modelConfig) {
  const endpoint = modelConfig.responsesEndpoint || GPT55_ENV_DEFAULTS.responsesPath
  if (endpoint.startsWith('http')) return endpoint

  const base = trimRight(modelConfig.baseUrl)
  if (base.endsWith('/responses')) {
    return base
  }
  return `${base}/${endpoint.replace(/^\/+/, '')}`
}

function resolveGeminiEndpoint(modelConfig) {
  const base = trimRight(modelConfig.baseUrl)

  if (base.includes(':streamGenerateContent')) {
    return base.replace(':streamGenerateContent', ':generateContent')
  }
  if (base.includes(':generateContent')) {
    return base
  }

  const model = String(modelConfig.model).replace(/^models\//, '')
  if (base.endsWith('/models')) {
    return `${base}/${encodeURIComponent(model)}:generateContent`
  }
  if (base.endsWith('/v1') || base.endsWith('/v1beta')) {
    return `${base}/models/${encodeURIComponent(model)}:generateContent`
  }
  if (base.includes('/models/')) {
    return `${base}:generateContent`
  }
  return `${base}/models/${encodeURIComponent(model)}:generateContent`
}

function resolveGeminiStreamEndpoint(modelConfig) {
  const base = trimRight(modelConfig.baseUrl)

  if (base.includes(':streamGenerateContent')) {
    return base
  }
  if (base.includes(':generateContent')) {
    return base.replace(':generateContent', ':streamGenerateContent')
  }

  const model = String(modelConfig.model).replace(/^models\//, '')
  if (base.endsWith('/models')) {
    return `${base}/${encodeURIComponent(model)}:streamGenerateContent`
  }
  if (base.endsWith('/v1') || base.endsWith('/v1beta')) {
    return `${base}/models/${encodeURIComponent(model)}:streamGenerateContent`
  }
  if (base.includes('/models/')) {
    return `${base}:streamGenerateContent`
  }
  return `${base}/models/${encodeURIComponent(model)}:streamGenerateContent`
}

function parseGeminiStreamPayload(rawText) {
  const lines = String(rawText || '').split(/\r?\n/)
  const chunks = []
  const jsonChunks = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith(':')) continue
    const data = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed
    if (!data || data === '[DONE]') continue

    try {
      const payload = JSON.parse(data)
      jsonChunks.push(payload)
      const text = extractModelText(payload)
      if (text) chunks.push(text)
    } catch {
      if (!data.startsWith('{') && !data.startsWith('[')) {
        chunks.push(data)
      }
    }
  }

  if (!chunks.length) {
    const payload = parseResponsePayload(rawText)
    if (Array.isArray(payload)) {
      payload.forEach((item) => {
        const text = extractModelText(item)
        if (text) chunks.push(text)
      })
    } else {
      const text = extractModelText(payload)
      if (text) chunks.push(text)
    }
  }

  return {
    candidates: [
      {
        content: {
          parts: [
            {
              text: chunks.join('')
            }
          ]
        }
      }
    ],
    streamChunks: jsonChunks
  }
}

function parseOpenAIChatStreamPayload(rawText) {
  const lines = String(rawText || '').split(/\r?\n/)
  const chunks = []
  const jsonChunks = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith(':')) continue
    const data = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed
    if (!data || data === '[DONE]') continue

    try {
      const payload = JSON.parse(data)
      jsonChunks.push(payload)
      const delta = payload.choices?.[0]?.delta?.content
      if (typeof delta === 'string') {
        chunks.push(delta)
      } else if (Array.isArray(delta)) {
        chunks.push(delta.map((part) => part.text || part.content || '').filter(Boolean).join(''))
      } else {
        const text = extractModelText(payload)
        if (text) chunks.push(text)
      }
    } catch {
      if (!data.startsWith('{') && !data.startsWith('[')) {
        chunks.push(data)
      }
    }
  }

  if (!chunks.length) {
    const payload = parseResponsePayload(rawText)
    const text = extractModelText(payload)
    if (text) chunks.push(text)
  }

  return {
    choices: [
      {
        message: {
          content: chunks.join('')
        }
      }
    ],
    streamChunks: jsonChunks
  }
}

function extractModelText(payload) {
  if (!payload) return ''
  if (typeof payload === 'string') return payload
  if (typeof payload.output_text === 'string') return payload.output_text

  const openAIContent = payload.choices?.[0]?.message?.content
  if (typeof openAIContent === 'string') return openAIContent
  if (Array.isArray(openAIContent)) {
    return openAIContent.map((part) => part.text || part.content || '').filter(Boolean).join('\n')
  }

  if (Array.isArray(payload.output)) {
    return payload.output
      .flatMap((item) => item.content || [])
      .map((part) => part.text || part.content || '')
      .filter(Boolean)
      .join('\n')
  }

  const geminiParts = payload.candidates?.[0]?.content?.parts
  if (Array.isArray(geminiParts)) {
    return geminiParts.map((part) => part.text || '').filter(Boolean).join('\n')
  }

  return ''
}

function inferHtmlPagesArtifact(agent, text) {
  if (!['code-restore-agent', 'gemini-html-agent', 'code-review-agent'].includes(agent?.type)) return null

  const pages = extractHtmlCodeBlocks(text)
  if (!pages.length) return null

  return pages.map((page, index) => ({
    id: `html-page-${index + 1}`,
    title: page.title || extractHtmlTitle(page.srcdoc) || `页面 ${index + 1}`,
    route: page.route || (index === 0 ? '/' : `/page-${index + 1}`),
    srcdoc: page.srcdoc
  }))
}

function extractHtmlCodeBlocks(text) {
  const value = String(text || '')
  const blocks = []
  const blockPattern = /```(?:html)?\s*([\s\S]*?)```/gi
  let match
  while ((match = blockPattern.exec(value))) {
    const html = match[1].trim()
    if (looksLikeHtml(html)) {
      blocks.push({
        srcdoc: html,
        ...extractPageHint(value.slice(Math.max(0, match.index - 180), match.index))
      })
    }
  }

  if (!blocks.length && looksLikeHtml(value)) {
    blocks.push({ srcdoc: value.trim() })
  }

  return blocks
}

function extractPageHint(prefix) {
  const titleMatch = String(prefix).match(/(?:页面|Page|title|文件|file)[:：\s]+([^\n\r`]+)/i)
  const routeMatch = String(prefix).match(/(?:route|path|路由)[:：\s]+(\/[^\s\n\r`]+)/i)
  return {
    title: titleMatch?.[1]?.trim().replace(/^["']|["']$/g, '') || '',
    route: routeMatch?.[1]?.trim() || ''
  }
}

function extractHtmlTitle(html) {
  return String(html || '').match(/<title>(.*?)<\/title>/i)?.[1]?.trim() || ''
}

function looksLikeHtml(value) {
  return /<!doctype html|<html[\s>]|<body[\s>]|<main[\s>]/i.test(String(value || ''))
}

function agentChecklist(agentType, stage) {
  const checklist = [...(stage.gate || [])]
  if (agentType === 'image2-ui-agent') {
    return [...checklist, '按任务指定视口生成设计稿', '设计稿文字必须清晰可读']
  }
  if (agentType === 'image2-assets-agent') {
    return [...checklist, '每个资产有透明背景要求', 'asset-map.json 包含 sourceFile 和 webFile']
  }
  if (agentType === 'code-restore-agent') {
    return [...checklist, '不使用整页截图作为背景', '通过 Desktop / Tablet / Mobile 响应式检查']
  }
  if (agentType === 'gemini-html-agent') {
    return [...checklist, '已参考 UI 设计图', 'HTML 与原图布局/颜色/间距一致', '不使用整图背景']
  }
  if (agentType === 'code-review-agent') {
    return [...checklist, '代码结构已审核', '响应式与资源引用已复核', '可访问性风险已处理']
  }
  return checklist
}

function agentNextActions(agentType) {
  if (agentType === 'image2-ui-agent') {
    return ['把模型输出用于 image2 生成设计稿。', '保存选中的 Desktop 和 Mobile 设计稿。', '进入 Gemini 审图阶段。']
  }
  if (agentType === 'image2-assets-agent') {
    return ['提取 assets_needed。', '逐个生成 PNG/WebP 资产。', '补齐 asset-map.json。']
  }
  if (agentType === 'code-restore-agent') {
    return ['整理设计稿、design-spec 和 asset-map。', '生成 Web 页面代码。', '截图进入视觉 QA。']
  }
  if (agentType === 'gemini-html-agent') {
    return ['用 Gemini 读图生成 HTML。', '交给 GPT-5.5 做代码审核。', '截图后交给 Gemini 做视觉复核。']
  }
  if (agentType === 'code-review-agent') {
    return ['应用修订后的 HTML。', '生成效果截图。', '进入 Gemini 视觉审核。']
  }
  if (agentType === 'gemini-review-agent') {
    return ['上传设计稿。', '按 P0/P1/P2 审查。', '评分不足时回到 image2 重生成。']
  }
  return ['确认当前阶段输入是否齐全。', '执行模型输出。', '用门禁清单判断是否进入下一阶段。']
}

function trimRight(value) {
  return String(value || '').replace(/\/+$/, '')
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
