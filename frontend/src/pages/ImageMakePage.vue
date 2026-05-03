<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import html2canvas from 'html2canvas'
import { Code2, Download, FileDown, Image, Layers3, LoaderCircle, Send, Sparkles, Upload, X } from 'lucide-vue-next'
import { ensureBrowserDirectEnabled, loadAgentRuntimeSettings, runBrowserAgent } from '../services/agentRuntime'
import { getImageMakeRuns, saveImageMakeRun } from '../services/api'
import {
  buildProjectJson,
  downloadCompleteProjectPackage,
  downloadExperimentalFigFile,
  downloadFigmaImportPackage
} from '../services/exportPackages'

const HISTORY_STORAGE_KEY = 'ai-design-to-web.image-make.history.v1'
const ACTIVE_HISTORY_STORAGE_KEY = 'ai-design-to-web.image-make.active-history-id.v1'
const prompt = ref('为海鲜配送 App 生成一个移动端首页高保真 UI 设计图，包含搜索、分类、今日鲜货、购物车入口和冷链保障信息。')
const assetCount = ref(0)
const assetPlan = ref(null)
const missingAssetScan = ref(null)
const designDetailReview = ref(null)
const designSpec = ref(null)
const referenceImages = ref([])
const activeReferenceImageId = ref('')
const useReferenceImages = ref(true)
const runningStep = ref('')
const error = ref('')
const messages = ref([
  {
    id: 'welcome',
    role: 'assistant',
    content: '输入你想要的页面，我会先用 image2 生成单张 UI 设计图，再基于这张图生成切图资产，最后用设计图和切图生成 HTML。'
  }
])
const designRun = ref(null)
const assetRun = ref(null)
const htmlRun = ref(null)
const htmlSource = ref('')
const codeReviewRun = ref(null)
const codeReviewText = ref('')
const visualReviewRun = ref(null)
const visualReviewText = ref('')
const htmlScreenshotDataUrl = ref('')
const htmlPipelineStatus = ref('')
const htmlDualReview = ref(null)
const htmlReviewNotes = ref('')
const historyEntries = ref([])
const activeHistoryId = ref('')
const historySyncStatus = ref('')
const exportStatus = ref('')

const design = computed(() => {
  const designs = designRun.value?.designBatchArtifact?.designs || []
  if (designs.length) return designs[0]
  const media = designRun.value?.mediaResult
  if (media?.resultUrl) {
    return {
      id: 'design-1',
      fileName: 'generated-ui-design.png',
      purpose: 'UI 设计图',
      viewport: 'ui',
      imageSize: '',
      status: 'success',
      resultUrl: media.resultUrl,
      taskId: media.taskId
    }
  }

  const referenceImage = activeReferenceImage.value
  if (referenceImage?.src) {
    return {
      id: referenceImage.id,
      fileName: referenceImage.name || '上传参考图',
      purpose: '上传参考图',
      viewport: 'reference',
      imageSize: '',
      status: 'reference',
      resultUrl: referenceImage.localUrl || referenceImage.previewSrc || referenceImage.src,
      previewUrl: referenceImage.previewSrc || referenceImage.src,
      localUrl: referenceImage.localUrl || referenceImage.previewSrc || '',
      localPath: referenceImage.localPath || referenceImage.localUrl || referenceImage.previewSrc || '',
      source: 'uploaded-reference'
    }
  }

  return null
})
const assets = computed(() => assetRun.value?.assetBatchArtifact?.assets || [])
const successfulAssets = computed(() => assets.value.filter((asset) => asset.status === 'success' && asset.resultUrl))
const canRunDesign = computed(() => Boolean(prompt.value.trim()) && !runningStep.value)
const canRunAssets = computed(() => Boolean(design.value?.resultUrl) && !runningStep.value)
const canRunMissingAssets = computed(() => Boolean(design.value?.resultUrl) && !runningStep.value)
const canRunHtml = computed(() => Boolean(design.value?.resultUrl) && !runningStep.value)
const canRunHtmlReviewRepair = computed(() => Boolean(design.value?.resultUrl && htmlSource.value) && !runningStep.value)
const activeHtmlReview = computed(() => htmlDualReview.value?.finalPass || htmlDualReview.value?.firstPass || null)
const htmlReviewSectionScans = computed(() => activeHtmlReview.value?.sectionScans || [])
const htmlReviewPendingMissingAssetPlan = computed(() => getPendingHtmlReviewMissingAssetPlan(activeHtmlReview.value))
const htmlReviewPendingMissingAssets = computed(() => htmlReviewPendingMissingAssetPlan.value.assets || [])
const canGenerateHtmlReviewMissingAssets = computed(() => Boolean(design.value?.resultUrl && htmlReviewPendingMissingAssets.value.length) && !runningStep.value)
const hasProjectOutput = computed(() => Boolean(design.value || assets.value.length || htmlSource.value))
const activeReferenceImages = computed(() => (useReferenceImages.value ? referenceImages.value : []))
const activeReferenceImage = computed(() => {
  if (!referenceImages.value.length) return null
  return referenceImages.value.find((image) => image.id === activeReferenceImageId.value) || referenceImages.value[referenceImages.value.length - 1]
})
const referenceImageNames = computed(() => {
  return referenceImages.value.map((image) => image.name).join('、')
})
const designStatusLabel = computed(() => {
  if (design.value?.status === 'success') return '已生成'
  if (design.value?.status === 'reference') return '参考图'
  return '等待生成'
})
const assetCountLabel = computed(() => {
  if (assetPlan.value?.count) return `${assetPlan.value.count} 张`
  return 'Gemini 自动判断'
})
const designDownloadUrl = computed(() => design.value?.downloadUrl || design.value?.resultUrl || '')
const currentHistoryTitle = computed(() => {
  if (!activeHistoryId.value) return '新项目'
  return historyEntries.value.find((item) => item.id === activeHistoryId.value)?.title || '已保存项目'
})

const workflowStages = {
  design: {
    id: 'image-make-design',
    number: 3,
    title: '生成单张 UI 设计图',
    summary: '使用 GPT Image 2 根据对话指令生成一张高保真 UI 设计图。',
    inputs: ['用户对话指令', '视觉风格要求'],
    outputs: ['ui-design.png'],
    gate: ['设计图是正视角 UI 截图', '文字清晰可读', '可进入切图和 HTML 还原']
  },
  assets: {
    id: 'image-make-assets',
    number: 6,
    title: '生成对应切图',
    summary: '基于 UI 设计图和页面意图生成可用于 Web 的视觉资产和专属小图标。',
    inputs: ['ui-design.png', '用户对话指令'],
    outputs: ['generated-assets/*', 'asset-map.json'],
    gate: ['生成复杂视觉和专属小图标', '文字按钮表单继续由 HTML/CSS 实现']
  },
  missingAssets: {
    id: 'image-make-missing-assets',
    number: 6.2,
    title: '扫描并生成缺失切图',
    summary: 'Gemini 细节扫描 + GPT 小图标审核，追加生成遗漏的视觉资产。',
    inputs: ['ui-design.png', 'asset-map.json', '用户对话指令'],
    outputs: ['missing-assets.json', 'generated-assets/*'],
    gate: ['不重复已有成功切图', '补复杂视觉和小图标', '失败切图可重试']
  },
  html: {
    id: 'image-make-html',
    number: 7,
    title: 'Gemini 生成 HTML + 审核闭环',
    summary: 'Gemini 读设计图生成 HTML，GPT-5.5 审核代码，再截图交给 Gemini 视觉复核。',
    inputs: ['ui-design.png', 'design-spec.json', 'asset-map.json'],
    outputs: ['index.html', 'code-review.md', 'visual-review.md'],
    gate: ['Gemini 已参考设计图', 'GPT-5.5 已审核代码', 'Gemini 已审核最终截图']
  },
  htmlRepair: {
    id: 'image-make-html-repair',
    number: 8.5,
    title: '双模型复核并修复 HTML',
    summary: 'Gemini 3.1 与 GPT-5.5 同时复核设计图、HTML 截图和代码，必要时补切图并重写 HTML。',
    inputs: ['ui-design.png', 'html-final-screenshot.png', 'index.html', 'asset-map.json'],
    outputs: ['html-visual-diff.json', 'missing-assets-from-html-review.json', 'repaired-index.html'],
    gate: ['Gemini 与 GPT-5.5 都完成复核', '缺失切图用 image2 追加生成', '修复后再次截图复核']
  }
}

async function generateDesign() {
  if (!prompt.value.trim()) return
  await runStep('design', async () => {
    appendMessage('user', referenceImages.value.length
      ? `${prompt.value}\n\n参考图：${referenceImageNames.value}\n参考图参与生成：${useReferenceImages.value ? '是' : '否'}`
      : prompt.value)
    const run = await runAgentStep({
      stage: workflowStages.design,
      agentType: 'image2-ui-agent',
      message: [
        prompt.value,
        '',
        '本次只生成 1 张完整移动端 UI 设计图，目标是 iPhone 纵向手机 App 页面。',
        '强制要求：竖版手机界面，单屏 App 截图比例，不要桌面端网页，不要 PC Dashboard，不要浏览器窗口，不要横向宽屏。',
        '要求正视角、无设备外壳、真实可读中文文案、可被 HTML/CSS 还原。'
      ].join('\n'),
      designBatch: {
        mode: 'fixed',
        count: 1,
        maxCount: 1,
        viewport: 'mobile',
        imageSize: '1152x2048',
        fileName: 'mobile-ui-design.png',
        purpose: 'Mobile App 高保真 UI 设计稿',
        focus: 'iPhone 纵向移动端页面、顶部状态区、内容卡片、底部导航和核心操作路径'
      },
      referenceImages: activeReferenceImages.value
    })
    if (!activeHistoryId.value) {
      activeHistoryId.value = createHistoryId()
    }
    designRun.value = run
    assetRun.value = null
    assetPlan.value = null
    missingAssetScan.value = null
    designDetailReview.value = null
    assetCount.value = 0
    resetHtmlArtifacts()
    appendMessage('assistant', 'UI 设计图已生成，右侧可以预览和下载。')
    await persistImageMakeHistory('design')
  })
}

async function generateAssets() {
  if (!design.value?.resultUrl) return
  await runStep('assets', async () => {
    missingAssetScan.value = null
    const plan = await determineAssetPlanWithGemini()
    designDetailReview.value = null
    const count = Math.max(1, Math.min(24, Number(plan.count) || 1))
    assetPlan.value = plan
    assetCount.value = count

    const run = await runAgentStep({
      stage: workflowStages.assets,
      agentType: 'image2-assets-agent',
      message: [
        '基于下面这张 UI 设计图，生成对应 Web 切图资产。',
        `设计图展示地址：${getDesignDisplayAddress()}`,
        design.value.source === 'uploaded-reference' ? '这张设计图来自用户上传图片；模型请求已附带原图内容，请不要使用默认图或占位图。' : '',
        `原始需求：${prompt.value}`,
        `Gemini 判断切图数量：${count} 张`,
        `判断理由：${plan.reason}`,
        '',
        'Gemini 结构化切图清单：',
        ...plan.assets.map((asset, index) => {
          return [
            `${index + 1}. ${asset.name}`,
            `用途：${asset.purpose}`,
            `推荐尺寸：${asset.size || '按内容决定'}`,
            `透明背景：${asset.transparent ? '是' : '否'}`,
            asset.cropHint ? `设计稿位置：${asset.cropHint}` : '',
            asset.visualBrief ? `视觉细节：${asset.visualBrief}` : '',
            asset.elementsToExclude ? `禁止内容：${asset.elementsToExclude}` : ''
          ].filter(Boolean).join(' | ')
        }),
        '',
        `请严格按上面的 Gemini 清单逐张生成 ${count} 张切图资产，不要自行替换成默认资产。`,
        'image2 每次调用都已附带 UI 设计图作为图生图参考；请基于参考设计稿重绘/扩展单个复杂视觉资产。',
        '只生成复杂视觉资产，例如 hero 视觉、产品图、空状态、成功状态、地图/轨迹、品牌徽章；不要把标题、按钮、导航、表单、价格和状态标签切成图片。'
      ].join('\n'),
      assetBatch: {
        mode: 'fixed',
        count,
        maxCount: count,
        reason: plan.reason,
        assets: plan.assets
      },
      referenceImages: getModelReferenceImages()
    })
    assetRun.value = run
    resetHtmlArtifacts()
    appendMessage('assistant', `切图资产已生成：${successfulAssets.value.length}/${assets.value.length} 张成功。`)
    await persistImageMakeHistory('assets')
  })
}

async function scanAndGenerateMissingAssets() {
  if (!design.value?.resultUrl) return
  await runStep('missing-assets', async () => {
    designDetailReview.value = await reviewDesignDetailsWithGemini('missing-assets')
    const geminiScanPlan = await determineMissingAssetPlanWithGemini()
    const gptIconAuditPlan = await determineMissingAssetPlanWithGptAuditSafely(geminiScanPlan)
    const rawScanPlan = mergeMissingAssetPlans(geminiScanPlan, gptIconAuditPlan)
    const scanPlan = ensureAppendableMissingAssetPlan(rawScanPlan)
    missingAssetScan.value = scanPlan

    const supplementalAssets = await generateSupplementalAssetsFromPlan(scanPlan, {
      intro: '基于 UI 设计图、现有 asset-map 和 Gemini/GPT 细节扫描结果，追加生成缺失切图。',
      sourceLabel: 'Gemini + GPT-5.5 双审核后需要补充的切图',
      resetHtml: true
    })
    resetHtmlArtifacts()
    appendMessage('assistant', `缺失切图已补充：本次追加 ${supplementalAssets.length} 张，当前 ${successfulAssets.value.length}/${assets.value.length} 张成功。`)
    await persistImageMakeHistory('missing-assets')
  })
}

async function generateSupplementalAssetsFromPlan(scanPlan, options = {}) {
  const count = scanPlan.assets.length
  if (!count) return []

  const run = await runAgentStep({
    stage: workflowStages.missingAssets,
    agentType: 'image2-assets-agent',
    message: [
      options.intro || '基于 UI 设计图、现有 asset-map 和复核结果，追加生成缺失切图。',
      `设计图展示地址：${getDesignDisplayAddress()}`,
      design.value.source === 'uploaded-reference' ? '这张设计图来自用户上传图片；模型请求已附带原图内容，请不要使用默认图或占位图。' : '',
      `原始需求：${prompt.value}`,
      '',
      '设计图复核摘要：',
      buildCompactDesignDetailReviewText(),
      '',
      '现有切图清单摘要：',
      formatExistingAssetLinesForScan({ compact: true }),
      '',
      `${options.sourceLabel || '复核后需要补充的切图'}：`,
      formatMissingAssetLinesForPrompt(scanPlan),
      '',
      scanPlan.autoSupplemented ? '复核未列出足够缺口时，系统已根据设计图复核结果追加细节补充切图，请按清单执行。' : '',
      `请严格只追加生成上面 ${count} 张缺失切图。`,
      '不要重新生成已有成功切图，不要把整张设计图切成图片，不要生成文字、按钮、价格、表单、导航和状态标签。',
      '如果清单是小图标/徽章，只生成图形本体和透明背景，不要带旁边文字，例如只生成“学生特惠”左侧图标，不生成“学生特惠”四个字。',
      '每张缺失切图都要以随请求上传的 UI 设计图作为图生图参考，尽量补齐 HTML 还原会缺失的产品图、场景图、插画、地图路线、品牌视觉、小图标或徽章。'
    ].join('\n'),
    assetBatch: {
      mode: 'fixed',
      count,
      maxCount: count,
      reason: scanPlan.reason,
      assets: scanPlan.assets
    },
    referenceImages: getModelReferenceImages()
  })

  const supplementalAssets = run.assetBatchArtifact?.assets || []
  const mergedAssets = mergeAssetResults(assets.value, supplementalAssets)
  assetRun.value = {
    ...run,
    assetBatchArtifact: {
      ...(run.assetBatchArtifact || {}),
      mode: assetRun.value?.assetBatchArtifact?.mode || 'fixed',
      requestedCount: mergedAssets.length,
      generatedCount: mergedAssets.filter((asset) => asset.status === 'success').length,
      summary: `复核追加 ${supplementalAssets.length} 张切图，当前 asset-map 共 ${mergedAssets.length} 张。`,
      assets: mergedAssets
    }
  }
  assetPlan.value = mergeAssetPlanWithMissing(assetPlan.value, scanPlan, mergedAssets)
  assetCount.value = mergedAssets.length
  if (options.resetHtml) {
    resetHtmlArtifacts()
  }
  return supplementalAssets
}

