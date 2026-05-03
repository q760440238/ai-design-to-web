<script setup>
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock3,
  PlayCircle
} from 'lucide-vue-next'

defineProps({
  stages: {
    type: Array,
    required: true
  },
  selectedStage: {
    type: Object,
    required: true
  }
})

defineEmits(['select', 'status-change'])

const statusIcons = {
  pending: Circle,
  active: PlayCircle,
  completed: CheckCircle2,
  blocked: AlertTriangle
}

const statuses = [
  { value: 'pending', label: '待处理' },
  { value: 'active', label: '进行中' },
  { value: 'completed', label: '完成' },
  { value: 'blocked', label: '阻塞' }
]
</script>

<template>
  <div class="panel stage-panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Execution Stages</p>
        <h2>执行阶段</h2>
      </div>
      <span class="muted">{{ stages.length }} 个阶段</span>
    </div>

    <div class="stage-list">
      <button
        v-for="stage in stages"
        :key="stage.id"
        class="stage-row"
        :class="{ 'is-selected': selectedStage?.id === stage.id }"
        type="button"
        @click="$emit('select', stage)"
      >
        <span class="stage-index">{{ stage.number }}</span>
        <span class="stage-copy">
          <strong>{{ stage.title }}</strong>
          <small>{{ stage.owner }} · {{ stage.phase }}</small>
        </span>
        <component :is="statusIcons[stage.status]" :size="18" class="stage-status-icon" />
      </button>
    </div>

    <section v-if="selectedStage" class="stage-detail">
      <div class="stage-detail-header">
        <div>
          <p class="eyebrow">Stage {{ selectedStage.number }}</p>
          <h3>{{ selectedStage.title }}</h3>
        </div>
        <span class="status-pill" :class="`status-${selectedStage.status}`">
          <Clock3 v-if="selectedStage.status === 'pending'" :size="14" />
          {{ selectedStage.status }}
        </span>
      </div>

      <p class="stage-summary">{{ selectedStage.summary }}</p>

      <div class="progress-track">
        <span :style="{ width: `${selectedStage.progress}%` }" />
      </div>

      <div class="status-actions" aria-label="更新阶段状态">
        <button
          v-for="status in statuses"
          :key="status.value"
          class="icon-button"
          :class="{ 'is-active': selectedStage.status === status.value }"
          type="button"
          :title="status.label"
          @click="$emit('status-change', selectedStage, status.value)"
        >
          <component :is="statusIcons[status.value]" :size="17" />
          <span>{{ status.label }}</span>
        </button>
      </div>

      <div class="detail-grid">
        <section>
          <h4>输入</h4>
          <ul>
            <li v-for="item in selectedStage.inputs" :key="item">{{ item }}</li>
          </ul>
        </section>
        <section>
          <h4>输出</h4>
          <ul>
            <li v-for="item in selectedStage.outputs" :key="item">{{ item }}</li>
          </ul>
        </section>
        <section>
          <h4>门禁</h4>
          <ul>
            <li v-for="item in selectedStage.gate" :key="item">{{ item }}</li>
          </ul>
        </section>
        <section>
          <h4>回退</h4>
          <ul>
            <li v-for="item in selectedStage.rollback" :key="item">{{ item }}</li>
          </ul>
        </section>
      </div>
    </section>
  </div>
</template>

