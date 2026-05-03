<script setup>
import { computed, onMounted, ref } from 'vue'
import { getDocument, getWorkflow, runAgent } from '../services/api'
import { loadAgentRuntimeSettings, runBrowserAgent } from '../services/agentRuntime'
import MakeChat from '../components/make/MakeChat.vue'
import AgentRunProcess from '../components/make/AgentRunProcess.vue'
import EffectCanvas from '../components/make/EffectCanvas.vue'

const loading = ref(true)
const error = ref('')
const workflow = ref(null)
const selectedStageId = ref('stage-3')
const messages = ref([
  {
    id: 'welcome',
    role: 'assistant',
    content: '告诉我你想从哪个阶段开始。我可以帮你生成 UI 设计稿提示词、图生图切图提示词，或者把设计稿转成 HTML/Vue 实现任务。'
  }
])
const runs = ref([])
const running = ref(false)
const processCollapsed = ref(false)
const focusedCanvasRunId = ref('')

const stages = computed(() => workflow.value?.stages || [])
const documents = computed(() => workflow.value?.documents || [])
const selectedStage = computed(() => {
  return stages.value.find((stage) => stage.id === selectedStageId.value) || stages.value[0]
})
const latestRun = computed(() => runs.value[0] || null)

async function loadWorkflow() {
  loading.value = true
  error.value = ''
  try {
    workflow.value = await getWorkflow()
    if (!stages.value.find((stage) => stage.id === selectedStageId.value)) {
      selectedStageId.value = stages.value[0]?.id || ''
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function submitChat(payload) {
  if (!payload.message?.trim()) return

  const messageForAgent = withAssetBatchInstruction(
    withDesignBatchInstruction(payload.message, payload.designBatch),
    payload.assetBatch
  )
  const userMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    content: describeBatchMessage(payload.message, payload.designBatch, payload.assetBatch)
  }
  messages.value = [...messages.value, userMessage]
  running.value = true
  error.value = ''

  try {
    const request = {
      stageId: payload.stageId,
      agentType: payload.agentType === 'auto' ? '' : payload.agentType,
      message: messageForAgent,
      documentSlugs: relatedDocuments(payload.stageId).map((document) => document.slug),
      designBatch: payload.designBatch || null,
      assetBatch: payload.assetBatch || null
    }
    const runtimeSettings = loadAgentRuntimeSettings()
    const stage = stages.value.find((item) => item.id === payload.stageId) || selectedStage.value
    const run = runtimeSettings.browserDirectEnabled
      ? await runBrowserAgent({
        request,
        stage,
        documents: await loadRelatedDocuments(payload.stageId),
        settings: runtimeSettings
      })
      : await runAgent(request)

    runs.value = [run, ...runs.value].slice(0, 12)
    focusedCanvasRunId.value = run.id
    messages.value = [
      ...messages.value,
      {
        id: run.id,
        role: 'assistant',
        content: run.modelRun
          ? `${run.agent.name} 已通过 ${run.modelRun.configName} 在 Web 端完成执行，结果已进入画布。`
          : `${run.agent.name} 已生成执行方案。${run.reply}`
      }
    ]
  } catch (err) {
    error.value = err.message
    messages.value = [
      ...messages.value,
      {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `执行失败：${err.message}`
      }
    ]
  } finally {
    running.value = false
  }
}

function describeBatchMessage(message, designBatch, assetBatch) {
  const lines = [message]
  if (designBatch) lines.push('', `设计稿配置：${describeDesignBatch(designBatch)}`)
  if (assetBatch) lines.push('', `切图配置：${describeAssetBatch(assetBatch)}`)
  return lines.join('\n')
}

function describeDesignBatch(designBatch) {
  if (!designBatch) return ''
  const count = Math.max(1, Math.min(24, Number(designBatch.count || designBatch.maxCount) || 1))
  if (designBatch.mode === 'free') {
    return `自由规划，最多 ${count} 张`
  }
  return `固定 ${count} 张`
}

function describeAssetBatch(assetBatch) {
  if (!assetBatch) return ''
  const count = Math.max(1, Math.min(24, Number(assetBatch.count || assetBatch.maxCount) || 1))
  if (assetBatch.mode === 'free') {
    return `自由规划，最多 ${count} 张`
  }
  return `固定 ${count} 张`
}

function withDesignBatchInstruction(message, designBatch) {
  if (!designBatch) return message
  const count = Math.max(1, Math.min(24, Number(designBatch.count || designBatch.maxCount) || 1))
  const quantityLine = designBatch.mode === 'free'
    ? `由 Agent 根据页面复杂度自由规划 UI 设计稿数量，最多 ${count} 张。`
    : `严格生成 ${count} 张 UI 设计稿。`

  return [
    message,
    '',
    'UI 设计稿批量生成配置：',
    `- 生成模式：${designBatch.mode === 'free' ? '自由规划数量' : '固定张数'}`,
    `- 数量要求：${quantityLine}`,
    '- 每张设计稿必须包含：designId、页面/视口名称、文件名、推荐尺寸、image2 文生图提示词、验收重点和后续 Gemini 审图说明。',
    '- 设计稿是整页 UI 画面，可以包含真实可读中文文案、导航、卡片、表单和业务状态；不要生成设备外壳、透视图或营销海报。'
  ].join('\n')
}

function withAssetBatchInstruction(message, assetBatch) {
  if (!assetBatch) return message
  const count = Math.max(1, Math.min(24, Number(assetBatch.count || assetBatch.maxCount) || 1))
  const quantityLine = assetBatch.mode === 'free'
    ? `由 Agent 根据页面复杂度自由规划切图数量，最多 ${count} 张。`
    : `严格生成 ${count} 张切图。`

  return [
    message,
    '',
    '切图批量生成配置：',
    `- 生成模式：${assetBatch.mode === 'free' ? '自由规划数量' : '固定张数'}`,
    `- 数量要求：${quantityLine}`,
    '- 每张切图必须包含：assetId、文件名、用途、推荐尺寸、是否透明背景、image2 图生图提示词、alt 文案、Web 引用路径。',
    '- 只切复杂视觉资产，例如 Hero 插画、产品图、地图/配送轨迹、空状态、品牌氛围图；文字、按钮、表单、导航、价格标签必须由 HTML/CSS 实现。'
  ].join('\n')
}

function relatedDocuments(stageId) {
  return documents.value.filter((document) => document.stageIds?.includes(stageId))
}

async function loadRelatedDocuments(stageId) {
  const related = relatedDocuments(stageId)
  return Promise.all(
    related.map(async (document) => {
      if (document.content) return document
      try {
        return await getDocument(document.slug)
      } catch {
        return document
      }
    })
  )
}

async function loadGeneratedProjectFromQuery() {
  if (typeof window === 'undefined') return
  const projectSlug = new URLSearchParams(window.location.search).get('project')
  if (!projectSlug) return
  await loadGeneratedProject(projectSlug)
}

async function loadGeneratedProject(projectSlug) {
  const safeSlug = sanitizeProjectSlug(projectSlug)
  if (!safeSlug) {
    throw new Error('生成项目路径不合法')
  }

  const basePath = `/generated/${safeSlug}`
  const response = await fetch(`${basePath}/manifest.json`, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`未找到生成项目：${safeSlug}`)
  }

  const manifest = await response.json()
  const hydratedRuns = await hydrateGeneratedRuns(manifest.runs || [], basePath)
  if (!hydratedRuns.length) return

  runs.value = hydratedRuns
  focusedCanvasRunId.value = manifest.focusedRunId || hydratedRuns[0].id
  selectedStageId.value = hydratedRuns.find((run) => run.id === focusedCanvasRunId.value)?.stageId || hydratedRuns[0].stageId
  messages.value = [
    ...messages.value,
    {
      id: `generated-project-${safeSlug}`,
      role: 'assistant',
      content: `已加载真实生成项目「${manifest.title || safeSlug}」：${manifest.summary || '生成结果已进入画布。'}`
    }
  ]
}

async function hydrateGeneratedRuns(rawRuns, basePath) {
  return Promise.all(rawRuns.map((run, index) => hydrateGeneratedRun(run, index, basePath)))
}

async function hydrateGeneratedRun(run, index, basePath) {
  const htmlPagesArtifact = Array.isArray(run.htmlPagesArtifact)
    ? await Promise.all(run.htmlPagesArtifact.map((page, pageIndex) => hydrateGeneratedPage(page, pageIndex, basePath)))
    : []

  return {
    id: run.id || `generated-run-${index + 1}`,
    createdAt: run.createdAt || new Date().toISOString(),
    stageID: run.stageID || run.stageId || 'stage-7',
    stageId: run.stageId || run.stageID || 'stage-7',
    stageTitle: run.stageTitle || 'HTML/CSS/JS 还原页面',
    agent: run.agent || {
      type: 'code-restore-agent',
      name: '图生 HTML 还原 Agent',
      description: '根据生成项目文件加载多页面 HTML。',
      mode: 'image-to-html'
    },
    reply: run.reply || '',
    handoffPrompt: run.handoffPrompt || '',
    requiredInputs: run.requiredInputs || [],
    expectedOutputs: run.expectedOutputs || [],
    checklist: run.checklist || [],
    nextActions: run.nextActions || [],
    suggestedStatus: run.suggestedStatus || 'active',
    relatedDocuments: run.relatedDocuments || [],
    designArtifact: run.designArtifact || null,
    specArtifact: run.specArtifact || null,
    designBatchArtifact: run.designBatchArtifact || null,
    assetBatchArtifact: run.assetBatchArtifact || null,
    productArtifact: run.productArtifact || null,
    qaArtifact: run.qaArtifact || null,
    htmlArtifact: run.htmlArtifact || htmlPagesArtifact[0]?.srcdoc || '',
    htmlPagesArtifact
  }
}

async function hydrateGeneratedPage(page, index, basePath) {
  const srcdoc = page.srcdoc || (page.srcdocPath ? await fetchGeneratedText(basePath, page.srcdocPath) : '')
  return {
    id: page.id || `page-${index + 1}`,
    title: page.title || `页面 ${index + 1}`,
    route: page.route || `/${index + 1}`,
    viewport: page.viewport || 'desktop',
    srcdoc
  }
}

async function fetchGeneratedText(basePath, relativePath) {
  const normalizedPath = String(relativePath || '').replace(/^\/+/, '')
  if (!normalizedPath || normalizedPath.includes('..')) {
    throw new Error(`生成页面路径不合法：${relativePath}`)
  }
  const response = await fetch(`${basePath}/${normalizedPath}`, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`生成页面加载失败：${relativePath}`)
  }
  return response.text()
}

