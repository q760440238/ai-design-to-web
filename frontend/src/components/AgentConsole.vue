<script setup>
import { computed, ref, watch } from 'vue'
import { Bot, Clipboard, Code2, Image, Send, Sparkles } from 'lucide-vue-next'

const props = defineProps({
  stages: {
    type: Array,
    required: true
  },
  documents: {
    type: Array,
    required: true
  },
  selectedStage: {
    type: Object,
    required: true
  },
  history: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['run'])

const targetStageId = ref(props.selectedStage?.id || '')
const agentType = ref('auto')
const message = ref('请根据当前阶段生成下一步可执行提示词。')
const copied = ref(false)

const agentOptions = [
  { value: 'auto', label: '自动选择 Agent' },
  { value: 'product-agent', label: '产品原型 Agent' },
  { value: 'style-agent', label: '视觉方向 Agent' },
  { value: 'image2-ui-agent', label: 'image2 UI 设计稿 Agent' },
  { value: 'image2-assets-agent', label: 'image2 图生图切图 Agent' },
  { value: 'gemini-review-agent', label: 'Gemini 审图 Agent' },
  { value: 'gemini-spec-agent', label: 'Gemini 结构化标注 Agent' },
  { value: 'code-restore-agent', label: '图生 HTML 还原 Agent' },
  { value: 'qa-agent', label: '视觉 QA Agent' }
]

const latestRun = computed(() => props.history[0] || null)

watch(
  () => props.selectedStage?.id,
  (stageId) => {
    if (stageId) {
      targetStageId.value = stageId
    }
  }
)

function submit() {
  if (!targetStageId.value) return
  emit('run', {
    stageId: targetStageId.value,
    agentType: agentType.value === 'auto' ? '' : agentType.value,
    message: message.value,
    documentSlugs: props.documents
      .filter((document) => document.stageIds?.includes(targetStageId.value))
      .map((document) => document.slug)
  })
}

function useQuick(type) {
  agentType.value = type
  if (type === 'image2-ui-agent') {
    const uiStage = props.stages.find((stage) => stage.id === 'stage-3')
    targetStageId.value = uiStage?.id || targetStageId.value
    message.value = '调用 image2 生成当前阶段的高保真 UI 设计稿，要求正视角、文案可读、适合 HTML/CSS 还原。'
  }
  if (type === 'image2-assets-agent') {
    const assetsStage = props.stages.find((stage) => stage.id === 'stage-6')
    targetStageId.value = assetsStage?.id || targetStageId.value
    message.value = '调用图生图 Agent，根据设计稿生成必要切图资产，并输出 asset-map.json 约束。'
  }
  if (type === 'code-restore-agent') {
    const htmlStage = props.stages.find((stage) => stage.id === 'stage-7')
    targetStageId.value = htmlStage?.id || targetStageId.value
    message.value = '调用图生 HTML 还原 Agent，根据设计稿图片、design-spec.json、design-tokens-final.json 和 asset-map.json 生成 Vue/HTML/CSS 页面。'
  }
}

async function copyPrompt() {
  if (!latestRun.value?.handoffPrompt) return
  await navigator.clipboard.writeText(latestRun.value.handoffPrompt)
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1400)
}
</script>

<template>
  <div class="panel agent-panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Agent Console</p>
        <h2>对话式执行台</h2>
      </div>
      <Bot :size="20" />
    </div>

    <div class="agent-body">
      <div class="quick-actions" aria-label="快速调用 agent">
        <button type="button" class="quick-action" @click="useQuick('image2-ui-agent')">
          <Image :size="15" />
          UI 图
        </button>
        <button type="button" class="quick-action" @click="useQuick('image2-assets-agent')">
          <Sparkles :size="15" />
          图生图
        </button>
        <button type="button" class="quick-action" @click="useQuick('code-restore-agent')">
          <Code2 :size="15" />
          图生 HTML
        </button>
      </div>

      <label>
        <span>目标阶段</span>
        <select v-model="targetStageId" name="targetStageId">
          <option v-for="stage in stages" :key="stage.id" :value="stage.id">
            Stage {{ stage.number }} · {{ stage.title }}
          </option>
        </select>
      </label>

      <label>
        <span>Agent</span>
        <select v-model="agentType" name="agentType">
          <option v-for="option in agentOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label>
        <span>自然语言指令</span>
        <textarea v-model="message" name="agentMessage" rows="4" />
      </label>

      <button class="button button-primary" type="button" :disabled="loading" @click="submit">
        <Send :size="16" />
        {{ loading ? '调用中' : '调用 Agent' }}
      </button>
    </div>

    <section v-if="latestRun" class="agent-result">
      <div class="agent-result-title">
        <strong>{{ latestRun.agent.name }}</strong>
        <span>{{ latestRun.agent.mode }}</span>
      </div>
      <p>{{ latestRun.reply }}</p>

      <div class="agent-list-block">
        <h3>下一步</h3>
        <ol>
          <li v-for="item in latestRun.nextActions" :key="item">{{ item }}</li>
        </ol>
      </div>

      <div class="agent-list-block">
        <h3>检查项</h3>
        <ul>
          <li v-for="item in latestRun.checklist" :key="item">{{ item }}</li>
        </ul>
      </div>

      <div class="prompt-card">
        <div class="prompt-card-head">
          <h3>交接 Prompt</h3>
          <button type="button" class="icon-button" @click="copyPrompt">
            <Clipboard :size="15" />
            {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <pre>{{ latestRun.handoffPrompt }}</pre>
      </div>
    </section>
  </div>
</template>