async function determineAssetPlanWithGemini() {
  const run = await runAgentStep({
      stage: {
        id: 'image-make-asset-plan',
        number: 5,
        title: 'Gemini 判断切图数量',
        summary: '根据 UI 设计图判断需要生成多少张视觉切图。',
        inputs: ['ui-design.png', '用户需求', '参考图'],
        outputs: ['asset-plan.json'],
        gate: ['数量不超过 24 张', '规划复杂视觉和专属小图标', '排除文字按钮表单导航整块']
    },
    agentType: 'gemini-spec-agent',
    message: [
      '请查看 UI 设计图，并结合原始需求，判断 Web 还原阶段真正需要多少张切图资产。',
      `UI 设计图展示地址：${getDesignDisplayAddress()}`,
      design.value.source === 'uploaded-reference' ? '这张 UI 设计图来自用户上传图片；图片内容已随请求作为参考图上传，请按上传图判断。' : '',
      `原始需求：${prompt.value}`,
      '',
      '只规划必须图片化的视觉资产，例如 Hero 插画、商品图、地图路线、空状态、成功状态、品牌徽章、氛围图，以及设计稿专属小图标。',
      '小图标不要直接忽略：顶部定位/搜索/消息图标、快捷标签左侧图标、热门推荐火焰图标、服务保障图标，如果有独特色彩/渐变/业务语义/品牌风格，也要规划为透明小切图。',
      '不要把文字、按钮、导航、表单、价格、标签、卡片背景规划为切图；如果规划小图标，只切图形本体，不切旁边文字。',
      '每一张切图都要给 image2 足够具体的图生图提示信息，包括在设计稿中的位置、视觉内容、保留元素和排除元素。',
      '数量范围：1 到 24。',
      '',
      '只输出严格 JSON，不要 Markdown：',
      JSON.stringify({
        count: 6,
        reason: '为什么需要这些切图',
        assets: [
          {
            name: 'hero-visual.webp',
            purpose: '首页主视觉',
            size: '1280x720',
            transparent: false,
            cropHint: '设计稿顶部 Hero 区域，避开标题和按钮文字',
            visualBrief: '重绘海鲜冷链配送主视觉，包含新鲜海产、冷链箱、配送动线和海洋色氛围',
            elementsToKeep: '品牌色、冷链可信气质、主视觉构图方向',
            elementsToExclude: '所有可读文字、按钮、价格、导航、表单、状态标签',
            prompt: '给 image2 的单张切图生成提示词'
          }
        ]
      }, null, 2)
    ].join('\n'),
    referenceImages: getModelReferenceImages()
  })

  const plan = normalizeAssetPlan(parseJsonFromText(run.reply))
  appendMessage('assistant', `Gemini 已判断切图数量：${plan.count} 张。${plan.reason}`)
  return plan
}

async function reviewDesignDetailsWithGemini(reviewTarget = 'html') {
  const run = await runAgentStep({
    stage: {
      id: `image-make-design-detail-review-${reviewTarget}`,
      number: reviewTarget === 'missing-assets' ? 6.05 : 6.45,
      title: 'Gemini 设计图细节复核',
      summary: '在切图扫描或 HTML 还原前，重新查看 UI 设计图，提取关键视觉证据和还原锚点。',
      inputs: ['ui-design.png', '用户需求', 'asset-map.json'],
      outputs: ['design-detail-review.json'],
      gate: ['确认移动端比例', '列出区块顺序和真实文案', '指出图片资产和 HTML/CSS 边界']
    },
    agentType: 'gemini-spec-agent',
    message: [
      '请重新仔细查看随请求上传的 UI 设计图，做一次设计图细节复核。不要生成 HTML，不要规划新 UI，只输出供后续阶段使用的结构化观察。',
      `复核用途：${reviewTarget === 'missing-assets' ? '扫描并生成缺失切图前复核' : '重新生成 HTML 前复核'}`,
      `UI 设计图展示地址：${getDesignDisplayAddress()}`,
      design.value.source === 'uploaded-reference' ? '这张 UI 设计图来自用户上传图片；图片内容已随请求作为参考图上传，请按上传图判断。' : '',
      `原始需求：${prompt.value}`,
      '',
      '当前切图状态：',
      formatExistingAssetLinesForScan(),
      '',
      '必须重点复核：',
      '- 画布是否是 iPhone 纵向移动端；如果不是，指出风险。',
      '- 自上而下的区块顺序、每个区块的视觉密度、主要文案和按钮。',
      '- 哪些视觉必须用切图，哪些必须用 HTML/CSS。',
      '- 已有切图是否覆盖设计图里的关键复杂视觉。',
      '- 重新生成 HTML 时最容易偏离设计图的 5 个细节。',
      '',
      '只输出严格 JSON，不要 Markdown：',
      JSON.stringify({
        reviewTarget,
        viewportEvidence: '从设计图判断出的设备比例、方向和画布特征',
        visualSummary: '一段精确的设计图视觉描述',
        sectionOrder: [
          {
            name: '顶部导航',
            position: '0-120px',
            visibleTexts: ['设计图里的真实文案'],
            layoutNotes: '间距、对齐、背景、圆角、层级'
          }
        ],
        visualAssetsToPreserve: [
          {
            area: 'Hero',
            assetNeed: '需要/不需要切图',
            reason: '判断依据',
            matchedAsset: '已有切图文件名或空',
            gapRisk: '缺失风险'
          }
        ],
        htmlCssElements: ['必须用 HTML/CSS 实现的文字、按钮、导航、价格、标签、表单'],
        restorationAnchors: ['重新生成 HTML 时必须锚定的布局/颜色/字号/间距细节'],
        warnings: ['容易偏离设计图的风险']
      }, null, 2)
    ].join('\n'),
    referenceImages: getGptIconAuditReferenceImages()
  })

  const parsed = parseJsonFromText(run.reply)
  const review = normalizeDesignDetailReview(parsed, run.reply, reviewTarget)
  appendMessage('assistant', `Gemini 已复核设计图细节：${review.visualSummary || review.viewportEvidence || '已生成结构化观察。'}`)
  return review
}

async function determineMissingAssetPlanWithGemini() {
  const run = await runAgentStep({
    stage: {
      id: 'image-make-missing-asset-plan',
      number: 6.1,
      title: 'Gemini 细节扫描并生成缺失切图规划',
      summary: '让 Gemini 对比 UI 设计图、已有切图和 asset-map，找出 HTML 还原会缺失的视觉资产。',
      inputs: ['ui-design.png', 'asset-map.json', 'generated-assets/*'],
      outputs: ['missing-assets.json'],
      gate: ['不重复已有成功切图', '只补缺失视觉资产', '数量不超过 18 张']
    },
    agentType: 'gemini-spec-agent',
    message: [
      '请逐区扫描随请求上传的 UI 设计图，并结合现有 asset-map，判断是否还缺少 HTML 还原必需的复杂视觉切图。',
      '第 1 张参考图是 UI 设计图；如果后面还有参考图，它们是已生成切图或用户参考图，只用于判断是否重复。',
      `UI 设计图展示地址：${getDesignDisplayAddress()}`,
      design.value.source === 'uploaded-reference' ? '这张 UI 设计图来自用户上传图片；图片内容已随请求作为参考图上传，请按上传图判断。' : '',
      `原始需求：${prompt.value}`,
      '',
      '设计图复核摘要：',
      buildDesignDetailReviewText(),
      '',
      '现有 asset-map：',
      formatExistingAssetLinesForScan(),
      '',
      '扫描原则：',
      '- 找出 UI 中会影响还原质量、但当前 asset-map 没覆盖的视觉资产。',
      '- 优先补商品实拍/插画、Hero 视觉、地图路线、冷链场景、空状态/成功状态、品牌徽章、复杂纹理或氛围图。',
      '- 小图标不要一概忽略：如果设计稿里的小图标有独特色彩、渐变、拟物、品牌化、业务语义或会影响 1:1 还原，也要规划为切图。',
      '- 重点检查：优惠标签左侧小图标、定位图标、搜索/消息/对话图标、热门推荐标题左侧火焰图标、服务保障图标、分类区图标、底部导航里有品牌风格的图标。',
      '- 不要补文字、按钮、表单、价格、标签、卡片背景；如果补小图标，只切图形本体，不切旁边文字。',
      '- 极简通用线性图标如果可用 CSS/lucide 直接 1:1 实现，可以不补。',
      '- 不要重复已有成功切图；失败切图可以重新规划同名资产。',
      '- 如果没有明显缺失，missingCount 必须为 0，assets 必须为空数组。',
      '- 最多补 18 张。',
      '',
      '只输出严格 JSON，不要 Markdown：',
      JSON.stringify({
        missingCount: 3,
        coverageSummary: '当前切图覆盖情况',
        reason: '为什么还缺这些切图；如果不缺，说明原因',
        assets: [
          {
            name: 'fresh-shrimp-product.webp',
            purpose: '首页今日鲜货第一张商品实物图',
            size: '512x512',
            transparent: false,
            cropHint: '设计稿中部今日鲜货区域第一张商品卡，避开价格和按钮',
            visualBrief: '新鲜海虾近景，干净浅色背景，和原 UI 海洋蓝绿色调一致',
            elementsToKeep: '商品质感、光照方向、卡片中的实物构图比例',
            elementsToExclude: '所有可读文字、价格、按钮、标签、导航、表单',
            prompt: '给 image2 的单张切图生成提示词'
          }
        ]
      }, null, 2)
    ].join('\n'),
    referenceImages: getAssetScanReferenceImages()
  })

  const plan = normalizeMissingAssetPlan(parseJsonFromText(run.reply))
  appendMessage('assistant', `Gemini 细节扫描完成：建议补充 ${plan.assets.length} 张切图。${plan.reason}`)
  return plan
}

async function determineMissingAssetPlanWithGptAudit(geminiPlan) {
  const run = await runAgentStep({
    stage: {
      id: 'image-make-gpt-icon-asset-audit',
      number: 6.15,
      title: 'GPT-5.5 小图标缺失审核',
      summary: '用 GPT-5.5 多模态再看一轮设计图，专项检查 Gemini 容易漏掉的小图标、徽章和局部视觉切图。',
      inputs: ['ui-design.png', 'asset-map.json', 'Gemini missing-assets.json'],
      outputs: ['missing-icon-audit.json'],
      gate: ['参考图已传给 GPT', '专项检查 12-80px 小视觉', '只切图形本体不切文字']
    },
    agentType: 'gpt-asset-audit-agent',
    message: [
      '请直接查看随请求上传的 UI 设计图，并对现有 asset-map 做第二轮缺失切图审核。',
      '这轮不是重新做整体切图规划，而是专门补查 Gemini 容易漏掉的小图标、徽章、装饰符号和局部视觉资产。',
      `UI 设计图展示地址：${getDesignDisplayAddress()}`,
      design.value.source === 'uploaded-reference' ? '这张 UI 设计图来自用户上传图片；图片内容已随请求作为参考图上传，请按上传图判断。' : '',
      `原始需求：${prompt.value}`,
      '',
      '现有 asset-map：',
      formatExistingAssetLinesForScan(),
      '',
      'Gemini 第一轮建议：',
      formatMissingAssetLinesForPrompt(geminiPlan),
      '',
      '请逐区重点检查这些容易被漏掉的视觉：',
      '- 顶部定位图标、搜索图标、消息/对话/通知图标。',
      '- 快捷标签或胶囊按钮左侧的小图标，例如学生特惠、企业办公、游戏本、设计剪辑、免押金等左侧图形。',
      '- 标题区装饰图标，例如热门推荐左侧火焰、闪电、皇冠、冷链、保障等符号。',
      '- 服务保障、分类入口、底部导航里有独特色彩/渐变/拟物/品牌风格的小图标。',
      '- 任何 12-80px 之间，直接用普通 CSS/lucide 会明显不像原图的小视觉。',
      '',
      '判断边界：',
      '- 只切图标/徽章/装饰图形本身，不要切旁边文字。',
      '- 不要把按钮、标签、导航整块切成图片。',
      '- 如果某个图标是极简单色线框且可用通用图标库 1:1 还原，可以不规划。',
      '- 如果无法确认是否能 1:1 还原，宁可规划为透明 PNG/WebP 小切图。',
      '- 最多补 18 张。',
      '',
      '只输出严格 JSON，不要 Markdown：',
      JSON.stringify({
        missingCount: 5,
        coverageSummary: '小图标/徽章二次审核结论',
        reason: '为什么这些小图标需要补切图',
        assets: [
          {
            name: 'promo-student-benefit-icon.webp',
            purpose: '顶部快捷标签“学生特惠”左侧小图标',
            size: '256x256',
            transparent: true,
            cropHint: '顶部快捷标签区域，只取“学生特惠”左侧图形，不含文字和胶囊背景',
            visualBrief: '按照原设计稿风格重绘小尺寸优惠/学生图标，保持颜色、线条粗细、圆角和光泽一致',
            elementsToKeep: '图标轮廓、品牌色、渐变/高光、业务语义',
            elementsToExclude: '学生特惠文字、胶囊背景、按钮、导航、价格',
            prompt: '给 image2 的单张小图标切图提示词'
          },
          {
            name: 'hot-recommend-flame-icon.webp',
            purpose: '热门推荐标题左侧火焰图标',
            size: '256x256',
            transparent: true,
            cropHint: '热门推荐标题左侧，只取火焰图形',
            visualBrief: '重绘与设计稿一致的火焰/热度小图标，透明背景，可嵌入 HTML 标题前',
            elementsToKeep: '火焰形状、暖色渐变、尺寸比例',
            elementsToExclude: '热门推荐文字、标题行背景、更多按钮',
            prompt: '给 image2 的单张小图标切图提示词'
          }
        ]
      }, null, 2)
    ].join('\n'),
    referenceImages: getAssetScanReferenceImages()
  })

  const plan = normalizeMissingAssetPlan(parseJsonFromText(run.reply))
  appendMessage('assistant', `GPT-5.5 小图标缺失审核完成：建议补充 ${plan.assets.length} 张切图。${plan.reason}`)
  return {
    ...plan,
    auditSource: 'gpt-5.5-icon-audit'
  }
}

async function determineMissingAssetPlanWithGptAuditSafely(geminiPlan) {
  try {
    return await determineMissingAssetPlanWithGptAudit(geminiPlan)
  } catch (err) {
    const fallbackPlan = normalizeMissingAssetPlan({
      missingCount: 4,
      coverageSummary: 'GPT-5.5 小图标审核请求失败，已启用本地小图标安全补充规则。',
      reason: `GPT-5.5 小图标审核未完成：${err.message}`,
      assets: createIconFallbackMissingAssets(4)
    })
    appendMessage('assistant', `GPT-5.5 小图标审核未完成，继续用本地小图标安全补充规则生成切图：${err.message}`)
    return {
      ...fallbackPlan,
      auditSource: 'local-icon-safety-net'
    }
  }
}

async function generateHtml() {
  if (!design.value?.resultUrl) return
  await runStep('html', async () => {
    const htmlAssets = successfulAssets.value.slice(0, 24)
    const assetLines = formatAssetLinesForHtml(htmlAssets)
    htmlRun.value = null
    htmlSource.value = ''
    codeReviewRun.value = null
    codeReviewText.value = ''
    visualReviewRun.value = null
    visualReviewText.value = ''
    htmlScreenshotDataUrl.value = ''
    htmlDualReview.value = null

    htmlPipelineStatus.value = 'Gemini 复核设计图细节'
    designDetailReview.value = await reviewDesignDetailsWithGemini('html')

    htmlPipelineStatus.value = 'Gemini 读取设计图并生成设计规格'
    const spec = await determineHtmlDesignSpecWithGemini()
    designSpec.value = spec

    htmlPipelineStatus.value = 'Gemini 3.1 按设计图生成 HTML'
    const geminiRun = await runAgentStep({
      stage: workflowStages.html,
      agentType: 'gemini-html-agent',
      message: [
        '请直接查看随请求上传的 UI 设计图，并严格根据设计规格、设计参数和切图资产生成完整 HTML。',
        '目标不是重新设计，而是尽量 1:1 还原第一步设计图。',
        `UI 设计图展示地址：${getDesignDisplayAddress()}`,
        design.value.source === 'uploaded-reference' ? '这张 UI 设计图来自用户上传图片，不要使用默认图或占位图。' : '',
        `原始需求：${prompt.value}`,
        '',
        '设计参数：',
        buildDesignParametersText(),
        '',
        '设计图复核摘要：',
        buildDesignDetailReviewText(),
        '',
        'Gemini 视觉结构化规格：',
        JSON.stringify(spec, null, 2),
        '',
        '可用切图资产，只引用这些 URL：',
        assetLines,
        '',
        '输出要求：',
        '- 只输出 <!doctype html> 开头的完整 HTML，不要 Markdown，不要解释。',
        '- 内联 CSS，少量必要 JS；总长度尽量小于 9000 字符，优先保证首屏与核心模块贴近设计稿。',
        '- 移动端 iPhone 375x812 优先，桌面端居中展示手机页面。',
        '- 文本、按钮、卡片、导航、价格、标签都用 HTML/CSS 实现。',
        '- 图片只用于复杂视觉资产和设计稿专属小图标，不要把整张 UI 设计图当背景。',
        '- 所有 input/searchbox/textarea/select 都必须有稳定的 id 或 name，避免浏览器表单可访问性警告。',
        '- 尽量复刻设计图的区块顺序、视觉密度、圆角、阴影、色值、字号、间距和底部导航。'
      ].join('\n'),
      referenceImages: getModelReferenceImages()
    })

    const geminiHtml = extractHtml(geminiRun)
    if (!geminiHtml) {
      htmlRun.value = geminiRun
      throw new Error('Gemini 已返回结果，但没有识别到完整 HTML。')
    }

    htmlRun.value = geminiRun
    htmlSource.value = geminiHtml

    htmlPipelineStatus.value = 'GPT-5.5 审核并修订代码'
    const reviewedHtml = await reviewHtmlWithGpt55(geminiHtml, spec, assetLines)
    if (reviewedHtml) {
      htmlSource.value = reviewedHtml
    }

    await nextTick()
    htmlPipelineStatus.value = '生成最终效果截图'
    htmlScreenshotDataUrl.value = await captureHtmlPreviewScreenshot(htmlSource.value)

    htmlPipelineStatus.value = 'Gemini 3.1 审核最终截图'
    await reviewFinalScreenshotWithGemini(spec)

    htmlPipelineStatus.value = '闭环完成'
    appendMessage('assistant', 'HTML 已由 Gemini 生成，GPT-5.5 已审核代码，最终效果截图已交给 Gemini 复核。')
    await persistImageMakeHistory('html')
  })
}

