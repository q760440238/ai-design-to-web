<script setup>
import { computed, ref, watch } from 'vue'
import { Code2, Image, Send, Sparkles } from 'lucide-vue-next'
import { WORKFLOW_ROUTE_TEMPLATES } from '../../services/workflowOptimizations'

const props = defineProps({
  stages: {
    type: Array,
    required: true
  },
  messages: {
    type: Array,
    required: true
  },
  selectedStageId: {
    type: String,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['submit', 'update:selectedStageId'])

const agentType = ref('auto')
const draft = ref('生成当前阶段的下一步执行方案。')
const localStageId = ref(props.selectedStageId)
const designBatchMode = ref('fixed')
const designBatchCount = ref(2)
const assetBatchMode = ref('fixed')
const assetBatchCount = ref(8)

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

const showAssetBatchControls = computed(() => {
  return agentType.value === 'image2-assets-agent' || (agentType.value === 'auto' && localStageId.value === 'stage-6')
})

const showDesignBatchControls = computed(() => {
  return agentType.value === 'image2-ui-agent' || (agentType.value === 'auto' && localStageId.value === 'stage-3')
})

watch(
  () => props.selectedStageId,
  (stageId) => {
    localStageId.value = stageId
  }
)

function updateStage(stageId) {
  localStageId.value = stageId
  emit('update:selectedStageId', stageId)
}

function setQuick(type) {
  agentType.value = type
  if (type === 'image2-ui-agent') {
    updateStage('stage-3')
    draft.value = '从 Stage 3 开始，生成高保真 Desktop 和 Mobile UI 设计稿提示词，要求正视角、真实可读文案、可 HTML/CSS 还原。'
  }
  if (type === 'image2-assets-agent') {
    updateStage('stage-6')
    draft.value = '从 Stage 6 开始，调用图生图 Agent 生成一整套必要切图资产，输出每张资产的用途、尺寸、提示词、文件名和 asset-map.json 约束。'
  }
  if (type === 'code-restore-agent') {
    updateStage('stage-7')
    draft.value = '从 Stage 7 开始，调用图生 HTML 还原 Agent，把设计稿、design-spec.json、design-tokens-final.json 和 asset-map.json 转成一组可同时放进画布的多页面 HTML/Vue。'
  }
}

function applyRoute(route) {
  agentType.value = route.agentType
  updateStage(route.stageId)
  draft.value = route.prompt
}

function submit() {
  emit('submit', {
    stageId: localStageId.value,
    agentType: agentType.value,
    message: draft.value,
    designBatch: showDesignBatchControls.value ? buildDesignBatchConfig() : null,
    assetBatch: showAssetBatchControls.value ? buildAssetBatchConfig() : null
  })
  draft.value = ''
}

function buildDesignBatchConfig() {
  const count = Math.max(1, Math.min(24, Number(designBatchCount.value) || 1))
  return {
    mode: designBatchMode.value,
    count: designBatchMode.value === 'fixed' ? count : 0,
    maxCount: count
  }
}

function buildAssetBatchConfig() {
  const count = Math.max(1, Math.min(24, Number(assetBatchCount.value) || 1))
  return {
    mode: assetBatchMode.value,
    count: assetBatchMode.value === 'fixed' ? count : 0,
    maxCount: count
  }
}
</script>

<template>
  <section class="make-panel make-chat">
    <div class="make-panel-head">
      <div>
        <p class="eyebrow">Prompt</p>
        <h2>对话</h2>
      </div>
      <span class="make-count">{{ messages.length }}</span>
    </div>

    <div class="make-quick-row">
      <button type="button" @click="setQuick('image2-ui-agent')">
        <Image :size="15" />
        UI 图
      </button>
      <button type="button" @click="setQuick('image2-assets-agent')">
        <Sparkles :size="15" />
        图生图
      </button>
      <button type="button" @click="setQuick('code-restore-agent')">
        <Code2 :size="15" />
        图生 HTML
      </button>
    </div>

    <div class="route-template-list">
      <button
        v-for="route in WORKFLOW_ROUTE_TEMPLATES"
        :key="route.id"
        type="button"
        @click="applyRoute(route)"
      >
        <span>{{ route.badge }}</span>
        <strong>{{ route.name }}</strong>
        <small>{{ route.description }}</small>
      </button>
    </div>

    <div class="make-chat-feed">
      <article
        v-for="message in messages"
        :key="message.id"
        class="make-message"
        :class="`is-${message.role}`"
      >
        <span>{{ message.role === 'user' ? 'You' : 'Agent' }}</span>
        <p>{{ message.content }}</p>
      </article>
    </div>

    <form class="make-composer" @submit.prevent="submit">
      <label>
        <span>阶段</span>
        <select :value="localStageId" name="makeStage" @change="updateStage($event.target.value)">
          <option v-for="stage in stages" :key="stage.id" :value="stage.id">
            Stage {{ stage.number }} · {{ stage.title }}
          </option>
        </select>
      </label>

      <label>
        <span>Agent</span>
        <select v-model="agentType" name="makeAgent">
          <option v-for="option in agentOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <section v-if="showDesignBatchControls" class="asset-batch-control">
        <div class="asset-batch-control-head">
          <span>设计稿批量</span>
          <strong>{{ designBatchMode === 'fixed' ? `${designBatchCount} 张` : `最多 ${designBatchCount} 张` }}</strong>
        </div>

        <div class="segmented-control">
          <button
            type="button"
            :class="{ 'is-active': designBatchMode === 'fixed' }"
            @click="designBatchMode = 'fixed'"
          >
            固定张数
          </button>
          <button
            type="button"
            :class="{ 'is-active': designBatchMode === 'free' }"
            @click="designBatchMode = 'free'"
          >
            自由规划
          </button>
        </div>

        <label>
          <span>{{ designBatchMode === 'fixed' ? '生成张数' : '最多张数' }}</span>
          <input v-model.number="designBatchCount" name="designBatchCount" type="number" min="1" max="24" step="1" />
        </label>

        <p>
          {{
            designBatchMode === 'fixed'
              ? 'Agent 会逐张调用 image2，并在画布展示每张设计图。'
              : 'Agent 可根据页面复杂度自由规划设计图数量，但不超过最多张数。'
          }}
        </p>
      </section>

      <section v-if="showAssetBatchControls" class="asset-batch-control">
        <div class="asset-batch-control-head">
          <span>切图批量</span>
          <strong>{{ assetBatchMode === 'fixed' ? `${assetBatchCount} 张` : `最多 ${assetBatchCount} 张` }}</strong>
        </div>

        <div class="segmented-control">
          <button
            type="button"
            :class="{ 'is-active': assetBatchMode === 'fixed' }"
            @click="assetBatchMode = 'fixed'"
          >
            固定张数
          </button>
          <button
            type="button"
            :class="{ 'is-active': assetBatchMode === 'free' }"
            @click="assetBatchMode = 'free'"
          >
            自由规划
          </button>
        </div>

        <label>
          <span>{{ assetBatchMode === 'fixed' ? '生成张数' : '最多张数' }}</span>
          <input v-model.number="assetBatchCount" name="assetBatchCount" type="number" min="1" max="24" step="1" />
        </label>

        <p>
          {{
            assetBatchMode === 'fixed'
              ? 'Agent 会严格按这个数量生成一整套切图。'
              : 'Agent 可根据页面复杂度自由规划数量，但不超过最多张数。'
          }}
        </p>
      </section>

      <label>
        <span>指令</span>
        <textarea v-model="draft" name="makePrompt" rows="5" />
      </label>

      <button class="button button-primary" type="submit" :disabled="loading || !draft.trim()">
        <Send :size="16" />
        {{ loading ? '执行中' : '发送' }}
      </button>
    </form>
  </section>
</template>
