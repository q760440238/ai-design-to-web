<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Clipboard, Monitor, PanelRight, Smartphone } from 'lucide-vue-next'
import { DESIGN_LINT_RULES, artifactManifestForRun } from '../../services/workflowOptimizations'

const props = defineProps({
  selectedStage: {
    type: Object,
    default: null
  },
  latestRun: {
    type: Object,
    default: null
  },
  runs: {
    type: Array,
    default: () => []
  },
  focusedRunId: {
    type: String,
    default: ''
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const activeViewport = ref('desktop')
const copied = ref(false)
const selectedRunId = ref('')
const draggingNode = ref(null)
const draggingHtmlPage = ref(null)
const selectedHtmlPageId = ref('')
const nodePositions = reactive({})
const htmlPagePositions = reactive({})
const nodeWidth = 156
const nodeHeight = 62
const htmlFrameWidth = computed(() => (activeViewport.value === 'mobile' ? 390 : 430))
const htmlFrameHeight = computed(() => (activeViewport.value === 'mobile' ? 844 : 640))

const orderedRuns = computed(() => [...props.runs].reverse())
const displayRun = computed(() => {
  return props.runs.find((run) => run.id === selectedRunId.value) || props.latestRun
})
const canvasMode = computed(() => displayRun.value?.agent?.mode || 'waiting')
const mediaResult = computed(() => displayRun.value?.mediaResult || null)
const designArtifact = computed(() => displayRun.value?.designArtifact || null)
const designBatchArtifact = computed(() => displayRun.value?.designBatchArtifact || null)
const htmlArtifact = computed(() => displayRun.value?.htmlArtifact || '')
const htmlPagesArtifact = computed(() => normalizeHtmlPages(displayRun.value))
const assetBatchArtifact = computed(() => displayRun.value?.assetBatchArtifact || null)
const specArtifact = computed(() => displayRun.value?.specArtifact || null)
const productArtifact = computed(() => displayRun.value?.productArtifact || null)
const qaArtifact = computed(() => displayRun.value?.qaArtifact || null)
const artifactManifest = computed(() => artifactManifestForRun(displayRun.value))
const canvasTitle = computed(() => {
  if (!displayRun.value) return '等待生成'
  if (canvasMode.value === 'text-to-image') return 'UI 设计稿画布'
  if (canvasMode.value === 'image-to-image') return '切图资产画布'
  if (canvasMode.value === 'image-to-html') return 'Web 页面画布'
  if (canvasMode.value === 'image-compare') return '视觉验收画布'
  return '执行结果画布'
})
const historyLinks = computed(() => {
  return orderedRuns.value.slice(1).map((run, index) => {
    const previous = orderedRuns.value[index]
    const from = positionFor(previous.id)
    const to = positionFor(run.id)
    return {
      id: `${previous.id}-${run.id}`,
      x1: from.x + nodeWidth,
      y1: from.y + nodeHeight / 2,
      x2: to.x,
      y2: to.y + nodeHeight / 2
    }
  })
})
const htmlPageLinks = computed(() => {
  return htmlPagesArtifact.value.slice(1).map((page, index) => {
    const previous = htmlPagesArtifact.value[index]
    const from = htmlPagePositionFor(previous.id)
    const to = htmlPagePositionFor(page.id)
    return {
      id: `${previous.id}-${page.id}`,
      x1: from.x + htmlFrameWidth.value,
      y1: from.y + 52,
      x2: to.x,
      y2: to.y + 52
    }
  })
})
const htmlBoardSize = computed(() => {
  const positions = htmlPagesArtifact.value.map((page) => htmlPagePositionFor(page.id))
  const maxX = Math.max(1320, ...positions.map((position) => position.x + htmlFrameWidth.value + 64))
  const maxY = Math.max(900, ...positions.map((position) => position.y + htmlFrameHeight.value + 64))
  return { width: maxX, height: maxY }
})

watch(
  () => [props.focusedRunId, props.latestRun?.id],
  ([focusedRunId, latestRunId]) => {
    const nextId = focusedRunId || latestRunId
    if (nextId) selectedRunId.value = nextId
  },
  { immediate: true }
)

watch(
  orderedRuns,
  (items) => {
    items.forEach((run, index) => {
      if (!nodePositions[run.id]) {
        nodePositions[run.id] = {
          x: 24 + index * 172,
          y: index % 2 === 0 ? 24 : 100
        }
      }
    })
  },
  { immediate: true }
)

watch(
  htmlPagesArtifact,
  (pages) => {
    pages.forEach((page, index) => {
      if (!htmlPagePositions[page.id]) {
        htmlPagePositions[page.id] = {
          x: 26 + index * (htmlFrameWidth.value + 44),
          y: index % 2 === 0 ? 28 : 86
        }
      }
    })
    if (pages.length && !pages.some((page) => page.id === selectedHtmlPageId.value)) {
      selectedHtmlPageId.value = pages[0].id
    }
  },
  { immediate: true }
)

async function copyPrompt() {
  if (!displayRun.value?.handoffPrompt) return
  await navigator.clipboard.writeText(displayRun.value.handoffPrompt)
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1400)
}

function positionFor(runId) {
  return nodePositions[runId] || { x: 24, y: 24 }
}

function selectRun(run) {
  selectedRunId.value = run.id
}

function startNodeDrag(event, run) {
  selectRun(run)
  const position = positionFor(run.id)
  draggingNode.value = {
    id: run.id,
    startX: event.clientX,
    startY: event.clientY,
    originX: position.x,
    originY: position.y
  }
  try {
    event.currentTarget.setPointerCapture?.(event.pointerId)
  } catch {
    // Synthetic pointer events in automated checks may not have an active pointer.
  }
}

function moveNode(event) {
  if (!draggingNode.value) return
  const nextX = draggingNode.value.originX + event.clientX - draggingNode.value.startX
  const nextY = draggingNode.value.originY + event.clientY - draggingNode.value.startY
  nodePositions[draggingNode.value.id] = {
    x: Math.max(8, Math.min(820, nextX)),
    y: Math.max(8, Math.min(142, nextY))
  }
}

function stopNodeDrag() {
  draggingNode.value = null
}

function normalizeHtmlPages(run) {
  if (!run) return []
  if (Array.isArray(run.htmlPagesArtifact) && run.htmlPagesArtifact.length) {
    return run.htmlPagesArtifact.map((page, index) => ({
      id: page.id || `html-page-${index + 1}`,
      title: page.title || `Page ${index + 1}`,
      route: page.route || `/${index + 1}`,
      srcdoc: page.srcdoc || page.html || '',
      viewport: page.viewport || 'desktop'
    })).filter((page) => page.srcdoc)
  }
  if (run.htmlArtifact) {
    return [
      {
        id: `${run.id || 'run'}-html-page`,
        title: 'HTML 页面',
        route: '/',
        srcdoc: run.htmlArtifact,
        viewport: 'desktop'
      }
    ]
  }
  return []
}

function htmlPagePositionFor(pageId) {
  return htmlPagePositions[pageId] || { x: 26, y: 28 }
}

function selectHtmlPage(page) {
  selectedHtmlPageId.value = page.id
}

function startHtmlPageDrag(event, page) {
  selectHtmlPage(page)
  const position = htmlPagePositionFor(page.id)
  draggingHtmlPage.value = {
    id: page.id,
    startX: event.clientX,
    startY: event.clientY,
    originX: position.x,
    originY: position.y
  }
  try {
    event.currentTarget.setPointerCapture?.(event.pointerId)
  } catch {
    // Synthetic pointer events in automated checks may not have an active pointer.
  }
}

function moveHtmlPage(event) {
  if (!draggingHtmlPage.value) return
  const nextX = draggingHtmlPage.value.originX + event.clientX - draggingHtmlPage.value.startX
  const nextY = draggingHtmlPage.value.originY + event.clientY - draggingHtmlPage.value.startY
  htmlPagePositions[draggingHtmlPage.value.id] = {
    x: Math.max(10, Math.min(2200, nextX)),
    y: Math.max(10, Math.min(1300, nextY))
  }
}

function stopHtmlPageDrag() {
  draggingHtmlPage.value = null
}
</script>

<template>
  <section class="make-panel canvas-panel">
    <div class="canvas-toolbar">
      <div>
        <p class="eyebrow">Canvas</p>
        <h2>{{ canvasTitle }}</h2>
      </div>

      <div class="canvas-actions">
        <button
          class="icon-button"
          :class="{ 'is-active': activeViewport === 'desktop' }"
          type="button"
          title="Desktop"
          @click="activeViewport = 'desktop'"
        >
          <Monitor :size="16" />
        </button>
        <button
          class="icon-button"
          :class="{ 'is-active': activeViewport === 'mobile' }"
          type="button"
          title="Mobile"
          @click="activeViewport = 'mobile'"
        >
          <Smartphone :size="16" />
        </button>
        <button class="icon-button" type="button" title="复制 Prompt" @click="copyPrompt">
          <Clipboard :size="16" />
          <span>{{ copied ? '已复制' : '复制' }}</span>
        </button>
      </div>
    </div>

    <div class="canvas-surface">
      <div
        v-if="orderedRuns.length"
        class="history-canvas"
        @pointermove="moveNode"
        @pointerup="stopNodeDrag"
        @pointercancel="stopNodeDrag"
      >
        <svg class="history-links" aria-hidden="true">
          <line
            v-for="link in historyLinks"
            :key="link.id"
            :x1="link.x1"
            :y1="link.y1"
            :x2="link.x2"
            :y2="link.y2"
          />
        </svg>
        <button
          v-for="run in orderedRuns"
          :key="run.id"
          class="history-node"
          :class="{ 'is-selected': displayRun?.id === run.id }"
          :style="{ transform: `translate(${positionFor(run.id).x}px, ${positionFor(run.id).y}px)` }"
          type="button"
          @click="selectRun(run)"
          @pointerdown="startNodeDrag($event, run)"
          @pointermove="moveNode"
          @pointerup="stopNodeDrag"
          @pointercancel="stopNodeDrag"
        >
          <span>{{ run.agent.mode }}</span>
          <strong>{{ run.agent.name }}</strong>
        </button>
      </div>

      <div v-if="!displayRun" class="canvas-empty">
        <PanelRight :size="34" />
        <h3>从对话开始</h3>
        <p>左侧发送指令后，这里会预览设计稿、切图资产、图生 HTML 页面或 QA 结果。</p>
      </div>

      <div
        v-else
        class="generated-frame"
        :class="[`viewport-${activeViewport}`, { 'is-multi-html': htmlPagesArtifact.length }]"
      >
        <div class="frame-topbar">
          <span />
          <span />
          <span />
          <strong>{{ displayRun.agent.name }}</strong>
        </div>

        <div v-if="designBatchArtifact" class="design-batch-preview">
          <header class="asset-batch-head">
            <div>
              <h3>整套 UI 设计稿</h3>
              <p>{{ designBatchArtifact.summary }}</p>
            </div>
            <strong>
              {{ designBatchArtifact.generatedCount || designBatchArtifact.designs?.length || 0 }}
              /
              {{ designBatchArtifact.requestedCount || designBatchArtifact.designs?.length || 0 }}
              张
            </strong>
          </header>

          <div class="design-batch-grid">
            <article v-for="design in designBatchArtifact.designs" :key="design.id" class="design-card">
              <div class="design-thumb">
                <img v-if="design.resultUrl" :src="design.resultUrl" :alt="design.purpose" />
                <span v-else>{{ design.fileName }}</span>
              </div>
              <footer class="design-meta">
                <div>
                  <strong>{{ design.fileName }}</strong>
                  <p>{{ design.purpose }}</p>
                </div>
                <div>
                  <span>{{ design.viewport || 'ui' }}</span>
                  <span>{{ design.imageSize || design.size }}</span>
                  <span :class="`asset-status is-${design.status || 'planned'}`">
                    {{ design.status === 'success' ? '已生成' : design.status === 'failed' ? '失败' : '待生成' }}
                  </span>
                </div>
                <a v-if="design.resultUrl" :href="design.resultUrl" target="_blank" rel="noreferrer">
                  打开原图
                </a>
              </footer>
            </article>
          </div>
        </div>

        <div v-else-if="assetBatchArtifact" class="asset-batch-preview">
          <header class="asset-batch-head">
            <div>
              <h3>整套切图资产</h3>
              <p>{{ assetBatchArtifact.summary }}</p>
            </div>
            <strong>
              {{ assetBatchArtifact.generatedCount || assetBatchArtifact.assets?.length || 0 }}
              /
              {{ assetBatchArtifact.requestedCount || assetBatchArtifact.assets?.length || 0 }}
              张
            </strong>
          </header>

          <div class="asset-batch-grid">
            <article v-for="asset in assetBatchArtifact.assets" :key="asset.id" class="asset-card">
              <div class="asset-thumb">
                <img v-if="asset.resultUrl" :src="asset.resultUrl" :alt="asset.purpose" />
                <span v-else>{{ asset.fileName }}</span>
              </div>
              <div class="asset-meta">
                <strong>{{ asset.fileName }}</strong>
                <p>{{ asset.purpose }}</p>
                <div>
                  <span>{{ asset.size }}</span>
                  <span>{{ asset.transparent ? '透明背景' : '常规背景' }}</span>
                  <span :class="`asset-status is-${asset.status || 'planned'}`">
                    {{ asset.status === 'success' ? '已生成' : asset.status === 'failed' ? '失败' : '待生成' }}
                  </span>
                </div>
              </div>
            </article>
          </div>
        </div>

        <div v-else-if="mediaResult?.resultUrl" class="media-result-preview">
          <img :src="mediaResult.resultUrl" alt="模型生成结果" />
          <footer>
            <span>{{ mediaResult.resultType || 'image' }}</span>
            <strong>{{ mediaResult.progress || '100%' }}</strong>
          </footer>
        </div>

        <div
          v-else-if="htmlPagesArtifact.length"
          class="multi-html-preview"
          @pointermove="moveHtmlPage"
          @pointerup="stopHtmlPageDrag"
          @pointercancel="stopHtmlPageDrag"
        >
          <div
            class="multi-html-board"
            :style="{ width: `${htmlBoardSize.width}px`, height: `${htmlBoardSize.height}px` }"
          >
            <svg class="multi-html-links" aria-hidden="true">
              <line
                v-for="link in htmlPageLinks"
                :key="link.id"
                :x1="link.x1"
                :y1="link.y1"
                :x2="link.x2"
                :y2="link.y2"
              />
            </svg>

            <article
              v-for="page in htmlPagesArtifact"
              :key="page.id"
              class="html-page-frame"
              :class="{ 'is-selected': selectedHtmlPageId === page.id }"
              :style="{
                width: `${htmlFrameWidth}px`,
                height: `${htmlFrameHeight}px`,
                transform: `translate(${htmlPagePositionFor(page.id).x}px, ${htmlPagePositionFor(page.id).y}px)`
              }"
            >
              <header
                class="html-page-frame-head"
                @click="selectHtmlPage(page)"
                @pointerdown="startHtmlPageDrag($event, page)"
                @pointermove="moveHtmlPage"
                @pointerup="stopHtmlPageDrag"
                @pointercancel="stopHtmlPageDrag"
              >
                <div>
                  <strong>{{ page.title }}</strong>
                  <span>{{ page.route }}</span>
                </div>
                <small>{{ activeViewport }}</small>
              </header>
              <iframe
                :title="page.title"
                :srcdoc="page.srcdoc"
                sandbox=""
                referrerpolicy="no-referrer"
              />
            </article>
          </div>
        </div>

        <div v-else-if="designArtifact" class="generated-design-preview">
          <section class="design-artifact-hero">
            <div>
              <p>{{ designArtifact.brand }}</p>
              <h3>{{ designArtifact.tagline }}</h3>
            </div>
            <div class="design-artifact-palette">
              <span
                v-for="color in designArtifact.palette"
                :key="color"
                :style="{ background: color }"
              />
            </div>
          </section>
          <section class="design-artifact-section-grid">
            <article v-for="section in designArtifact.sections" :key="section.title">
              <strong>{{ section.title }}</strong>
              <p>{{ section.text }}</p>
            </article>
          </section>
          <section class="design-artifact-product-grid">
            <article v-for="product in designArtifact.products" :key="product.name">
              <div />
              <strong>{{ product.name }}</strong>
              <span>{{ product.price }}</span>
              <small>{{ product.tag }}</small>
            </article>
          </section>
        </div>

        <div v-else-if="specArtifact" class="artifact-summary-preview">
          <h3>结构化设计规格</h3>
          <div>
            <span v-for="section in specArtifact.sections" :key="section">{{ section }}</span>
          </div>
          <h3>Token</h3>
          <div>
            <span v-for="token in specArtifact.tokens" :key="token">{{ token }}</span>
          </div>
        </div>

        <div v-else-if="productArtifact" class="artifact-summary-preview">
          <h3>目标用户</h3>
          <p>{{ productArtifact.audience }}</p>
          <h3>P0 页面</h3>
          <div>
            <span v-for="page in productArtifact.p0Pages" :key="page">{{ page }}</span>
          </div>
        </div>

        <div v-else-if="qaArtifact" class="artifact-summary-preview">
          <h3>视觉 QA · {{ qaArtifact.score }}</h3>
          <article v-for="issue in qaArtifact.issues" :key="issue.title">
            <strong>{{ issue.level }} · {{ issue.title }}</strong>
            <p>{{ issue.detail }}</p>
          </article>
        </div>

        <div v-else-if="canvasMode === 'image-to-html'" class="web-preview">
          <aside />
          <main>
            <header>
              <p>{{ selectedStage?.title }}</p>
              <button>Primary CTA</button>
            </header>
            <section class="hero-preview">
              <div>
                <span />
                <h3>Vue / HTML 页面还原</h3>
                <p>使用 design-spec、tokens 和 asset-map 生成响应式页面。</p>
              </div>
              <div class="preview-visual" />
            </section>
            <section class="preview-grid">
              <article />
              <article />
              <article />
            </section>
          </main>
        </div>

        <div v-else-if="canvasMode === 'image-to-image'" class="asset-preview">
          <article>
            <span>hero-illustration.png</span>
          </article>
          <article>
            <span>empty-state.png</span>
          </article>
          <article>
            <span>product-preview.png</span>
          </article>
        </div>

        <div v-else class="design-preview">
          <nav />
          <section>
            <div class="design-title" />
            <div class="design-copy" />
            <div class="design-actions" />
          </section>
          <section class="design-cards">
            <article />
            <article />
            <article />
          </section>
        </div>
      </div>
    </div>

    <div v-if="displayRun" class="prompt-dock">
      <section v-if="artifactManifest.length" class="artifact-shelf">
        <div>
          <h3>产物协议</h3>
          <p>{{ displayRun.agent.name }} 需要交付这些可进入下一阶段的文件。</p>
        </div>
        <ul>
          <li v-for="artifact in artifactManifest" :key="artifact.name">
            <strong>{{ artifact.name }}</strong>
            <span>{{ artifact.description }}</span>
          </li>
        </ul>
      </section>

      <section class="lint-shelf">
        <h3>设计 Lint</h3>
        <ul>
          <li v-for="rule in DESIGN_LINT_RULES" :key="rule">{{ rule }}</li>
        </ul>
      </section>

      <template v-if="displayRun.modelRun">
        <h3>模型输出</h3>
        <pre>{{ displayRun.reply }}</pre>
      </template>
      <h3>交接 Prompt</h3>
      <pre>{{ displayRun.handoffPrompt }}</pre>
    </div>
  </section>
</template>