function formatAssetLinesForHtml(htmlAssets = successfulAssets.value.slice(0, 24)) {
  return htmlAssets.length
    ? htmlAssets.map((asset, index) => {
      return `${index + 1}. ${asset.fileName} | ${asset.purpose} | ${asset.resultUrl}`
    }).join('\n')
      : '暂无切图资产；请用 CSS 占位复杂视觉区域，并保持后续可替换。'
}

async function determineHtmlDesignSpecWithGemini() {
  const run = await runAgentStep({
    stage: {
      id: 'image-make-html-design-spec',
      number: 6.5,
      title: 'Gemini 设计规格提取',
      summary: '让 Gemini 查看 UI 设计图，输出 HTML 还原必需的结构、尺寸、颜色、文本和组件规格。',
      inputs: ['ui-design.png', '用户需求', 'asset-map.json'],
      outputs: ['design-spec-for-html.json'],
      gate: ['包含布局结构', '包含颜色字号间距', '包含文本和图片位置']
    },
    agentType: 'gemini-spec-agent',
    message: [
      '请查看随请求上传的 UI 设计图，提取给 HTML 还原使用的详细设计规格。',
      `UI 设计图展示地址：${getDesignDisplayAddress()}`,
      `原始需求：${prompt.value}`,
      '',
      '设计图复核摘要：',
      buildDesignDetailReviewText(),
      '',
      '必须描述：画布比例、主要区块顺序、每个区块的相对位置、背景色、卡片样式、圆角、阴影、字号层级、真实文案、底部导航、图片资产放置位置。',
      '请把需要代码还原的文字/按钮/价格/标签/导航明确列出来，不要让代码模型自己编。',
      '',
      '只输出严格 JSON，不要 Markdown：',
      JSON.stringify({
        viewport: {
          target: 'iPhone portrait',
          logicalWidth: 375,
          logicalHeight: 812,
          sourceImageSize: design.value?.imageSize || '1152x2048'
        },
        visualSummary: '整体视觉摘要',
        tokens: {
          colors: [],
          typography: [],
          spacing: [],
          radius: [],
          shadows: []
        },
        sections: [
          {
            name: 'Hero',
            order: 1,
            position: '顶部区域',
            layout: '结构和尺寸',
            background: '颜色/渐变',
            texts: ['设计图里可见的真实文案'],
            components: ['按钮、标签、卡片、图片位置'],
            cssHints: ['关键 CSS 还原提示']
          }
        ],
        assetPlacements: [
          {
            fileName: 'asset.webp',
            where: '放在哪个区块',
            fit: 'object-fit 和尺寸建议'
          }
        ],
        implementationWarnings: ['容易和设计图偏差的点']
      }, null, 2)
    ].join('\n'),
    referenceImages: getModelReferenceImages()
  })

  const parsed = parseJsonFromText(run.reply)
  return parsed || {
    raw: run.reply,
    viewport: {
      target: 'iPhone portrait',
      sourceImageSize: design.value?.imageSize || ''
    }
  }
}

async function reviewHtmlWithGpt55(sourceHtml, spec, assetLines) {
  const run = await runAgentStep({
    stage: {
      id: 'image-make-code-review',
      number: 7.5,
      title: 'GPT-5.5 代码审核',
      summary: '用 GPT-5.5 审核 Gemini 输出的 HTML，并在必要时直接修订。',
      inputs: ['index.html', 'design-spec-for-html.json', 'asset-map.json'],
      outputs: ['reviewed-index.html', 'code-review.md'],
      gate: ['HTML 可运行', '资源引用有效', '移动端布局稳定']
    },
    agentType: 'code-review-agent',
    message: [
      '请审核下面的 HTML。先输出简短中文审核结论；只有发现必须修复的问题时，才在结论后输出修订后的完整 HTML 代码块。',
      '重点检查：是否可运行、是否移动端优先、是否没有把整图当背景、图片 URL 是否只来自资产清单、文本/按钮/导航/价格是否用 HTML/CSS 实现、是否有明显布局溢出、表单字段是否有 id/name。',
      '如果没有重大问题，请输出 NO_CHANGES，并列出 3-6 条审核结论，不要重复输出完整 HTML。',
      '如果需要修复，请输出 ```html 代码块，代码块必须是完整 HTML。不要输出无关解释。',
      '',
      '设计规格 JSON：',
      JSON.stringify(spec, null, 2).slice(0, 6500),
      '',
      '设计图复核摘要：',
      buildDesignDetailReviewText(),
      '',
      '可用切图资产：',
      assetLines,
      '',
      '待审核 HTML：',
      '```html',
      sourceHtml,
      '```'
    ].join('\n')
  })

  codeReviewRun.value = run
  codeReviewText.value = stripModelReasoning(run.reply)
  return extractHtml({ ...run, reply: codeReviewText.value }) || sourceHtml
}

async function reviewFinalScreenshotWithGemini(spec) {
  const reviewImages = [
    ...getDesignReferenceImages(),
    htmlScreenshotDataUrl.value
      ? {
        id: 'html-final-screenshot',
        name: 'html-final-screenshot.png',
        src: htmlScreenshotDataUrl.value,
        type: htmlScreenshotDataUrl.value.startsWith('data:image/svg+xml') ? 'image/svg+xml' : 'image/png',
        source: 'html-preview-screenshot'
      }
      : null
  ].filter(Boolean)

  const run = await runAgentStep({
    stage: {
      id: 'image-make-final-visual-review',
      number: 8,
      title: 'Gemini 最终视觉审核',
      summary: '把原始设计图和最终 HTML 效果截图交给 Gemini 对比审核。',
      inputs: ['ui-design.png', 'html-final-screenshot.png', 'design-spec-for-html.json'],
      outputs: ['visual-review.md'],
      gate: ['说明相似度', '列出 P0/P1/P2 偏差', '给出可执行修复建议']
    },
    agentType: 'qa-agent',
    message: [
      '请对比第 1 张图片（原始 UI 设计图）和第 2 张图片（最终 HTML 效果截图）。',
      '检查布局、视觉层级、颜色、间距、字号、图片位置、底部导航、按钮和卡片是否贴近设计稿。',
      `原始需求：${prompt.value}`,
      '',
      '设计规格摘要：',
      JSON.stringify(spec, null, 2).slice(0, 8000),
      '',
      '设计图复核摘要：',
      buildDesignDetailReviewText(),
      '',
      '请输出中文审核报告，包含：',
      '- 总体相似度评分 0-100',
      '- P0/P1/P2 问题列表',
      '- 哪些地方已经接近设计图',
      '- 下一轮应该如何修改 HTML/CSS'
    ].join('\n'),
    referenceImages: reviewImages
  })

  visualReviewRun.value = run
  visualReviewText.value = run.reply
  return run
}

async function reviewAndRepairHtml() {
  if (!design.value?.resultUrl || !htmlSource.value) return
  await runStep('html-repair', async () => {
    const reviewReferences = getRequiredHtmlReviewReferenceImages()
    if (!reviewReferences.length) {
      throw new Error('复核修复必须带上第一步 UI 设计图。请先生成或恢复 UI 设计图。')
    }

    if (!designDetailReview.value) {
      htmlPipelineStatus.value = 'Gemini 复核设计图细节'
      designDetailReview.value = await reviewDesignDetailsWithGemini('html-repair')
    }
    if (!designSpec.value) {
      htmlPipelineStatus.value = 'Gemini 补全设计规格'
      designSpec.value = await determineHtmlDesignSpecWithGemini()
    }

    await nextTick()
    htmlPipelineStatus.value = '生成当前 HTML 效果截图'
    htmlScreenshotDataUrl.value = await captureHtmlPreviewScreenshot(htmlSource.value)

    const firstAssetLines = formatAssetLinesForHtml(successfulAssets.value.slice(0, 32))
    htmlPipelineStatus.value = 'Gemini + GPT-5.5 同时复核差异'
    const firstReview = await runHtmlDualReview({
      pass: 'first',
      sourceHtml: htmlSource.value,
      spec: designSpec.value,
      assetLines: firstAssetLines
    })
    htmlDualReview.value = {
      firstPass: firstReview,
      finalPass: null,
      addedAssetCount: 0,
      repaired: false,
      updatedAt: new Date().toISOString()
    }
    visualReviewText.value = buildHtmlDualReviewDisplayText(firstReview)

    const supplementalAssets = await generateMissingAssetsFromHtmlReview(firstReview)
    if (supplementalAssets.length) {
      htmlDualReview.value = {
        ...htmlDualReview.value,
        addedAssetCount: supplementalAssets.length,
        updatedAt: new Date().toISOString()
      }
    }

    const shouldRepair = firstReview.needsRepair || supplementalAssets.length > 0
    if (shouldRepair) {
      htmlPipelineStatus.value = 'GPT-5.5 根据双复核报告修复 HTML'
      const repairedHtml = await repairHtmlWithGpt55FromDualReview(
        htmlSource.value,
        firstReview,
        formatAssetLinesForHtml(successfulAssets.value.slice(0, 32))
      )
      if (repairedHtml) {
        htmlSource.value = repairedHtml
        htmlDualReview.value = {
          ...htmlDualReview.value,
          repaired: true,
          updatedAt: new Date().toISOString()
        }
      }

      await nextTick()
      htmlPipelineStatus.value = '生成修复后 HTML 截图'
      htmlScreenshotDataUrl.value = await captureHtmlPreviewScreenshot(htmlSource.value)

      htmlPipelineStatus.value = 'Gemini + GPT-5.5 修复后二次复核'
      const finalReview = await runHtmlDualReview({
        pass: 'final',
        sourceHtml: htmlSource.value,
        spec: designSpec.value,
        assetLines: formatAssetLinesForHtml(successfulAssets.value.slice(0, 32))
      })
      htmlDualReview.value = {
        ...htmlDualReview.value,
        finalPass: finalReview,
        updatedAt: new Date().toISOString()
      }
      visualReviewText.value = buildHtmlDualReviewDisplayText(finalReview)
    }

    htmlRun.value = {
      ...(htmlRun.value || {}),
      id: htmlRun.value?.id || `html-repair-${Date.now()}`,
      createdAt: htmlRun.value?.createdAt || new Date().toISOString(),
      htmlPagesArtifact: [{
        id: 'image-make-repaired-html',
        title: '复核修复后的 HTML',
        route: '/',
        srcdoc: htmlSource.value
      }]
    }

    htmlPipelineStatus.value = shouldRepair ? '双模型复核修复完成' : '双模型复核通过，无需修复'
    appendMessage(
      'assistant',
      shouldRepair
        ? `Gemini + GPT-5.5 已完成双复核并修复 HTML，本轮补充 ${supplementalAssets.length} 张切图。`
        : 'Gemini + GPT-5.5 已完成双复核，当前 HTML 与设计图无必须修复项。'
    )
    await persistImageMakeHistory('html-repair')
  })
}

async function runHtmlDualReview({ pass, sourceHtml, spec, assetLines }) {
  const tasks = [
    reviewHtmlAgainstDesignWithGemini({ pass, sourceHtml, spec, assetLines })
      .then((review) => ({ key: 'gemini', review }))
      .catch((err) => ({ key: 'gemini', error: err })),
    reviewHtmlAgainstDesignWithGpt55({ pass, sourceHtml, spec, assetLines })
      .then((review) => ({ key: 'gpt', review }))
      .catch((err) => ({ key: 'gpt', error: err }))
  ]
  const results = await Promise.all(tasks)
  const gemini = results.find((item) => item.key === 'gemini')?.review || null
  const gpt = results.find((item) => item.key === 'gpt')?.review || null
  const errors = results
    .filter((item) => item.error)
    .map((item) => `${item.key === 'gemini' ? 'Gemini 3.1' : 'GPT-5.5'}：${item.error.message}`)

  if (!gemini && !gpt) {
    throw new Error(`双模型复核失败：${errors.join('；')}`)
  }

  return mergeHtmlDualReviews({ gemini, gpt, errors, pass })
}

async function reviewHtmlAgainstDesignWithGemini({ pass, sourceHtml, spec, assetLines }) {
  const reviewImages = getRequiredHtmlReviewReferenceImages()
  const run = await runAgentStep({
    stage: {
      id: `image-make-gemini-html-diff-${pass}`,
      number: pass === 'final' ? 8.7 : 8.1,
      title: pass === 'final' ? 'Gemini 修复后视觉复核' : 'Gemini HTML 差异复核',
      summary: '对比 UI 设计图与 HTML 截图，结合代码和资产清单输出结构化差异。',
      inputs: ['ui-design.png', 'html-screenshot.png', 'index.html', 'asset-map.json'],
      outputs: ['gemini-html-diff.json'],
      gate: ['必须直接看设计图和 HTML 截图', '指出视觉差异', '指出缺失切图']
    },
    agentType: 'qa-agent',
    message: buildHtmlReviewPrompt({
      modelName: 'Gemini 3.1',
      pass,
      sourceHtml,
      spec,
      assetLines
    }),
    referenceImages: reviewImages
  })

  visualReviewRun.value = run
  return normalizeHtmlVisualReview(parseJsonFromText(run.reply), run.reply, 'Gemini 3.1')
}

async function reviewHtmlAgainstDesignWithGpt55({ pass, sourceHtml, spec, assetLines }) {
  const reviewImages = getRequiredHtmlReviewReferenceImages()
  const run = await runAgentStep({
    stage: {
      id: `image-make-gpt-html-visual-review-${pass}`,
      number: pass === 'final' ? 8.8 : 8.2,
      title: pass === 'final' ? 'GPT-5.5 修复后视觉与代码复核' : 'GPT-5.5 HTML 视觉与代码复核',
      summary: 'GPT-5.5 直接查看设计图和 HTML 截图，并结合源码判断视觉偏差、代码问题和缺失切图。',
      inputs: ['ui-design.png', 'html-screenshot.png', 'index.html', 'asset-map.json'],
      outputs: ['gpt-html-visual-diff.json'],
      gate: ['必须直接看图', '必须结合源码', '只输出 JSON']
    },
    agentType: 'gpt-html-visual-review-agent',
    message: buildHtmlReviewPrompt({
      modelName: 'GPT-5.5',
      pass,
      sourceHtml,
      spec,
      assetLines
    }),
    referenceImages: reviewImages
  })

  return normalizeHtmlVisualReview(parseJsonFromText(run.reply), run.reply, 'GPT-5.5')
}

function buildHtmlReviewPrompt({ modelName, pass, sourceHtml, spec, assetLines }) {
  return [
    `请作为 ${modelName} 对 HTML 还原做${pass === 'final' ? '修复后二次' : '再次'}复核。`,
    '第 1 张参考图是原始 UI 设计图，第 2 张参考图是当前 HTML 效果截图。',
    '注意：必须以第 1 张参考图为最高优先级，它就是第一步生成/恢复的 UI 设计图，不允许只凭文字规格判断。',
    '必须同时看图、读设计规格、读 asset-map、读 HTML 源码，判断 HTML 是否真正贴近第一步设计图。',
    `原始需求：${prompt.value}`,
    `UI 设计图展示地址：${getDesignDisplayAddress()}`,
    htmlReviewNotes.value.trim()
      ? [
        '',
        '人工注意项（用户手写，必须优先检查和落实）：',
        htmlReviewNotes.value.trim()
      ].join('\n')
      : '',
    '',
    '设计参数：',
    buildDesignParametersText(),
    '',
    '设计规格 JSON：',
    JSON.stringify(spec || {}, null, 2).slice(0, 7000),
    '',
    '可用切图资产：',
    assetLines,
    '',
    '当前 HTML 源码：',
    '```html',
    String(sourceHtml || '').slice(0, 16000),
    '```',
    '',
    '复核重点：',
    '- 必须逐段扫描：顶部状态/导航、搜索与快捷标签、Hero/Banner、分类金刚区、推荐/列表卡片、服务/保障区、底部导航，以及设计图里额外出现的区块。',
    '- 每一段都要判断：UI 设计图证据、HTML 截图证据、切图是否正确放置、是否需要重新对齐 CSS、是否缺少切图。',
    '- 布局结构、移动端比例、区块顺序、视觉密度、圆角、阴影、颜色、字号、间距是否接近设计图。',
    '- 是否有把复杂视觉、小图标、徽章、商品图、Hero 图、地图/轨迹、服务保障图标遗漏成普通占位或通用图标。',
    '- HTML/CSS 是否存在溢出、资源引用错误、桌面端化、整图当背景、文字图片化、按钮/表单/导航图片化等问题。',
    '- 如果发现缺失切图，请同时列到对应 sectionScans[].missingAssets 和顶层 missingAssets，后续会交给 image2 生成。',
    '- 如果切图已存在但 HTML 用错了、位置不准、尺寸比例不对，请写到 sectionScans[].assetAlignment 和 visualIssues，后续会重对齐 HTML。',
    '',
    '只输出严格 JSON，不要 Markdown，不要解释，不要输出 HTML：',
    JSON.stringify(getHtmlReviewJsonSchema(), null, 2)
  ].join('\n')
}