function sanitizeProjectSlug(value) {
  const slug = String(value || '').trim()
  return /^[a-z0-9][a-z0-9-_/]*$/i.test(slug) && !slug.includes('..') ? slug : ''
}

onMounted(async () => {
  await loadWorkflow()
  try {
    await loadGeneratedProjectFromQuery()
  } catch (err) {
    error.value = err.message
  }
})
</script>

<template>
  <main class="make-main">
    <section v-if="error" class="notice notice-error">
      {{ error }}
    </section>

    <section v-if="loading" class="loading-state">
      <div class="loading-bar" />
      <p>正在载入 Make 工作台...</p>
    </section>

    <section v-else class="make-grid" :class="{ 'is-process-collapsed': processCollapsed }">
      <MakeChat
        v-model:selected-stage-id="selectedStageId"
        :stages="stages"
        :messages="messages"
        :loading="running"
        @submit="submitChat"
      />

      <EffectCanvas
        :selected-stage="selectedStage"
        :latest-run="latestRun"
        :runs="runs"
        :focused-run-id="focusedCanvasRunId"
        :loading="running"
      />

      <AgentRunProcess
        :stages="stages"
        :selected-stage="selectedStage"
        :runs="runs"
        :loading="running"
        :collapsed="processCollapsed"
        @update:collapsed="processCollapsed = $event"
      />
    </section>
  </main>
</template>
