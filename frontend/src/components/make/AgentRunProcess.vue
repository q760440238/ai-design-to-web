<script setup>
import { computed, ref } from 'vue'
import {
  CheckCircle2,
  CircleDot,
  LoaderCircle,
  PanelRightClose,
  PanelRightOpen,
  ZoomIn,
  ZoomOut
} from 'lucide-vue-next'
import { artifactManifestForRun } from '../../services/workflowOptimizations'

const emit = defineEmits(['update:collapsed'])

const props = defineProps({
  stages: {
    type: Array,
    required: true
  },
  selectedStage: {
    type: Object,
    default: null
  },
  runs: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  collapsed: {
    type: Boolean,
    default: false
  }
})

const latestRun = computed(() => props.runs[0] || null)
const latestArtifacts = computed(() => artifactManifestForRun(latestRun.value))
const zoom = ref(1)
const zoomPercent = computed(() => `${Math.round(zoom.value * 100)}%`)

function isPast(stage) {
  return props.selectedStage && stage.number < props.selectedStage.number
}

function zoomIn() {
  zoom.value = Math.min(1.3, Number((zoom.value + 0.1).toFixed(1)))
}

function zoomOut() {
  zoom.value = Math.max(0.8, Number((zoom.value - 0.1).toFixed(1)))
}

function toggleCollapsed() {
  emit('update:collapsed', !props.collapsed)
}
</script>

<template>
  <section
    class="make-panel process-panel"
    :class="{ 'is-collapsed': collapsed }"
    :style="{ '--process-zoom': zoom }"
  >
    <button
      v-if="collapsed"
      class="process-rail"
      type="button"
      title="展开执行过程"
      @click="toggleCollapsed"
    >
      <PanelRightOpen :size="18" />
      <span>执行过程</span>
    </button>

    <template v-else>
      <div class="make-panel-head">
        <div>
          <p class="eyebrow">Agent Run</p>
          <h2>执行过程</h2>
        </div>
        <div class="process-tools">
          <LoaderCircle v-if="loading" class="spin" :size="18" />
          <button class="icon-button" type="button" title="缩小" @click="zoomOut">
            <ZoomOut :size="15" />
          </button>
          <span>{{ zoomPercent }}</span>
          <button class="icon-button" type="button" title="放大" @click="zoomIn">
            <ZoomIn :size="15" />
          </button>
          <button
            class="icon-button"
            type="button"
            title="收起执行过程，放大画布"
            @click="toggleCollapsed"
          >
            <PanelRightClose :size="15" />
          </button>
        </div>
      </div>

      <div class="process-scroll">
        <div class="process-stage-list">
          <article
            v-for="stage in stages"
            :key="stage.id"
            class="process-stage"
            :class="{ 'is-current': selectedStage?.id === stage.id, 'is-past': isPast(stage) }"
          >
            <span class="process-dot">
              <CheckCircle2 v-if="isPast(stage)" :size="14" />
              <CircleDot v-else :size="14" />
            </span>
            <div>
              <strong>Stage {{ stage.number }}</strong>
              <p>{{ stage.title }}</p>
            </div>
          </article>
        </div>

        <section v-if="latestRun" class="run-detail">
          <p class="eyebrow">{{ latestRun.agent.mode }}</p>
          <h3>{{ latestRun.agent.name }}</h3>
          <div v-if="latestRun.modelRun" class="run-source">
            <span>Web 端</span>
            <strong>{{ latestRun.modelRun.configName }}</strong>
            <small>{{ latestRun.modelRun.model }}</small>
          </div>
          <p>{{ latestRun.reply }}</p>
          <a
            v-if="latestRun.mediaResult?.resultUrl"
            class="result-link"
            :href="latestRun.mediaResult.resultUrl"
            target="_blank"
            rel="noreferrer"
          >
            打开生成图片
          </a>

          <div v-if="latestRun.designBatchArtifact?.designs?.length" class="run-block">
            <h4>生成设计图</h4>
            <div class="run-link-list">
              <a
                v-for="design in latestRun.designBatchArtifact.designs"
                :key="design.id"
                :href="design.resultUrl || '#'"
                :aria-disabled="!design.resultUrl"
                target="_blank"
                rel="noreferrer"
              >
                {{ design.fileName }} · {{ design.status === 'success' ? '已生成' : '未生成' }}
              </a>
            </div>
          </div>

          <div class="run-block">
            <h4>下一步</h4>
            <ol>
              <li v-for="item in latestRun.nextActions" :key="item">{{ item }}</li>
            </ol>
          </div>

          <div v-if="latestArtifacts.length" class="run-block">
            <h4>产物协议</h4>
            <ul>
              <li v-for="artifact in latestArtifacts" :key="artifact.name">
                <strong>{{ artifact.name }}</strong>：{{ artifact.description }}
              </li>
            </ul>
          </div>

          <div class="run-block">
            <h4>检查项</h4>
            <ul>
              <li v-for="item in latestRun.checklist" :key="item">{{ item }}</li>
            </ul>
          </div>

          <div class="run-io">
            <div>
              <h4>输入</h4>
              <span v-for="item in latestRun.requiredInputs" :key="item">{{ item }}</span>
            </div>
            <div>
              <h4>输出</h4>
              <span v-for="item in latestRun.expectedOutputs" :key="item">{{ item }}</span>
            </div>
          </div>
        </section>

        <section v-else class="empty-process">
          <PanelRightOpen :size="22" />
          <p>发送一条指令后，这里会显示 Agent 的执行链路、输入输出和检查项。</p>
        </section>
      </div>
    </template>
  </section>
</template>