function getHtmlReviewJsonSchema() {
  return {
    score: 88,
    needsRepair: true,
    needsMissingAssets: true,
    summary: '一句话说明 HTML 与设计图的整体差距',
    sectionScans: [
      {
        section: 'Hero Banner',
        designEvidence: '设计图中该区块的位置、尺寸、文案、颜色、图片和视觉重点',
        htmlEvidence: 'HTML 截图中该区块当前表现',
        alignmentScore: 72,
        assetAlignment: '已有 banner-computers.webp，但 HTML 放置偏右且高度不够',
        issues: [
          {
            severity: 'P1',
            issue: '主视觉图片与设计图的裁切和位置不一致',
            expected: '右侧电脑主视觉应更靠近设计图比例',
            fixHint: '调整 img 宽度、绝对定位和 object-fit'
          }
        ],
        missingAssets: [
          {
            name: 'hero-cold-chain-badge.webp',
            purpose: 'Hero 区域冷链保障小徽章',
            size: '256x256',
            transparent: true,
            cropHint: 'Hero 文案附近的小徽章，只取图形本体',
            visualBrief: '按设计图风格重绘冷链/保障徽章，透明背景，不含文字',
            elementsToKeep: '徽章形状、品牌色、渐变/高光',
            elementsToExclude: '文字、按钮、价格、导航'
          }
        ]
      }
    ],
    visualIssues: [
      {
        severity: 'P1',
        area: '顶部搜索区',
        issue: 'HTML 截图里的搜索框高度和设计图不一致',
        expected: '应接近设计图里的高度、圆角、阴影和左右间距',
        fixHint: '调整 CSS 尺寸、圆角、padding 和阴影'
      }
    ],
    codeIssues: [
      {
        severity: 'P2',
        issue: '某个图片没有 object-fit 或宽高约束',
        fixHint: '补充稳定尺寸和 object-fit'
      }
    ],
    missingAssets: [
      {
        name: 'hot-recommend-flame-icon.webp',
        purpose: '热门推荐标题左侧火焰图标',
        size: '256x256',
        transparent: true,
        cropHint: '热门推荐标题左侧，只取火焰图形，不含文字',
        visualBrief: '重绘设计稿中的火焰小图标，透明背景，保持渐变、圆角和尺寸比例',
        elementsToKeep: '火焰形状、暖色渐变、透明背景',
        elementsToExclude: '热门推荐文字、标题行背景、按钮、价格、导航',
        prompt: '给 image2 的单张切图提示词'
      }
    ],
    repairPlan: [
      '补齐缺失切图后，把标题左侧图标改为 img 引用',
      '调整首页卡片间距和底部导航高度'
    ]
  }
}

function getHtmlReviewReferenceImages() {
  return [
    ...getDesignReferenceImages(),
    htmlScreenshotDataUrl.value
      ? {
        id: 'html-review-screenshot',
        name: 'html-review-screenshot.png',
        src: htmlScreenshotDataUrl.value,
        type: htmlScreenshotDataUrl.value.startsWith('data:image/svg+xml') ? 'image/svg+xml' : 'image/png',
        source: 'html-preview-screenshot'
      }
      : null
  ].filter(Boolean).slice(0, 2)
}

function getRequiredHtmlReviewReferenceImages() {
  const designReferences = getDesignReferenceImages()
  if (!designReferences.length) {
    throw new Error('复核修复必须带上第一步 UI 设计图，但当前没有可传给模型的 UI 图。请先生成或恢复 UI 设计图。')
  }

  const references = getHtmlReviewReferenceImages()
  if (!references.length || references[0]?.source === 'html-preview-screenshot') {
    throw new Error('复核修复参考图顺序异常：第 1 张必须是第一步 UI 设计图。')
  }
  return references
}

function normalizeHtmlVisualReview(value, rawText = '', source = '模型') {
  const review = value && typeof value === 'object' ? value : {}
  const scoreValue = Number(review.score ?? review.similarityScore ?? review.visualScore)
  const score = Number.isFinite(scoreValue) ? Math.max(0, Math.min(100, scoreValue)) : 0
  const sectionScans = normalizeHtmlSectionScans(review.sectionScans || review.sections || review.sectionReviews)
  const sectionMissingAssets = sectionScans.flatMap((section) => section.missingAssets || [])
  const missingPlan = normalizeMissingAssetPlan({
    missingCount: review.missingCount,
    coverageSummary: review.summary || review.coverageSummary || '',
    reason: review.reason || review.summary || '',
    assets: [
      ...(Array.isArray(review.missingAssets) ? review.missingAssets : []),
      ...sectionMissingAssets
    ]
  })
  const visualIssues = [
    ...normalizeHtmlReviewIssues(review.visualIssues || review.issues || review.diffIssues),
    ...sectionScans.flatMap((section) => (section.issues || []).map((issue) => ({
      ...issue,
      area: issue.area || section.section
    })))
  ]
  const codeIssues = normalizeHtmlReviewIssues(review.codeIssues || review.htmlIssues || review.implementationIssues)
  const explicitNeedsRepair = parseReviewBoolean(review.needsRepair ?? review.requiresRepair ?? review.needRepair)
  const explicitNeedsAssets = parseReviewBoolean(review.needsMissingAssets ?? review.needMissingAssets)
  const hasSectionMisalignment = sectionScans.some((section) => Number(section.alignmentScore) > 0 && Number(section.alignmentScore) < 94)
  const hasProblems = visualIssues.length > 0 || codeIssues.length > 0 || missingPlan.assets.length > 0 || hasSectionMisalignment
  return {
    source,
    score,
    needsRepair: explicitNeedsRepair ?? (score > 0 ? score < 94 || hasProblems : true),
    needsMissingAssets: explicitNeedsAssets ?? missingPlan.assets.length > 0,
    summary: String(review.summary || review.conclusion || rawText || '').trim().slice(0, 1800),
    sectionScans,
    visualIssues,
    codeIssues,
    missingAssets: missingPlan.assets,
    repairPlan: Array.isArray(review.repairPlan) ? review.repairPlan.slice(0, 12).map((item) => String(item)) : [],
    rawText: stripModelReasoning(rawText).slice(0, 3000)
  }
}

function normalizeHtmlReviewIssues(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 18).map((item, index) => {
    if (typeof item === 'string') {
      return {
        severity: 'P2',
        area: '',
        issue: item,
        expected: '',
        fixHint: ''
      }
    }
    return {
      severity: String(item?.severity || item?.level || 'P2').toUpperCase(),
      area: String(item?.area || item?.position || item?.section || '').trim(),
      issue: String(item?.issue || item?.problem || item?.description || `复核问题 ${index + 1}`).trim(),
      expected: String(item?.expected || item?.target || '').trim(),
      fixHint: String(item?.fixHint || item?.suggestion || item?.solution || '').trim()
    }
  }).filter((item) => item.issue)
}

function normalizeHtmlSectionScans(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 14).map((item, index) => {
    const section = typeof item === 'string' ? { section: item } : (item || {})
    const scoreValue = Number(section.alignmentScore ?? section.score ?? section.similarityScore)
    const normalizedMissing = normalizeMissingAssetPlan({
      assets: Array.isArray(section.missingAssets) ? section.missingAssets : []
    })
    return {
      id: String(section.id || `section-${index + 1}`).trim(),
      section: String(section.section || section.name || section.area || `区块 ${index + 1}`).trim(),
      designEvidence: String(section.designEvidence || section.design || section.designNotes || '').trim().slice(0, 900),
      htmlEvidence: String(section.htmlEvidence || section.html || section.htmlNotes || '').trim().slice(0, 900),
      alignmentScore: Number.isFinite(scoreValue) ? Math.max(0, Math.min(100, scoreValue)) : 0,
      assetAlignment: String(section.assetAlignment || section.assetStatus || section.assetUsage || '').trim().slice(0, 900),
      issues: normalizeHtmlReviewIssues(section.issues || section.visualIssues || section.diffIssues),
      missingAssets: normalizedMissing.assets
    }
  }).filter((section) => section.section)
}

function parseReviewBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (/^(true|yes|是|需要)$/i.test(value.trim())) return true
    if (/^(false|no|否|不需要)$/i.test(value.trim())) return false
  }
  return null
}

function mergeHtmlDualReviews({ gemini, gpt, errors = [], pass }) {
  const reviews = [gemini, gpt].filter(Boolean)
  const scores = reviews.map((review) => review.score).filter((score) => score > 0)
  const visualIssues = reviews.flatMap((review) => review.visualIssues || [])
  const codeIssues = reviews.flatMap((review) => review.codeIssues || [])
  const sectionScans = mergeHtmlSectionScans(reviews.flatMap((review) => review.sectionScans || []))
  const missingAssetPlan = mergeMissingAssetPlans(
    normalizeMissingAssetPlan({
      coverageSummary: gemini?.summary || '',
      reason: gemini?.summary || '',
      assets: gemini?.missingAssets || []
    }),
    normalizeMissingAssetPlan({
      coverageSummary: gpt?.summary || '',
      reason: gpt?.summary || '',
      assets: gpt?.missingAssets || []
    })
  )
  const score = scores.length ? Math.min(...scores) : 0
  const needsRepair = reviews.some((review) => review.needsRepair)
    || visualIssues.length > 0
    || codeIssues.length > 0
    || missingAssetPlan.assets.length > 0
    || (score > 0 && score < 94)

  return {
    pass,
    score,
    needsRepair,
    needsMissingAssets: missingAssetPlan.assets.length > 0,
    summary: [
      gemini?.summary ? `Gemini：${gemini.summary}` : '',
      gpt?.summary ? `GPT-5.5：${gpt.summary}` : '',
      errors.length ? `复核异常：${errors.join('；')}` : ''
    ].filter(Boolean).join('\n'),
    visualIssues: dedupeReviewIssues(visualIssues),
    codeIssues: dedupeReviewIssues(codeIssues),
    sectionScans,
    missingAssetPlan,
    repairPlan: [...new Set(reviews.flatMap((review) => review.repairPlan || []))].slice(0, 16),
    sources: {
      gemini,
      gpt
    },
    errors,
    updatedAt: new Date().toISOString()
  }
}

function mergeHtmlSectionScans(scans = []) {
  const bySection = new Map()
  scans.forEach((scan) => {
    const key = String(scan.section || '').trim().toLowerCase()
    if (!key) return
    const previous = bySection.get(key)
    if (!previous) {
      bySection.set(key, {
        ...scan,
        issues: [...(scan.issues || [])],
        missingAssets: [...(scan.missingAssets || [])]
      })
      return
    }

    const previousScore = previous.alignmentScore || scan.alignmentScore || 0
    const currentScore = scan.alignmentScore || previous.alignmentScore || 0
    bySection.set(key, {
      ...previous,
      designEvidence: previous.designEvidence || scan.designEvidence,
      htmlEvidence: previous.htmlEvidence || scan.htmlEvidence,
      alignmentScore: previousScore && currentScore ? Math.min(previousScore, currentScore) : previousScore || currentScore,
      assetAlignment: [previous.assetAlignment, scan.assetAlignment].filter(Boolean).join('；').slice(0, 1200),
      issues: dedupeReviewIssues([...(previous.issues || []), ...(scan.issues || [])]),
      missingAssets: mergeMissingAssetPlans(
        normalizeMissingAssetPlan({ assets: previous.missingAssets || [] }),
        normalizeMissingAssetPlan({ assets: scan.missingAssets || [] })
      ).assets
    })
  })

  return [...bySection.values()].slice(0, 14)
}

function dedupeReviewIssues(issues) {
  const seen = new Set()
  return issues.filter((issue) => {
    const key = `${issue.severity}|${issue.area}|${issue.issue}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 24)
}

async function generateMissingAssetsFromHtmlReview(review) {
  const rawPlan = review?.missingAssetPlan || normalizeMissingAssetPlan({})
  if (!rawPlan.assets?.length) return []

  const scanPlan = ensureAppendableMissingAssetPlan({
    ...rawPlan,
    coverageSummary: rawPlan.coverageSummary || 'HTML 与 UI 设计图复核发现仍有缺失切图。',
    reason: rawPlan.reason || '双模型复核认为这些视觉资产会影响 HTML 还原，需要交给 image2 补充。'
  }, {
    minimumAppendCount: 0,
    minimumIconAppendCount: 0
  })
  if (!scanPlan.assets.length) return []

  missingAssetScan.value = scanPlan
  htmlPipelineStatus.value = `image2 补充 ${scanPlan.assets.length} 张缺失切图`
  return generateSupplementalAssetsFromPlan(scanPlan, {
    intro: '基于 HTML 与 UI 设计图双模型复核结果，追加生成影响还原质量的缺失切图。',
    sourceLabel: 'Gemini + GPT-5.5 HTML 复核发现的缺失切图',
    resetHtml: false
  })
}

async function generateHtmlReviewMissingAssets(asset = null) {
  const review = activeHtmlReview.value
  if (!review) return

  await runStep('html-review-assets', async () => {
    const pendingPlan = getPendingHtmlReviewMissingAssetPlan(review)
    const candidateAssets = asset
      ? pendingPlan.assets.filter((item) => missingAssetSignature(item) === missingAssetSignature(asset))
      : pendingPlan.assets

    if (!candidateAssets.length) {
      appendMessage('assistant', '当前复核报告里的缺失切图都已经补齐或没有可追加项。')
      return
    }

    const scanPlan = ensureAppendableMissingAssetPlan({
      ...pendingPlan,
      missingCount: candidateAssets.length,
      coverageSummary: pendingPlan.coverageSummary || 'HTML 逐段扫描标出的缺失切图候选。',
      reason: pendingPlan.reason || '用户从 HTML 复核报告中手动点击补齐缺失切图。',
      assets: candidateAssets
    }, {
      minimumAppendCount: 0,
      minimumIconAppendCount: 0,
      maxAppendCount: Math.max(1, candidateAssets.length)
    })

    if (!scanPlan.assets.length) {
      appendMessage('assistant', '所选缺失切图已在当前 asset-map 中存在，无需重复生成。')
      return
    }

    missingAssetScan.value = scanPlan
    htmlPipelineStatus.value = `手动补齐 ${scanPlan.assets.length} 张缺失切图`
    const supplementalAssets = await generateSupplementalAssetsFromPlan(scanPlan, {
      intro: '基于 HTML 逐段扫描结果，按用户点击的缺失切图候选追加生成资产。',
      sourceLabel: 'HTML 逐段扫描标出的缺失切图',
      resetHtml: false
    })

    htmlDualReview.value = {
      ...(htmlDualReview.value || {}),
      manualAddedAssetCount: (htmlDualReview.value?.manualAddedAssetCount || 0) + supplementalAssets.length,
      updatedAt: new Date().toISOString()
    }
    appendMessage('assistant', `已按逐段扫描结果补齐 ${supplementalAssets.length} 张切图。可以继续点击“复核并修复 HTML”让代码引用新资产并重对齐。`)
    await persistImageMakeHistory('html-review-assets')
  })
}

function getPendingHtmlReviewMissingAssetPlan(review) {
  const rawPlan = review?.missingAssetPlan || normalizeMissingAssetPlan({})
  if (!rawPlan.assets?.length) return normalizeMissingAssetPlan({})
  return normalizeMissingAssetPlan({
    ...rawPlan,
    assets: rawPlan.assets.filter((asset) => !isHtmlReviewMissingAssetGenerated(asset))
  })
}

function isHtmlReviewMissingAssetGenerated(asset) {
  const signature = missingAssetSignature(asset)
  const fileKey = String(asset?.fileName || asset?.name || '').toLowerCase()
  if (!signature && !fileKey) return false
  return successfulAssets.value.some((generated) => {
    const generatedFileKey = String(generated.fileName || generated.name || '').toLowerCase()
    return generatedFileKey === fileKey || missingAssetSignature(generated) === signature
  })
}

async function repairHtmlWithGpt55FromDualReview(sourceHtml, review, assetLines) {
  const run = await runAgentStep({
    stage: {
      id: 'image-make-gpt-html-repair',
      number: 8.4,
      title: 'GPT-5.5 HTML 修复',
      summary: '根据 Gemini/GPT 双模型差异报告、设计规格和最新 asset-map 重写 HTML。',
      inputs: ['index.html', 'html-visual-diff.json', 'asset-map.json', 'design-spec-for-html.json'],
      outputs: ['repaired-index.html'],
      gate: ['修复视觉差异', '引用新增切图', '输出完整 HTML']
    },
    agentType: 'code-review-agent',
    message: [
      '请根据下面的 Gemini + GPT-5.5 双模型复核报告修复 HTML。',
      '只输出修复后的完整 HTML，不要 Markdown，不要解释；必须以 <!doctype html> 或 <html> 开头。',
      '目标是更接近第一步 UI 设计图，不是重新设计。',
      htmlReviewNotes.value.trim()
        ? [
          '人工注意项（用户手写，必须在修复中落实）：',
          htmlReviewNotes.value.trim()
        ].join('\n')
        : '',
      '修复要求：',
      '- 按 sectionScans 逐段修复：每个区块都要对齐 UI 设计图里的位置、尺寸、视觉密度、切图放置和文案层级。',
      '- 优先修复 P0/P1 视觉偏差和代码问题。',
      '- 如果双模型指出缺失切图，并且最新资产清单已有对应图片，必须改为 img 引用。',
      '- 如果指出“已有切图但位置/裁切/比例不准”，必须调整对应 img 的 CSS，包括 width、height、object-fit、object-position、absolute/flex/grid 位置。',
      '- 图片只引用资产清单里的 URL；不要使用默认图、远程占位图或整张 UI 设计图当背景。',
      '- 文本、按钮、标签、价格、表单、导航继续用 HTML/CSS 实现。',
      '- 所有 input/searchbox/textarea/select 都必须补齐 id 或 name。',
      '- 保持 iPhone 375x812 纵向移动端优先，桌面端居中展示手机页面。',
      '',
      '设计规格 JSON：',
      JSON.stringify(designSpec.value || {}, null, 2).slice(0, 7000),
      '',
      '双模型复核报告 JSON：',
      JSON.stringify(compactHtmlDualReviewForPrompt(review), null, 2).slice(0, 9000),
      '',
      '最新可用切图资产：',
      assetLines,
      '',
      '当前 HTML：',
      '```html',
      String(sourceHtml || '').slice(0, 18000),
      '```'
    ].join('\n')
  })

  codeReviewRun.value = run
  const reply = stripModelReasoning(run.reply)
  codeReviewText.value = [
    codeReviewText.value,
    '双模型复核修复：',
    reply
  ].filter(Boolean).join('\n\n').slice(-12000)
  return extractHtml({ ...run, reply }) || ''
}

