<script setup>
import { Activity, CheckCircle2, CircleDot, TriangleAlert } from 'lucide-vue-next'

defineProps({
  summary: {
    type: Object,
    required: true
  }
})
</script>

<template>
  <section class="metrics-strip" aria-label="工作流概览">
    <article class="metric-item">
      <Activity :size="18" />
      <span>总进度</span>
      <strong>{{ summary.progress || 0 }}%</strong>
    </article>
    <article class="metric-item">
      <CircleDot :size="18" />
      <span>阶段总数</span>
      <strong>{{ summary.totalStages || 0 }}</strong>
    </article>
    <article class="metric-item">
      <CheckCircle2 :size="18" />
      <span>已完成</span>
      <strong>{{ summary.completedStages || 0 }}</strong>
    </article>
    <article class="metric-item">
      <TriangleAlert :size="18" />
      <span>阻塞</span>
      <strong>{{ summary.blockedStages || 0 }}</strong>
    </article>
  </section>
</template>