function compactHtmlDualReviewForPrompt(review) {
  return {
    score: review.score,
    needsRepair: review.needsRepair,
    summary: review.summary,
    sectionScans: (review.sectionScans || []).map((section) => ({
      section: section.section,
      alignmentScore: section.alignmentScore,
      assetAlignment: section.assetAlignment,
      issues: section.issues,
      missingAssets: section.missingAssets
    })),
    visualIssues: review.visualIssues,
    codeIssues: review.codeIssues,
    missingAssets: review.missingAssetPlan?.assets || [],
    repairPlan: review.repairPlan,
    errors: review.errors
  }
}

function buildHtmlDualReviewDisplayText(review) {
  if (!review) return ''
  return [
    `双模型复核评分：${review.score || '未给分'}；${review.needsRepair ? '需要修复' : '无需强制修复'}`,
    review.summary,
    review.sectionScans?.length ? `逐段扫描：${review.sectionScans.length} 个区块，${review.sectionScans.filter((section) => Number(section.alignmentScore) > 0 && Number(section.alignmentScore) < 94).length} 个需要重对齐` : '',
    review.missingAssetPlan?.assets?.length ? `缺失切图：${review.missingAssetPlan.assets.map((asset) => asset.fileName || asset.name).slice(0, 8).join('、')}` : '',
    review.visualIssues?.length ? `视觉问题：${review.visualIssues.slice(0, 5).map((item) => `${item.severity} ${item.area || ''}${item.issue}`).join('；')}` : '',
    review.codeIssues?.length ? `代码问题：${review.codeIssues.slice(0, 4).map((item) => `${item.severity} ${item.issue}`).join('；')}` : ''
  ].filter(Boolean).join('\n')
}

async function runAgentStep({ stage, agentType, message, designBatch = null, assetBatch = null, referenceImages: images = [] }) {
  const settings = ensureBrowserDirectEnabled(loadAgentRuntimeSettings(), [agentType])
  if (!settings.browserDirectEnabled) {
    throw new Error('当前 Agent 绑定的模型配置不完整。请在右上角“模型设置”确认 Base URL、模型名和 API Key 都已填写；如果使用 .env，改完后需要重启前端 dev server。')
  }

  return runBrowserAgent({
    request: {
      stageId: stage.id,
      agentType,
      message,
      documentSlugs: [],
      designBatch,
      assetBatch,
      referenceImages: images
    },
    stage,
    documents: [],
    settings
  })
}

async function handleImageUpload(event) {
  const files = Array.from(event.target.files || [])
    .filter((file) => file.type.startsWith('image/'))
    .slice(0, Math.max(0, 10 - referenceImages.value.length))

  if (!files.length) {
    event.target.value = ''
    return
  }

  const nextImages = await Promise.all(files.map(readImageFile))
  referenceImages.value = [...referenceImages.value, ...nextImages].slice(0, 10)
  activeReferenceImageId.value = nextImages[nextImages.length - 1]?.id || activeReferenceImageId.value
  designRun.value = null
  assetRun.value = null
  assetPlan.value = null
  missingAssetScan.value = null
  designDetailReview.value = null
  assetCount.value = 0
  resetHtmlArtifacts()
  appendMessage('assistant', `已读取参考图：${nextImages.map((image) => image.name).join('、')}。UI 设计图模块会显示选中的本地地址。`)
  event.target.value = ''
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const id = `reference-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const previewSrc = URL.createObjectURL(file)
    const reader = new FileReader()
    reader.onload = () => {
      resolve({
        id,
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        src: reader.result,
        previewSrc,
        localUrl: previewSrc,
        localPath: previewSrc
      })
    }
    reader.onerror = () => {
      URL.revokeObjectURL(previewSrc)
      reject(new Error(`图片读取失败：${file.name}`))
    }
    reader.readAsDataURL(file)
  })
}

function removeReferenceImage(imageId) {
  const target = referenceImages.value.find((image) => image.id === imageId)
  const wasActive = activeReferenceImage.value?.id === imageId
  if (target?.previewSrc) {
    URL.revokeObjectURL(target.previewSrc)
  }
  referenceImages.value = referenceImages.value.filter((image) => image.id !== imageId)
  if (activeReferenceImageId.value === imageId) {
    activeReferenceImageId.value = referenceImages.value[referenceImages.value.length - 1]?.id || ''
  }
  if (wasActive) {
    clearGeneratedOutputs()
  }
}

function selectReferenceImage(imageId) {
  if (activeReferenceImageId.value === imageId) return
  activeReferenceImageId.value = imageId
  clearGeneratedOutputs()
}

function clearGeneratedOutputs() {
  designRun.value = null
  assetRun.value = null
  assetPlan.value = null
  missingAssetScan.value = null
  designDetailReview.value = null
  assetCount.value = 0
  resetHtmlArtifacts()
}

function resetHtmlArtifacts() {
  designSpec.value = null
  htmlRun.value = null
  htmlSource.value = ''
  codeReviewRun.value = null
  codeReviewText.value = ''
  visualReviewRun.value = null
  visualReviewText.value = ''
  htmlScreenshotDataUrl.value = ''
  htmlPipelineStatus.value = ''
  htmlDualReview.value = null
}

function parseJsonFromText(text) {
  const raw = String(text || '').trim()
  try {
    return JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function normalizeAssetPlan(value) {
  const fallback = {
    count: 6,
    reason: '按页面复杂度默认规划 6 张复杂视觉资产。',
    assets: []
  }
  const rawCount = Number(value?.count)
  const assets = Array.isArray(value?.assets) ? value.assets : []
  const count = Math.max(1, Math.min(24, Number.isFinite(rawCount) ? rawCount : assets.length || fallback.count))

  return {
    count,
    reason: String(value?.reason || fallback.reason).trim(),
    assets: Array.from({ length: count }, (_, index) => {
      const asset = assets[index] || {}
      const name = normalizeAssetFileName(asset.name, index)
      return {
        id: String(asset.id || `asset-${index + 1}`).trim(),
        name,
        fileName: name,
        purpose: String(asset.purpose || `复杂视觉资产 ${index + 1}`).trim(),
        size: String(asset.size || '').trim(),
        transparent: Boolean(asset.transparent),
        cropHint: String(asset.cropHint || asset.region || asset.position || '').trim(),
        visualBrief: String(asset.visualBrief || asset.description || asset.prompt || '').trim(),
        elementsToKeep: String(asset.elementsToKeep || asset.keep || '').trim(),
        elementsToExclude: String(asset.elementsToExclude || asset.exclude || '所有可读文字、按钮、价格、表单、导航、状态标签').trim(),
        prompt: String(asset.prompt || '').trim(),
        webPath: String(asset.webPath || `/assets/generated/${name}`).trim()
      }
    })
  }
}

function normalizeMissingAssetPlan(value) {
  const rawAssets = Array.isArray(value?.assets) ? value.assets : []
  const successfulNames = new Set(successfulAssets.value.map((asset) => String(asset.fileName || asset.name || '').toLowerCase()).filter(Boolean))
  const usedNames = new Set()
  const normalizedAssets = []

  rawAssets.slice(0, 18).forEach((asset, index) => {
    const fileName = normalizeAssetFileName(asset.fileName || asset.name || asset.purpose, index)
    const key = fileName.toLowerCase()
    if (!fileName || successfulNames.has(key) || usedNames.has(key)) return
    usedNames.add(key)
    normalizedAssets.push({
      id: String(asset.id || `missing-asset-${index + 1}`).trim(),
      name: fileName,
      fileName,
      purpose: String(asset.purpose || `缺失复杂视觉资产 ${index + 1}`).trim(),
      size: String(asset.size || '').trim(),
      transparent: Boolean(asset.transparent),
      cropHint: String(asset.cropHint || asset.region || asset.position || '').trim(),
      visualBrief: String(asset.visualBrief || asset.description || asset.prompt || '').trim(),
      elementsToKeep: String(asset.elementsToKeep || asset.keep || '').trim(),
      elementsToExclude: String(asset.elementsToExclude || asset.exclude || '所有可读文字、按钮、价格、表单、导航、状态标签').trim(),
      prompt: String(asset.prompt || '').trim(),
      webPath: String(asset.webPath || `/assets/generated/${fileName}`).trim()
    })
  })

  return {
    missingCount: normalizedAssets.length,
    coverageSummary: String(value?.coverageSummary || '').trim(),
    reason: String(value?.reason || (normalizedAssets.length ? '细节扫描发现仍有复杂视觉资产未覆盖。' : '现有切图已覆盖主要复杂视觉资产。')).trim(),
    assets: normalizedAssets
  }
}

function mergeMissingAssetPlans(geminiPlan, gptPlan) {
  const plans = [
    { source: 'GPT-5.5 小图标专项审核', plan: gptPlan },
    { source: 'Gemini 细节扫描', plan: geminiPlan }
  ].filter((item) => item.plan)
  const assetsBySignature = new Map()

  plans.forEach(({ source, plan }) => {
    ;(plan.assets || []).forEach((asset) => {
      const signature = missingAssetSignature(asset)
      if (!signature || assetsBySignature.has(signature)) return
      assetsBySignature.set(signature, {
        ...asset,
        auditSource: asset.auditSource || source,
        purpose: asset.purpose ? `${asset.purpose}` : `${source}发现的缺失视觉资产`
      })
    })
  })

  const mergedAssets = [...assetsBySignature.values()].slice(0, 18)
  return {
    missingCount: mergedAssets.length,
    coverageSummary: [
      gptPlan?.coverageSummary ? `GPT 小图标审核：${gptPlan.coverageSummary}` : '',
      geminiPlan?.coverageSummary ? `Gemini 细节扫描：${geminiPlan.coverageSummary}` : ''
    ].filter(Boolean).join('；'),
    reason: [
      gptPlan?.reason ? `GPT-5.5 小图标审核：${gptPlan.reason}` : '',
      geminiPlan?.reason ? `Gemini 细节扫描：${geminiPlan.reason}` : ''
    ].filter(Boolean).join(' '),
    auditSources: plans.map((item) => ({
      source: item.source,
      count: item.plan.assets?.length || 0,
      reason: item.plan.reason || ''
    })),
    assets: mergedAssets
  }
}

function missingAssetSignature(asset) {
  const fileName = String(asset.fileName || asset.name || '').toLowerCase().replace(/\.(png|jpe?g|webp)$/i, '')
  const purpose = String(asset.purpose || '').toLowerCase().replace(/\s+/g, '')
  const cropHint = String(asset.cropHint || '').toLowerCase().replace(/\s+/g, '')
  return fileName || `${purpose}|${cropHint}`
}

function ensureAppendableMissingAssetPlan(plan, options = {}) {
  const existingNames = new Set(assets.value.map((asset) => String(asset.fileName || asset.name || '').toLowerCase()).filter(Boolean))
  const usedNames = new Set(existingNames)
  const normalizedPlan = plan && typeof plan === 'object' ? plan : normalizeMissingAssetPlan({})
  const appendableAssets = []
  const maxAppendCount = options.maxAppendCount ?? 18

  ;(normalizedPlan.assets || []).slice(0, maxAppendCount).forEach((asset, index) => {
    appendableAssets.push(makeAppendableMissingAsset(asset, usedNames, index))
  })

  const minimumIconAppendCount = options.minimumIconAppendCount ?? 4
  const iconAppendCount = appendableAssets.filter(isIconLikeMissingAsset).length
  if (iconAppendCount < minimumIconAppendCount) {
    const fallbackStartIndex = appendableAssets.length
    createIconFallbackMissingAssets(minimumIconAppendCount - iconAppendCount).forEach((asset, index) => {
      appendableAssets.push(makeAppendableMissingAsset(asset, usedNames, fallbackStartIndex + index))
    })
  }

  const minimumAppendCount = options.minimumAppendCount ?? 5
  if (appendableAssets.length < minimumAppendCount) {
    const fallbackAssets = createFallbackMissingAssets(minimumAppendCount - appendableAssets.length)
    const fallbackStartIndex = appendableAssets.length
    fallbackAssets.forEach((asset, index) => {
      appendableAssets.push(makeAppendableMissingAsset(asset, usedNames, fallbackStartIndex + index))
    })
  }

  if (appendableAssets.length > maxAppendCount) {
    const prioritizedAssets = [
      ...appendableAssets.filter(isIconLikeMissingAsset),
      ...appendableAssets.filter((asset) => !isIconLikeMissingAsset(asset))
    ]
    appendableAssets.splice(0, appendableAssets.length, ...prioritizedAssets.slice(0, maxAppendCount))
  }

  const autoSupplemented = appendableAssets.length > (normalizedPlan.assets || []).length
  return {
    ...normalizedPlan,
    missingCount: appendableAssets.length,
    autoSupplemented,
    coverageSummary: normalizedPlan.coverageSummary || (
      autoSupplemented
        ? '细节扫描未返回足够的新切图，已自动补充关键视觉素材包，确保 HTML 还原时有更多可用资产。'
        : ''
    ),
    reason: normalizedPlan.reason || '细节扫描补充复杂视觉资产。',
    assets: appendableAssets
  }
}

function isIconLikeMissingAsset(asset) {
  return /icon|图标|徽章|火焰|热度|定位|搜索|消息|对话|通知|快捷|胶囊|标签左侧|保障|分类|导航/i
    .test([
      asset.fileName,
      asset.name,
      asset.purpose,
      asset.cropHint,
      asset.visualBrief
    ].filter(Boolean).join(' '))
}

function createIconFallbackMissingAssets(count) {
  return [
    {
      id: 'missing-icon-shortcut',
      name: 'shortcut-benefit-icon.webp',
      fileName: 'shortcut-benefit-icon.webp',
      purpose: '顶部快捷标签左侧小图标补充包',
      size: '256x256',
      transparent: true,
      cropHint: '顶部搜索下方快捷标签或胶囊入口左侧，例如学生特惠、企业办公、游戏本、设计剪辑、免押金等，只取小图标',
      visualBrief: '根据设计稿风格生成一枚可代表快捷标签的小图标，透明背景，保持原图标的线条、色彩、圆角、渐变或业务语义；不包含任何文字。',
      elementsToKeep: '图标轮廓、品牌色、渐变/高光、业务语义',
      elementsToExclude: '快捷标签文字、胶囊背景、按钮、导航、价格',
      prompt: '',
      webPath: '/assets/generated/shortcut-benefit-icon.webp'
    },
    {
      id: 'missing-icon-topbar',
      name: 'topbar-location-search-message-icons.webp',
      fileName: 'topbar-location-search-message-icons.webp',
      purpose: '定位/搜索/消息类顶部功能小图标补充包',
      size: '256x256',
      transparent: true,
      cropHint: '顶部导航区域里的定位、搜索、消息、通知或对话图标，只取图形本体',
      visualBrief: '重绘设计稿顶部功能图标的小尺寸版本，透明背景，保持原 UI 的图标粗细、色彩和圆角，不包含输入框、文字或数字角标。',
      elementsToKeep: '图标轮廓、线条粗细、圆角、品牌色、透明背景',
      elementsToExclude: '城市文字、搜索框、输入占位文字、消息数字角标、导航整块',
      prompt: '',
      webPath: '/assets/generated/topbar-location-search-message-icons.webp'
    },
    {
      id: 'missing-icon-hot-flame',
      name: 'hot-recommend-flame-icon.webp',
      fileName: 'hot-recommend-flame-icon.webp',
      purpose: '热门推荐标题左侧火焰或热度图标',
      size: '256x256',
      transparent: true,
      cropHint: '热门推荐/今日推荐/热卖标题左侧装饰图标，只取火焰、闪电、皇冠或热度图形',
      visualBrief: '生成与设计稿一致的标题装饰小图标，透明背景，适合嵌入 HTML 标题左侧，不包含标题文字。',
      elementsToKeep: '火焰或热度图形、暖色渐变、尺寸比例、透明背景',
      elementsToExclude: '热门推荐文字、标题行背景、更多按钮',
      prompt: '',
      webPath: '/assets/generated/hot-recommend-flame-icon.webp'
    },
    {
      id: 'missing-icon-service-badge',
      name: 'service-guarantee-badge-icon.webp',
      fileName: 'service-guarantee-badge-icon.webp',
      purpose: '服务保障或业务卖点小徽章图标',
      size: '256x256',
      transparent: true,
      cropHint: '服务保障、冷链保障、正品保障、极速发货、免押金等卖点区域的小图标',
      visualBrief: '根据设计稿风格补齐一枚业务卖点小图标或徽章，透明背景，保持品牌色和图形语义，不包含卖点文字。',
      elementsToKeep: '徽章轮廓、品牌色、图形语义、透明背景',
      elementsToExclude: '保障说明文字、卡片背景、按钮、标签整块',
      prompt: '',
      webPath: '/assets/generated/service-guarantee-badge-icon.webp'
    }
  ].slice(0, Math.max(0, count))
}

function createFallbackMissingAssets(count) {
  const reviewAssets = Array.isArray(designDetailReview.value?.visualAssetsToPreserve)
    ? designDetailReview.value.visualAssetsToPreserve
    : []
  const failedAssets = assets.value.filter((asset) => asset.status === 'failed' || !asset.resultUrl)
  const fallbackSeeds = [
    ...failedAssets.map((asset) => ({
      purpose: `补齐未成功生成的视觉资产：${asset.purpose || asset.fileName || asset.name || '复杂视觉'}`,
      cropHint: asset.cropHint || '参考原设计稿对应区域',
      visualBrief: asset.visualBrief || asset.prompt || asset.error || '根据 UI 设计图重新生成对应复杂视觉，避免使用占位图。',
      transparent: Boolean(asset.transparent),
      size: asset.size || ''
    })),
    ...createIconFallbackMissingAssets(4),
    ...reviewAssets.map((item, index) => {
      const text = String(typeof item === 'string' ? item : JSON.stringify(item) || '')
      return {
        purpose: `设计图细节补充 ${index + 1}`,
        cropHint: text.slice(0, 160),
        visualBrief: text.slice(0, 420),
        transparent: false,
        size: ''
      }
    }),
    {
      purpose: '核心商品或主视觉细节补充切图',
      cropHint: '设计稿主视觉、商品展示或首屏视觉重点区域',
      visualBrief: '提取并重绘设计图中最影响观感的商品、场景、品牌装饰或主视觉素材；保持风格、光影、色彩和构图一致。',
      transparent: false,
      size: '1024x1024'
    },
    {
      purpose: '列表卡片商品图或场景图补充切图',
      cropHint: '内容列表、商品卡片、推荐区或运营位中的复杂图片区域',
      visualBrief: '生成可用于 HTML 卡片的独立商品/场景图片，不包含价格、标题、按钮、标签等文字 UI。',
      transparent: false,
      size: '1024x1024'
    },
    {
      purpose: '状态页、地图路线或品牌插画补充切图',
      cropHint: '空状态、完成状态、地图路线、冷链流程或品牌氛围区域',
      visualBrief: '补齐页面中可能难以用 CSS 还原的插画、路线、徽章或氛围视觉；不包含可读文字。',
      transparent: true,
      size: '1024x1024'
    }
  ]

  return fallbackSeeds.slice(0, Math.max(0, count)).map((asset, index) => ({
    id: `missing-fallback-${index + 1}`,
    name: `missing-detail-${index + 1}.webp`,
    fileName: `missing-detail-${index + 1}.webp`,
    purpose: asset.purpose,
    size: asset.size || '',
    transparent: Boolean(asset.transparent),
    cropHint: asset.cropHint || '',
    visualBrief: asset.visualBrief || '',
    elementsToKeep: '保留设计稿中的风格、色彩、材质、透视、图形细节和对应业务语义。',
    elementsToExclude: '所有可读文字、按钮、价格、表单、导航整块、状态标签、水印、默认占位图。',
    prompt: '',
    webPath: `/assets/generated/missing-detail-${index + 1}.webp`
  }))
}

function makeAppendableMissingAsset(asset, usedNames, index) {
  const fileName = reserveUniqueAssetFileName(asset.fileName || asset.name || asset.purpose, usedNames, index, 'missing-detail')
  return {
    ...asset,
    id: String(asset.id || `missing-asset-${index + 1}-${fileName}`).trim(),
    name: fileName,
    fileName,
    purpose: String(asset.purpose || `缺失复杂视觉资产 ${index + 1}`).trim(),
    webPath: `/assets/generated/${fileName}`
  }
}

function normalizeDesignDetailReview(value, rawText = '', reviewTarget = 'html') {
  const review = value && typeof value === 'object' ? value : {}
  return {
    reviewTarget: String(review.reviewTarget || reviewTarget).trim(),
    viewportEvidence: String(review.viewportEvidence || '').trim(),
    visualSummary: String(review.visualSummary || review.summary || rawText || '').trim().slice(0, 3000),
    sectionOrder: Array.isArray(review.sectionOrder) ? review.sectionOrder.slice(0, 12) : [],
    visualAssetsToPreserve: Array.isArray(review.visualAssetsToPreserve)
      ? review.visualAssetsToPreserve.slice(0, 18)
      : [],
    htmlCssElements: Array.isArray(review.htmlCssElements) ? review.htmlCssElements.slice(0, 24) : [],
    restorationAnchors: Array.isArray(review.restorationAnchors) ? review.restorationAnchors.slice(0, 18) : [],
    warnings: Array.isArray(review.warnings) ? review.warnings.slice(0, 12) : []
  }
}

function buildDesignDetailReviewText() {
  if (!designDetailReview.value) return '暂无额外设计图复核；请直接以随请求上传的 UI 设计图为准。'
  return JSON.stringify(designDetailReview.value, null, 2).slice(0, 7000)
}

function buildCompactDesignDetailReviewText() {
  if (!designDetailReview.value) return '暂无额外设计图复核；请直接以随请求上传的 UI 设计图为准。'
  return [
    designDetailReview.value.viewportEvidence ? `视口：${designDetailReview.value.viewportEvidence}` : '',
    designDetailReview.value.visualSummary ? `视觉摘要：${designDetailReview.value.visualSummary}` : '',
    Array.isArray(designDetailReview.value.visualAssetsToPreserve) && designDetailReview.value.visualAssetsToPreserve.length
      ? `需关注视觉：${designDetailReview.value.visualAssetsToPreserve.slice(0, 8).map((item) => typeof item === 'string' ? item : `${item.area || ''}${item.assetNeed ? `(${item.assetNeed})` : ''}${item.gapRisk ? `-${item.gapRisk}` : ''}`).join('；')}`
      : '',
    Array.isArray(designDetailReview.value.warnings) && designDetailReview.value.warnings.length
      ? `风险：${designDetailReview.value.warnings.slice(0, 6).join('；')}`
      : ''
  ].filter(Boolean).join('\n').slice(0, 1400)
}

function formatExistingAssetLinesForScan(options = {}) {
  if (!assets.value.length) return '暂无现有切图。'
  const list = options.compact ? assets.value.slice(0, 18) : assets.value
  return list.map((asset, index) => {
    return [
      `${index + 1}. ${asset.fileName || asset.name || asset.id}`,
      `用途：${asset.purpose || '未标注'}`,
      `状态：${asset.status || 'unknown'}`,
      options.compact ? '' : asset.resultUrl ? '资源：已生成并作为可选参考图附带' : '',
      asset.cropHint && !options.compact ? `位置：${asset.cropHint}` : '',
      asset.error ? `错误：${String(asset.error).slice(0, 120)}` : ''
    ].filter(Boolean).join(' | ')
  }).join('\n') + (options.compact && assets.value.length > list.length ? `\n...另有 ${assets.value.length - list.length} 张已省略` : '')
}

function formatMissingAssetLinesForPrompt(plan) {
  const list = Array.isArray(plan?.assets) ? plan.assets : []
  if (!list.length) return '无缺失切图。'
  return list.map((asset, index) => {
    return [
      `${index + 1}. ${asset.fileName || asset.name}`,
      `用途：${asset.purpose}`,
      `推荐尺寸：${asset.size || '按内容决定'}`,
      `透明背景：${asset.transparent ? '是' : '否'}`,
      asset.cropHint ? `设计稿位置：${asset.cropHint}` : '',
      asset.visualBrief ? `视觉细节：${asset.visualBrief}` : '',
      asset.elementsToKeep ? `保留特征：${asset.elementsToKeep}` : '',
      asset.elementsToExclude ? `禁止内容：${asset.elementsToExclude}` : '',
      asset.prompt ? `单图提示词：${asset.prompt}` : ''
    ].filter(Boolean).join(' | ')
  }).join('\n')
}

function mergeAssetResults(existingAssets = [], supplementalAssets = []) {
  const merged = []
  const usedNames = new Set()
  const addAsset = (asset, source) => {
    const fileName = reserveUniqueAssetFileName(asset.fileName || asset.name, usedNames, merged.length, source === 'missing-asset-scan' ? 'missing-detail' : 'asset')
    merged.push({
      ...asset,
      id: '',
      name: fileName,
      fileName,
      webPath: asset.webPath || `/assets/generated/${fileName}`,
      source
    })
  }

  existingAssets.forEach((asset) => addAsset(asset, asset.source || 'asset-plan'))
  supplementalAssets.forEach((asset) => addAsset(asset, 'missing-asset-scan'))

  return merged.map((asset, index) => ({
    ...asset,
    id: `asset-${index + 1}-${asset.fileName}`
  }))
}

function mergeAssetPlanWithMissing(currentPlan, scanPlan, mergedAssets = []) {
  const currentReason = currentPlan?.reason ? String(currentPlan.reason).trim() : ''
  const scanReason = scanPlan?.reason ? String(scanPlan.reason).trim() : ''
  return {
    count: mergedAssets.length,
    reason: [
      currentReason || '按页面复杂度规划复杂视觉资产。',
      scanPlan?.assets?.length ? `细节扫描补充：${scanReason}` : ''
    ].filter(Boolean).join(' '),
    assets: mergedAssets.map((asset, index) => ({
      id: asset.id || `asset-${index + 1}`,
      name: asset.fileName,
      fileName: asset.fileName,
      purpose: asset.purpose || `复杂视觉资产 ${index + 1}`,
      size: asset.size || '',
      transparent: Boolean(asset.transparent),
      cropHint: asset.cropHint || '',
      visualBrief: asset.visualBrief || '',
      elementsToKeep: asset.elementsToKeep || '',
      elementsToExclude: asset.elementsToExclude || '所有可读文字、按钮、价格、表单、导航、状态标签',
      prompt: asset.prompt || '',
      webPath: asset.webPath || `/assets/generated/${asset.fileName}`
    }))
  }
}

function normalizeAssetFileName(value, index) {
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

function reserveUniqueAssetFileName(value, usedNames, index, prefix = 'asset') {
  const normalized = normalizeAssetFileName(value || `${prefix}-${index + 1}.webp`, index)
  const match = normalized.match(/^(.*?)(\.(?:png|jpe?g|webp))$/i)
  const base = (match?.[1] || `${prefix}-${index + 1}`).replace(/-+$/g, '') || `${prefix}-${index + 1}`
  const ext = match?.[2] || '.webp'
  let candidate = `${base}${ext}`
  let suffix = 2

  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${base}-${suffix}${ext}`
    suffix += 1
  }

  usedNames.add(candidate.toLowerCase())
  return candidate
}

function getDesignDisplayAddress() {
  return design.value?.localUrl || design.value?.previewUrl || design.value?.resultUrl || ''
}

function getModelReferenceImages() {
  if (!design.value) return []
  return [
    ...getDesignReferenceImages(),
    ...getExtraReferenceImages()
  ].slice(0, 10)
}

function getAssetScanReferenceImages() {
  return [
    ...getDesignReferenceImages(),
    ...successfulAssets.value.slice(0, 8).map((asset) => ({
      id: asset.id,
      name: asset.fileName,
      url: asset.resultUrl,
      type: asset.resultType === 'image' ? 'image/png' : '',
      source: 'generated-asset',
      optional: true
    })),
    ...getExtraReferenceImages()
  ].slice(0, 10)
}

function getGptIconAuditReferenceImages() {
  return [
    ...getDesignReferenceImages(),
    ...getExtraReferenceImages().slice(0, 1).map((image) => ({
      ...image,
      optional: true
    }))
  ].slice(0, 2)
}

function getDesignReferenceImages() {
  const currentDesign = design.value
  if (!currentDesign) return []

  if (currentDesign.source === 'uploaded-reference') {
    const selected = referenceImages.value.find((image) => image.id === currentDesign.id) || activeReferenceImage.value
    return selected?.src
      ? [{
        id: selected.id,
        name: selected.name,
        type: selected.type,
        size: selected.size,
        src: selected.src,
        previewSrc: selected.previewSrc,
        localUrl: selected.localUrl,
        localPath: selected.localPath,
        source: 'uploaded-reference'
      }]
      : []
  }

  return currentDesign.resultUrl
    ? [{
      id: currentDesign.id || 'design-reference',
      name: currentDesign.fileName || 'generated-ui-design.png',
      url: currentDesign.resultUrl,
      source: 'generated-design'
    }]
    : []
}

function getExtraReferenceImages() {
  const currentDesign = design.value
  if (currentDesign?.source === 'uploaded-reference') {
    return activeReferenceImages.value.filter((image) => image.id !== currentDesign.id)
  }
  const designUrl = currentDesign?.resultUrl
  return activeReferenceImages.value.filter((image) => image.src !== designUrl && image.previewSrc !== designUrl)
}

function buildDesignParametersText() {
  return JSON.stringify({
    source: design.value?.source || 'generated-design',
    designUrl: getDesignDisplayAddress(),
    designFileName: design.value?.fileName || '',
    imageSize: design.value?.imageSize || '1152x2048',
    viewport: design.value?.viewport || 'mobile',
    targetLogicalViewport: '375x812 iPhone portrait',
    requestedPrompt: prompt.value,
    assetPlan: assetPlan.value
      ? {
        count: assetPlan.value.count,
        reason: assetPlan.value.reason
      }
      : null,
    missingAssetScan: missingAssetScan.value
      ? {
        missingCount: missingAssetScan.value.assets?.length || 0,
        coverageSummary: missingAssetScan.value.coverageSummary || '',
        reason: missingAssetScan.value.reason || ''
      }
      : null,
    designDetailReview: designDetailReview.value
      ? {
        reviewTarget: designDetailReview.value.reviewTarget || '',
        viewportEvidence: designDetailReview.value.viewportEvidence || '',
        visualSummary: designDetailReview.value.visualSummary || '',
        restorationAnchors: designDetailReview.value.restorationAnchors || [],
        warnings: designDetailReview.value.warnings || []
      }
      : null,
    successfulAssetCount: successfulAssets.value.length,
    totalAssetCount: assets.value.length
  }, null, 2)
}

async function captureHtmlPreviewScreenshot(html) {
  const width = 390
  const height = 900
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.left = '-10000px'
  frame.style.top = '0'
  frame.style.width = `${width}px`
  frame.style.height = `${height}px`
  frame.style.border = '0'
  frame.setAttribute('sandbox', 'allow-same-origin')
  frame.setAttribute('referrerpolicy', 'no-referrer')
  frame.srcdoc = html
  document.body.appendChild(frame)

  try {
    await waitForFrameLoad(frame)
    await delay(800)
    const doc = frame.contentDocument
    const shotHeight = Math.min(1600, Math.max(height, doc?.documentElement?.scrollHeight || 0, doc?.body?.scrollHeight || 0))
    frame.style.height = `${shotHeight}px`
    await delay(200)
    const target = doc?.querySelector('main') || doc?.body
    if (target) {
      try {
        const canvas = await html2canvas(target, {
          backgroundColor: '#ffffff',
          width,
          height: shotHeight,
          windowWidth: width,
          windowHeight: shotHeight,
          scale: 1,
          useCORS: true,
          allowTaint: false,
          logging: false,
          imageTimeout: 5000
        })
        return canvas.toDataURL('image/png')
      } catch {
        // Continue to the lighter DOM-to-canvas fallback below.
      }
    }
    const svgDataUrl = htmlDocumentToSvgDataUrl(doc, width, shotHeight)
    const pngDataUrl = await svgDataUrlToPngDataUrl(svgDataUrl, width, shotHeight)
    return pngDataUrl.startsWith('data:image/png')
      ? pngDataUrl
      : domToFallbackPngDataUrl(doc, width, shotHeight)
  } catch {
    const safeHtml = sanitizeHtmlSource(html)
    return htmlToFallbackPngDataUrl(safeHtml, width, height)
  } finally {
    frame.remove()
  }
}

function waitForFrameLoad(frame) {
  return new Promise((resolve) => {
    let resolved = false
    const done = () => {
      if (resolved) return
      resolved = true
      resolve()
    }
    frame.addEventListener('load', done, { once: true })
    window.setTimeout(done, 2500)
  })
}

function htmlDocumentToSvgDataUrl(doc, width, height) {
  const head = doc?.head?.innerHTML || ''
  const body = doc?.body?.innerHTML || ''
  const xhtml = [
    '<div xmlns="http://www.w3.org/1999/xhtml">',
    '<style>html,body{margin:0;width:100%;min-height:100%;background:#fff;}</style>',
    head,
    body,
    '</div>'
  ].join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`
  return svgMarkupToDataUrl(svg)
}

function htmlToFallbackSvgDataUrl(html, width, height) {
  const escaped = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 6000)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><text x="18" y="28" font-size="12" font-family="monospace" fill="#111"><tspan>${escaped}</tspan></text></svg>`
  return svgMarkupToDataUrl(svg)
}

function htmlToFallbackPngDataUrl(html, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#111827'
  context.font = '12px monospace'
  const lines = String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .match(/.{1,46}/g) || ['HTML 预览截图生成失败，已保留文本摘要。']
  lines.slice(0, 54).forEach((line, index) => {
    context.fillText(line, 18, 28 + index * 16)
  })
  return canvas.toDataURL('image/png')
}

function domToFallbackPngDataUrl(doc, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.fillStyle = '#f5f5f5'
  context.fillRect(0, 0, width, height)

  const body = doc?.body
  if (!body) return htmlToFallbackPngDataUrl('', width, height)

  const selectors = [
    'main', 'header', 'section', 'nav', 'article', 'div', 'button', 'a',
    'img', 'h1', 'h2', 'h3', 'p', 'span', 'li', 'input'
  ].join(',')
  const nodes = Array.from(body.querySelectorAll(selectors)).slice(0, 260)

  nodes.forEach((node) => {
    const rect = node.getBoundingClientRect()
    if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > height || rect.right < 0 || rect.left > width) {
      return
    }

    const style = doc.defaultView.getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return

    const x = clamp(rect.left, 0, width)
    const y = clamp(rect.top, 0, height)
    const w = clamp(rect.width, 0, width - x)
    const h = clamp(rect.height, 0, height - y)
    if (w < 2 || h < 2) return

    const bg = normalizedColor(style.backgroundColor)
    const border = normalizedColor(style.borderTopColor)
    const radius = parseFloat(style.borderTopLeftRadius) || 0

    if (node.tagName === 'IMG') {
      drawRoundRect(context, x, y, w, h, Math.min(12, radius || 8), '#e6f4ff')
      context.strokeStyle = '#c7ddff'
      context.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1))
      drawText(context, node.getAttribute('alt') || 'image', x + 6, y + 16, w - 12, '#1677ff', 11, 600)
      return
    }

    if (bg && h >= 6 && w >= 8) {
      drawRoundRect(context, x, y, w, h, Math.min(18, radius), bg)
    }

    if (border && style.borderTopWidth !== '0px' && h >= 8 && w >= 8) {
      context.strokeStyle = border
      context.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1))
    }

    const text = directNodeText(node)
    if (!text) return
    const fontSize = clamp(parseFloat(style.fontSize) || 12, 9, 24)
    const fontWeight = Number(style.fontWeight) >= 600 ? 700 : 400
    const color = normalizedColor(style.color) || '#111827'
    drawText(context, text, x + 4, y + Math.min(h - 4, fontSize + 4), w - 8, color, fontSize, fontWeight)
  })

  return canvas.toDataURL('image/png')
}

function directNodeText(node) {
  if (node.tagName === 'INPUT') return node.getAttribute('placeholder') || ''
  const hasElementChild = Array.from(node.children || []).some((child) => {
    return child.tagName !== 'BR' && child.getBoundingClientRect().width > 0 && child.getBoundingClientRect().height > 0
  })
  if (hasElementChild && !['BUTTON', 'A'].includes(node.tagName)) return ''
  return Array.from(node.childNodes || [])
    .filter((child) => child.nodeType === window.Node.TEXT_NODE)
    .map((child) => child.textContent)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

function drawText(context, text, x, y, maxWidth, color, fontSize, fontWeight) {
  if (!text || maxWidth <= 0) return
  context.fillStyle = color
  context.font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  context.textBaseline = 'alphabetic'
  context.fillText(text, x, y, maxWidth)
}

function drawRoundRect(context, x, y, width, height, radius, fillStyle) {
  context.fillStyle = fillStyle
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  if (context.roundRect) {
    context.beginPath()
    context.roundRect(x, y, width, height, r)
    context.fill()
    return
  }
  context.fillRect(x, y, width, height)
}

function normalizedColor(value) {
  const color = String(value || '').trim()
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return ''
  return color
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function svgMarkupToDataUrl(svg) {
  const encoded = window.btoa(unescape(encodeURIComponent(svg)))
  return `data:image/svg+xml;base64,${encoded}`
}

function svgDataUrlToPngDataUrl(svgDataUrl, width, height) {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, width, height)
        context.drawImage(image, 0, 0, width, height)
        resolve(canvas.toDataURL('image/png'))
      } catch (error) {
        resolve(svgDataUrl)
      }
    }
    image.onerror = reject
    image.src = svgDataUrl
  })
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function initializeImageMakeHistory() {
  loadLocalImageMakeHistory()
  let restored = false
  const storedActiveId = window.localStorage.getItem(ACTIVE_HISTORY_STORAGE_KEY) || ''
  const activeEntry = historyEntries.value.find((entry) => entry.id === storedActiveId) || historyEntries.value[0]
  if (activeEntry) {
    restoreImageMakeHistory(activeEntry)
    restored = true
  }

  try {
    const payload = await getImageMakeRuns(50)
    const remoteEntries = Array.isArray(payload?.runs) ? payload.runs : []
    if (remoteEntries.length) {
      historyEntries.value = mergeHistoryEntries(historyEntries.value, remoteEntries)
      saveLocalImageMakeHistory()
      if (!restored) {
        restoreImageMakeHistory(historyEntries.value[0])
      }
    }
    historySyncStatus.value = remoteEntries.length ? '历史已从 SQLite 同步' : historySyncStatus.value
  } catch (err) {
    historySyncStatus.value = historyEntries.value.length
      ? `已读取本地历史，SQLite 同步失败：${err.message}`
      : `SQLite 历史读取失败：${err.message}`
  }
}

async function persistImageMakeHistory(stage) {
  if (!hasProjectOutput.value) return
  if (!activeHistoryId.value) {
    activeHistoryId.value = createHistoryId()
  }

  const snapshot = createImageMakeSnapshot(stage)
  historyEntries.value = mergeHistoryEntries([snapshot], historyEntries.value)
  saveLocalImageMakeHistory()
  historySyncStatus.value = '已保存到本地'

  try {
    const saved = await saveImageMakeRun(snapshot)
    historyEntries.value = mergeHistoryEntries([saved], historyEntries.value)
    saveLocalImageMakeHistory()
    historySyncStatus.value = '已保存到本地和 SQLite'
  } catch (err) {
    historySyncStatus.value = `本地已保存，SQLite 同步失败：${err.message}`
  }
}

function createImageMakeSnapshot(stage) {
  const existing = historyEntries.value.find((entry) => entry.id === activeHistoryId.value)
  const now = new Date().toISOString()
  const currentDesign = design.value
  const currentAssets = assets.value
  const html = htmlSource.value
  const title = titleFromPrompt(prompt.value)

  return {
    id: activeHistoryId.value,
    title,
    prompt: prompt.value,
    stage,
    designUrl: currentDesign?.resultUrl || '',
    assetCount: currentAssets.length,
    htmlReady: Boolean(html),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    data: {
      prompt: prompt.value,
      useReferenceImages: useReferenceImages.value,
      referenceImages: referenceImages.value.map((image) => ({
        name: image.name,
        type: image.type,
        size: image.size,
        localUrl: image.localUrl || image.previewSrc || ''
      })),
      assetPlan: assetPlan.value,
      missingAssetScan: missingAssetScan.value,
      designDetailReview: designDetailReview.value,
      assetCount: assetCount.value,
      designSpec: designSpec.value,
      design: currentDesign,
      assets: currentAssets,
      html,
      codeReview: codeReviewText.value,
      visualReview: visualReviewText.value,
      htmlDualReview: htmlDualReview.value,
      htmlReviewNotes: htmlReviewNotes.value,
      stage,
      savedAt: now
    }
  }
}

function restoreImageMakeHistory(entry) {
  if (!entry) return
  const data = entry.data || {}
  error.value = ''
  runningStep.value = ''
  activeHistoryId.value = entry.id
  prompt.value = data.prompt || entry.prompt || prompt.value
  useReferenceImages.value = data.useReferenceImages ?? true
  referenceImages.value = []
  activeReferenceImageId.value = ''
  assetPlan.value = data.assetPlan || null
  missingAssetScan.value = data.missingAssetScan || null
  designDetailReview.value = data.designDetailReview || null
  designSpec.value = data.designSpec || null
  assetCount.value = Number(data.assetCount || data.assetPlan?.count || data.assets?.length || 0)

  const restoredDesign = data.design || null
  designRun.value = restoredDesign
    ? {
      id: `restored-design-${entry.id}`,
      createdAt: entry.updatedAt,
      designBatchArtifact: {
        designs: [restoredDesign]
      }
    }
    : null

  const restoredAssets = Array.isArray(data.assets) ? data.assets : []
  assetRun.value = restoredAssets.length
    ? {
      id: `restored-assets-${entry.id}`,
      createdAt: entry.updatedAt,
      assetBatchArtifact: {
        assets: restoredAssets
      }
    }
    : null

  htmlSource.value = sanitizeHtmlSource(data.html || '')
  codeReviewText.value = stripModelReasoning(data.codeReview || '')
  visualReviewText.value = data.visualReview || ''
  htmlDualReview.value = data.htmlDualReview || null
  htmlReviewNotes.value = data.htmlReviewNotes || ''
  htmlScreenshotDataUrl.value = ''
  htmlPipelineStatus.value = htmlSource.value ? '历史已恢复' : ''
  htmlRun.value = htmlSource.value
    ? {
      id: `restored-html-${entry.id}`,
      createdAt: entry.updatedAt,
      htmlPagesArtifact: [{
        id: 'restored-html-page',
        title: entry.title || '历史 HTML',
        route: '/',
        srcdoc: htmlSource.value
      }]
    }
    : null

  messages.value = [
    {
      id: 'welcome',
      role: 'assistant',
      content: '输入你想要的页面，我会先用 image2 生成单张 UI 设计图，再基于这张图生成切图资产，最后用设计图和切图生成 HTML。'
    },
    {
      id: `restored-${entry.id}`,
      role: 'assistant',
      content: `已恢复历史项目：${entry.title || entry.prompt || entry.id}`
    }
  ]
  window.localStorage.setItem(ACTIVE_HISTORY_STORAGE_KEY, entry.id)
}

function startNewImageMakeTask() {
  activeHistoryId.value = ''
  clearGeneratedOutputs()
  assetPlan.value = null
  missingAssetScan.value = null
  designDetailReview.value = null
  assetCount.value = 0
  htmlReviewNotes.value = ''
  error.value = ''
  messages.value = [
    {
      id: 'welcome',
      role: 'assistant',
      content: '已切换到新任务。输入或调整页面描述后，可以生成新的 UI 设计图。'
    }
  ]
  window.localStorage.removeItem(ACTIVE_HISTORY_STORAGE_KEY)
  historySyncStatus.value = historyEntries.value.length ? '已切换到新任务' : ''
}

function loadLocalImageMakeHistory() {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    historyEntries.value = Array.isArray(parsed) ? parsed : []
    historySyncStatus.value = historyEntries.value.length ? '已读取本地历史' : ''
  } catch {
    historyEntries.value = []
    historySyncStatus.value = '本地历史读取失败'
  }
}

function saveLocalImageMakeHistory() {
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyEntries.value.slice(0, 50)))
    if (activeHistoryId.value) {
      window.localStorage.setItem(ACTIVE_HISTORY_STORAGE_KEY, activeHistoryId.value)
    }
  } catch {
    historySyncStatus.value = '本地历史保存失败，可能是浏览器存储空间不足'
  }
}

function mergeHistoryEntries(...groups) {
  const byId = new Map()
  groups.flat().filter(Boolean).forEach((entry) => {
    const id = String(entry.id || '').trim()
    if (!id) return
    const previous = byId.get(id)
    if (!previous || new Date(entry.updatedAt || 0) >= new Date(previous.updatedAt || 0)) {
      byId.set(id, entry)
    }
  })
  return [...byId.values()]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .slice(0, 50)
}

function createHistoryId() {
  if (window.crypto?.randomUUID) return `image-make-${window.crypto.randomUUID()}`
  return `image-make-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function titleFromPrompt(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return '未命名单图项目'
  return text.length > 24 ? `${text.slice(0, 24)}...` : text
}

function formatHistoryTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function historyStageLabel(entry) {
  if (entry?.htmlReady) return 'HTML'
  if (entry?.assetCount) return `${entry.assetCount} 张切图`
  if (entry?.designUrl) return 'UI 设计图'
  return '草稿'
}

function historyContinueLabel(entry) {
  if (entry?.htmlReady) return '继续修改 HTML'
  if (entry?.assetCount) return '继续生成 HTML'
  if (entry?.designUrl) return '继续生成切图'
  return '继续生成 UI'
}

async function runStep(step, task) {
  runningStep.value = step
  error.value = ''
  try {
    await task()
  } catch (err) {
    error.value = err.message
    appendMessage('assistant', `执行失败：${err.message}`)
  } finally {
    runningStep.value = ''
  }
}

function appendMessage(role, content) {
  messages.value = [
    ...messages.value,
    {
      id: `${role}-${Date.now()}-${messages.value.length}`,
      role,
      content
    }
  ].slice(-12)
}

function extractHtml(run) {
  const page = run?.htmlPagesArtifact?.[0]
  if (page?.srcdoc) return sanitizeHtmlSource(page.srcdoc)
  const text = String(run?.reply || '')
  const block = text.match(/```(?:html)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  if (block && looksLikeHtml(block)) return sanitizeHtmlSource(block)
  if (looksLikeHtml(text)) return sanitizeHtmlSource(text)
  return ''
}

function looksLikeHtml(value) {
  return /<!doctype html|<html[\s>]|<body[\s>]|<main[\s>]/i.test(String(value || ''))
}

function sanitizeHtmlSource(value) {
  const html = String(value || '').trim()
  const documentStart = html.search(/<!doctype html|<html[\s>]/i)
  if (documentStart >= 0) return html.slice(documentStart).trim()
  const bodyStart = html.search(/<body[\s>]|<main[\s>]/i)
  if (bodyStart >= 0) return html.slice(bodyStart).trim()
  return html
}

function stripModelReasoning(value) {
  const text = String(value || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  if (!/^<think>/i.test(text)) return text
  const contentStart = text.search(/审核结论|review|conclusion|NO_CHANGES|```html|<!doctype html|<html[\s>]/i)
  return contentStart > 0 ? text.slice(contentStart).trim() : '模型返回了推理内容，但未提取到明确审核结论。'
}

function downloadText(fileName, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 300)
}

function downloadProjectJson() {
  downloadText('image-make-project.json', JSON.stringify(buildProjectJson(createExportSnapshot()), null, 2), 'application/json;charset=utf-8')
}

function downloadHtml() {
  if (!htmlSource.value) return
  downloadText('index.html', htmlSource.value, 'text/html;charset=utf-8')
}

async function exportCompletePackage() {
  if (!hasProjectOutput.value || runningStep.value) return
  await runExportTask('正在打包 HTML 与素材', async () => {
    await ensureExportScreenshot()
    await downloadCompleteProjectPackage(createExportSnapshot())
    exportStatus.value = 'HTML 与素材 ZIP 已生成'
  })
}

async function exportFigmaPackage() {
  if (!hasProjectOutput.value || runningStep.value) return
  await runExportTask('正在生成 Figma 导入包', async () => {
    await ensureExportScreenshot()
    await downloadFigmaImportPackage(createExportSnapshot())
    exportStatus.value = 'Figma 导入包已生成'
  })
}

async function exportExperimentalFig() {
  if (!hasProjectOutput.value || runningStep.value) return
  await runExportTask('正在生成实验 .fig 文件', async () => {
    await ensureExportScreenshot()
    downloadExperimentalFigFile(createExportSnapshot())
    exportStatus.value = '实验 .fig 交接文件已生成'
  })
}

async function runExportTask(status, task) {
  exportStatus.value = status
  error.value = ''
  try {
    await task()
  } catch (err) {
    exportStatus.value = '导出失败'
    error.value = `导出失败：${err.message}`
    appendMessage('assistant', `导出失败：${err.message}`)
  }
}

async function ensureExportScreenshot() {
  if (!htmlSource.value || htmlScreenshotDataUrl.value) return
  htmlScreenshotDataUrl.value = await captureHtmlPreviewScreenshot(htmlSource.value)
}

function createExportSnapshot() {
  return {
    title: currentHistoryTitle.value === '新项目' ? titleFromPrompt(prompt.value) : currentHistoryTitle.value,
    prompt: prompt.value,
    useReferenceImages: useReferenceImages.value,
    referenceImages: referenceImages.value.map((image) => ({
      name: image.name,
      type: image.type,
      size: image.size,
      localUrl: image.localUrl || image.previewSrc || '',
      src: image.src || ''
    })),
    assetPlan: assetPlan.value,
    missingAssetScan: missingAssetScan.value,
    designDetailReview: designDetailReview.value,
    designSpec: designSpec.value,
    design: design.value,
    assets: assets.value,
    html: htmlSource.value,
    htmlScreenshotDataUrl: htmlScreenshotDataUrl.value,
    codeReview: codeReviewText.value,
    visualReview: visualReviewText.value,
    htmlDualReview: htmlDualReview.value,
    htmlReviewNotes: htmlReviewNotes.value,
    generatedAt: new Date().toISOString()
  }
}

onMounted(() => {
  initializeImageMakeHistory()
})
</script>

<template>
  <main class="image-make-main">
    <section class="image-make-hero">
      <div>
        <p class="eyebrow">Image Make</p>
        <h2>单图到切图再到 HTML</h2>
        <p>像 Figma Make 一样用对话驱动：先生成一张 UI 设计图，再生成对应切图，最后把设计图和切图还原成 HTML。</p>
      </div>
      <div class="image-make-export-actions">
        <button class="button button-secondary" type="button" :disabled="!hasProjectOutput || Boolean(runningStep)" @click="downloadProjectJson">
          <FileDown :size="16" />
          项目 JSON
        </button>
        <button class="button button-secondary" type="button" :disabled="!hasProjectOutput || Boolean(runningStep)" @click="exportCompletePackage">
          <FileDown :size="16" />
          HTML 素材包
        </button>
        <button class="button button-primary" type="button" :disabled="!hasProjectOutput || Boolean(runningStep)" @click="exportFigmaPackage">
          <FileDown :size="16" />
          Figma 导入包
        </button>
        <button class="button button-secondary" type="button" :disabled="!hasProjectOutput || Boolean(runningStep)" title="实验导出：Figma 原生 .fig 是非公开格式，此文件用于 OpenPencil/Agent 交接。" @click="exportExperimentalFig">
          <FileDown :size="16" />
          实验 .fig
        </button>
        <small>{{ exportStatus || '导出 HTML、素材、Figma 插件包和实验 .fig' }}</small>
      </div>
    </section>

    <section v-if="error" class="notice notice-error">
      {{ error }}
    </section>

    <section class="image-make-grid">
      <aside class="image-chat-panel">
        <div class="make-panel-head">
          <div>
            <p class="eyebrow">Prompt</p>
            <h2>对话</h2>
          </div>
          <LoaderCircle v-if="runningStep" class="spin" :size="18" />
        </div>

        <div class="image-chat-feed">
          <article v-for="message in messages" :key="message.id" :class="`is-${message.role}`">
            <span>{{ message.role === 'user' ? 'You' : 'Agent' }}</span>
            <p>{{ message.content }}</p>
          </article>
        </div>

        <form class="image-composer" @submit.prevent>
          <label>
            <span>页面描述</span>
            <textarea id="image-make-prompt" v-model="prompt" name="imageMakePrompt" rows="7" />
          </label>

          <section class="reference-upload">
            <div class="reference-upload-head">
              <span>参考图片</span>
              <strong>{{ referenceImages.length }}/10</strong>
            </div>

            <label class="reference-toggle">
              <input id="image-make-use-reference" v-model="useReferenceImages" name="useReferenceImages" type="checkbox" />
              <span>上传的参考图参与本次生成</span>
            </label>

            <label class="upload-dropzone">
              <Upload :size="18" />
              <span>上传图片作为参考</span>
              <small>支持 PNG / JPG / WebP，可多选</small>
              <input id="image-make-reference-upload" name="referenceImages" type="file" accept="image/*" multiple @change="handleImageUpload" />
            </label>

            <div v-if="referenceImages.length" class="reference-image-list">
              <article v-for="image in referenceImages" :key="image.id">
                <button
                  class="reference-thumb-button"
                  type="button"
                  :class="{ 'is-selected': image.id === activeReferenceImage?.id }"
                  title="设为 UI 设计图预览"
                  @click="selectReferenceImage(image.id)"
                >
                  <img :key="image.id" :src="image.previewSrc || image.src" :alt="image.name" />
                </button>
                <div>
                  <strong>{{ image.name }}</strong>
                  <span>{{ Math.ceil(image.size / 1024) }} KB</span>
                  <small v-if="image.localUrl">本地地址：{{ image.localUrl }}</small>
                </div>
                <button class="reference-remove-button" type="button" title="移除参考图" @click="removeReferenceImage(image.id)">
                  <X :size="14" />
                </button>
              </article>
            </div>
          </section>

          <section class="auto-asset-plan">
            <div>
              <span>切图数量</span>
              <strong>{{ assetCountLabel }}</strong>
            </div>
            <p>
              {{
                assetPlan
                  ? assetPlan.reason
                  : '点击生成切图时，Gemini 会先查看 UI 设计图并自动判断需要几张切图。'
              }}
            </p>
          </section>

          <section class="stage-generate-panel" aria-label="分步骤生成控制">
            <div class="stage-generate-head">
              <span>生成控制</span>
              <strong>{{ runningStep ? '执行中' : '可独立重跑' }}</strong>
            </div>

            <button class="button button-secondary" type="button" :disabled="Boolean(runningStep)" @click="startNewImageMakeTask">
              <Sparkles :size="16" />
              新建任务
            </button>

            <button class="button button-primary" type="button" :disabled="!canRunDesign" @click="generateDesign">
              <Send :size="16" />
              {{ runningStep === 'design' ? '生成 UI 设计图中' : design ? '重新生成 UI 设计图' : '生成 UI 设计图' }}
            </button>

            <button class="button button-secondary" type="button" :disabled="!canRunAssets" @click="generateAssets">
              <Layers3 :size="16" />
              {{ runningStep === 'assets' ? 'Gemini 判断并切图中' : assets.length ? '重新生成对应切图' : '生成对应切图' }}
            </button>

            <button class="button button-secondary" type="button" :disabled="!canRunMissingAssets" @click="scanAndGenerateMissingAssets">
              <Sparkles :size="16" />
              {{ runningStep === 'missing-assets' ? '扫描并生成缺失切图中' : '扫描并生成缺失切图' }}
            </button>

            <button class="button button-secondary" type="button" :disabled="!canRunHtml" @click="generateHtml">
              <Code2 :size="16" />
              {{ runningStep === 'html' ? '生成 HTML 页面中' : htmlSource ? '重新生成 HTML 页面' : '生成 HTML 页面' }}
            </button>

            <label class="html-review-notes-field">
              <span>复核修复注意项</span>
              <textarea
                id="image-make-html-review-notes"
                v-model="htmlReviewNotes"
                name="htmlReviewNotes"
                rows="4"
                maxlength="1200"
                placeholder="例如：重点检查顶部状态栏、学生特惠左侧图标、Banner 图片位置、底部导航高度；缺什么切图就标出来。"
              />
              <small>会同时传给 Gemini 3.1 和 GPT-5.5，并在修复 HTML 时再次带上。</small>
            </label>

            <button class="button button-secondary" type="button" :disabled="!canRunHtmlReviewRepair" @click="reviewAndRepairHtml">
              <Sparkles :size="16" />
              {{ runningStep === 'html-repair' ? '双模型复核修复中' : '复核并修复 HTML' }}
            </button>

            <p>各阶段可以独立重跑。重跑 UI 会清空旧切图和 HTML；重跑切图会清空旧 HTML；扫描并生成缺失切图会追加资产并清空旧 HTML；复核修复会对比设计图和 HTML 截图，必要时补切图并重写当前 HTML。</p>
          </section>

          <section class="image-history-panel" aria-label="单图生成历史">
            <div class="image-history-head">
              <div>
                <span>任务历史</span>
                <strong>{{ currentHistoryTitle }}</strong>
              </div>
              <small>{{ historySyncStatus || '本地 + SQLite' }}</small>
            </div>

            <div v-if="historyEntries.length" class="image-history-list">
              <button
                v-for="entry in historyEntries"
                :key="entry.id"
                class="image-history-item"
                type="button"
                :class="{ 'is-active': entry.id === activeHistoryId }"
                @click="restoreImageMakeHistory(entry)"
              >
                <span>{{ entry.title || entry.prompt || '未命名项目' }}</span>
                <small>{{ historyStageLabel(entry) }} · {{ historyContinueLabel(entry) }} · {{ formatHistoryTime(entry.updatedAt || entry.createdAt) }}</small>
              </button>
            </div>
            <p v-else>生成后的 UI、切图和 HTML 会自动保存到本地与 SQLite。点击历史项可切换查看，并直接继续后续阶段。</p>
          </section>
        </form>
      </aside>

      <section class="image-output-panel">
        <article class="pipeline-card">
          <header>
            <div>
              <span class="pipeline-icon"><Image :size="16" /></span>
              <h3>1. UI 设计图</h3>
            </div>
            <a
              v-if="designDownloadUrl"
              class="download-link"
              :href="designDownloadUrl"
              target="_blank"
              rel="noreferrer"
              download
            >
              <Download :size="15" />
              下载
            </a>
            <button v-else class="download-link" type="button" disabled>
              <Download :size="15" />
              下载
            </button>
          </header>

          <div class="single-design-preview">
            <img
              v-if="design?.resultUrl"
              :key="design.id || design.resultUrl"
              :src="design.previewUrl || design.resultUrl"
              :alt="design.purpose"
            />
            <div v-else>
              <Image :size="32" />
              <p>生成后的 UI 设计图会显示在这里。</p>
            </div>
          </div>

          <footer class="design-footer">
            <div>
              <span>{{ design?.fileName || '等待上传或生成' }}</span>
              <small v-if="design?.localUrl">本地地址：{{ design.localUrl }}</small>
            </div>
            <strong>{{ designStatusLabel }}</strong>
          </footer>
        </article>

        <article class="pipeline-card">
          <header>
            <div>
              <span class="pipeline-icon"><Sparkles :size="16" /></span>
              <h3>2. 对应切图</h3>
            </div>
            <button
              class="download-link"
              type="button"
              :disabled="!assets.length"
              @click="downloadText('asset-map.json', JSON.stringify({ assets }, null, 2), 'application/json;charset=utf-8')"
            >
              <Download :size="15" />
              下载
            </button>
          </header>

          <div class="pipeline-actions">
            <span>{{ runningStep === 'missing-assets' ? '补切图中' : runningStep === 'assets' ? '生成中' : '切图状态' }}</span>
            <span>{{ successfulAssets.length }}/{{ assets.length || assetPlan?.count || '自动' }} 张</span>
          </div>

          <div v-if="missingAssetScan" class="missing-asset-scan">
            <div>
              <strong>细节扫描 + GPT 小图标审核</strong>
              <span>补充 {{ missingAssetScan.assets?.length || 0 }} 张</span>
            </div>
            <p>{{ missingAssetScan.coverageSummary || missingAssetScan.reason }}</p>
            <ul v-if="missingAssetScan.assets?.length">
              <li v-for="asset in missingAssetScan.assets.slice(0, 6)" :key="asset.fileName">
                {{ asset.fileName }} · {{ asset.purpose }}
              </li>
            </ul>
          </div>

          <div class="single-asset-grid">
            <article v-for="asset in assets" :key="asset.id">
              <img v-if="asset.resultUrl" :src="asset.resultUrl" :alt="asset.purpose" />
              <div v-else>{{ asset.fileName }}</div>
              <footer>
                <strong>{{ asset.fileName }}</strong>
                <span>{{ asset.status === 'success' ? '已生成' : asset.status === 'failed' ? '失败' : '待生成' }}</span>
                <p v-if="asset.error" class="asset-error" :title="asset.error">{{ asset.error }}</p>
                <a v-if="asset.resultUrl" :href="asset.resultUrl" target="_blank" rel="noreferrer" download>下载</a>
              </footer>
            </article>
            <div v-if="!assets.length" class="empty-output">
              <Sparkles :size="28" />
              <p>基于设计图生成的切图会显示在这里。</p>
            </div>
          </div>
        </article>

        <article class="pipeline-card html-card">
          <header>
            <div>
              <span class="pipeline-icon"><Code2 :size="16" /></span>
              <h3>3. HTML 页面</h3>
            </div>
            <button class="download-link" type="button" :disabled="!htmlSource" @click="downloadHtml">
              <Download :size="15" />
              下载
            </button>
          </header>

          <div class="pipeline-actions">
            <span>{{ runningStep === 'html-review-assets' ? '补齐切图中' : runningStep === 'html-repair' ? '复核修复中' : runningStep === 'html' ? '闭环执行中' : '页面状态' }}</span>
            <span>{{ htmlPipelineStatus || (htmlSource ? '可预览' : '等待生成') }}</span>
          </div>

          <div v-if="designDetailReview || designSpec || codeReviewText || visualReviewText || htmlDualReview || htmlScreenshotDataUrl" class="html-review-stack">
            <article v-if="designDetailReview">
              <strong>Gemini 设计图复核</strong>
              <p>{{ designDetailReview.visualSummary || designDetailReview.viewportEvidence || '已复核设计图比例、区块顺序、视觉资产边界和 HTML 还原锚点。' }}</p>
            </article>
            <article v-if="designSpec">
              <strong>Gemini 设计规格</strong>
              <p>{{ designSpec.visualSummary || designSpec.raw || '已提取布局、颜色、字号、间距和组件规格。' }}</p>
            </article>
            <article v-if="codeReviewText">
              <strong>GPT-5.5 代码审核</strong>
              <p>{{ codeReviewText.slice(0, 220) }}</p>
            </article>
            <article v-if="visualReviewText">
              <strong>Gemini 最终截图审核</strong>
              <p>{{ visualReviewText.slice(0, 320) }}</p>
            </article>
            <article v-if="htmlDualReview">
              <strong>Gemini + GPT-5.5 双模型复核</strong>
              <p>
                {{
                  buildHtmlDualReviewDisplayText(htmlDualReview.finalPass || htmlDualReview.firstPass).slice(0, 360)
                }}
              </p>
            </article>
            <article v-if="htmlReviewSectionScans.length" class="html-section-scan-card">
              <div class="html-review-card-head">
                <strong>逐段扫描与重对齐</strong>
                <span>{{ htmlReviewSectionScans.length }} 段</span>
              </div>
              <div class="html-section-scan-list">
                <section v-for="section in htmlReviewSectionScans.slice(0, 10)" :key="section.id || section.section">
                  <header>
                    <strong>{{ section.section }}</strong>
                    <span>{{ section.alignmentScore ? `${section.alignmentScore} 分` : '待评分' }}</span>
                  </header>
                  <p v-if="section.designEvidence || section.htmlEvidence">
                    {{ section.designEvidence || '设计图证据待补充' }} / {{ section.htmlEvidence || 'HTML 截图证据待补充' }}
                  </p>
                  <p v-if="section.assetAlignment">切图对齐：{{ section.assetAlignment }}</p>
                  <ul v-if="section.issues?.length">
                    <li v-for="issue in section.issues.slice(0, 3)" :key="`${section.section}-${issue.issue}`">
                      {{ issue.severity }} · {{ issue.issue }}{{ issue.fixHint ? `；${issue.fixHint}` : '' }}
                    </li>
                  </ul>
                  <div v-if="section.missingAssets?.length" class="html-section-missing-assets">
                    <button
                      v-for="asset in section.missingAssets.slice(0, 4)"
                      :key="`${section.section}-${asset.fileName}`"
                      type="button"
                      :disabled="runningStep || isHtmlReviewMissingAssetGenerated(asset)"
                      @click="generateHtmlReviewMissingAssets(asset)"
                    >
                      {{ isHtmlReviewMissingAssetGenerated(asset) ? '已补齐' : '补齐' }} {{ asset.fileName }}
                    </button>
                  </div>
                </section>
              </div>
            </article>
            <article v-if="activeHtmlReview?.missingAssetPlan?.assets?.length" class="html-missing-assets-card">
              <div class="html-review-card-head">
                <strong>缺失切图候选</strong>
                <span>待补齐 {{ htmlReviewPendingMissingAssets.length }}/{{ activeHtmlReview.missingAssetPlan.assets.length }}</span>
              </div>
              <p>{{ activeHtmlReview.missingAssetPlan.coverageSummary || activeHtmlReview.missingAssetPlan.reason || '逐段扫描发现这些切图会影响 HTML 还原质量。' }}</p>
              <div class="html-missing-asset-list">
                <button
                  v-for="asset in activeHtmlReview.missingAssetPlan.assets.slice(0, 12)"
                  :key="asset.fileName"
                  type="button"
                  :class="{ 'is-generated': isHtmlReviewMissingAssetGenerated(asset) }"
                  :disabled="runningStep || isHtmlReviewMissingAssetGenerated(asset)"
                  @click="generateHtmlReviewMissingAssets(asset)"
                >
                  <strong>{{ asset.fileName }}</strong>
                  <span>{{ isHtmlReviewMissingAssetGenerated(asset) ? '已在 asset-map' : asset.purpose }}</span>
                </button>
              </div>
              <button
                class="html-review-generate-button"
                type="button"
                :disabled="!canGenerateHtmlReviewMissingAssets"
                @click="generateHtmlReviewMissingAssets()"
              >
                <Sparkles :size="14" />
                {{ runningStep === 'html-review-assets' ? '补齐切图中' : '补齐全部缺失切图' }}
              </button>
            </article>
            <article v-if="htmlScreenshotDataUrl">
              <strong>最终效果截图</strong>
              <img :src="htmlScreenshotDataUrl" alt="最终 HTML 效果截图" />
            </article>
          </div>

          <div class="html-live-preview">
            <iframe
              v-if="htmlSource"
              title="生成 HTML 预览"
              :srcdoc="htmlSource"
              sandbox=""
              referrerpolicy="no-referrer"
            />
            <div v-else class="empty-output">
              <Code2 :size="28" />
              <p>生成后的 HTML 会在这里实时预览。</p>
            </div>
          </div>
        </article>
      </section>
    </section>
  </main>
</template>
