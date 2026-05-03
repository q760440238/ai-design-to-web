<script setup>
import { reactive } from 'vue'
import { Rocket, Send, Sparkles } from 'lucide-vue-next'

defineProps({
  loading: {
    type: Boolean,
    default: false
  },
  plan: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['submit'])

const form = reactive({
  productName: 'AI UI 自动化平台',
  audience: '需要快速产出原型和 Web 页面的创业团队',
  priorityPage: 'Dashboard 工作台首页',
  deliveryGoal: '生成可运行的前后端分离 Web 控制台',
  style: '专业、克制、清晰、适合高频操作'
})

function submit() {
  emit('submit', { ...form })
}
</script>

<template>
  <div class="panel planner-panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Run Planner</p>
        <h2>试跑计划</h2>
      </div>
      <Rocket :size="20" />
    </div>

    <form class="planner-form" @submit.prevent="submit">
      <label>
        <span>产品名称</span>
        <input id="product-name" v-model="form.productName" name="productName" type="text" />
      </label>
      <label>
        <span>目标用户</span>
        <textarea id="audience" v-model="form.audience" name="audience" rows="3" />
      </label>
      <label>
        <span>P0 页面</span>
        <input id="priority-page" v-model="form.priorityPage" name="priorityPage" type="text" />
      </label>
      <label>
        <span>交付目标</span>
        <textarea id="delivery-goal" v-model="form.deliveryGoal" name="deliveryGoal" rows="3" />
      </label>
      <label>
        <span>视觉风格</span>
        <input id="visual-style" v-model="form.style" name="style" type="text" />
      </label>

      <button class="button button-primary" type="submit" :disabled="loading">
        <Send :size="16" />
        {{ loading ? '生成中' : '生成建议' }}
      </button>
    </form>

    <section v-if="plan" class="plan-result">
      <div class="plan-result-title">
        <Sparkles :size="17" />
        <strong>{{ plan.productName }}</strong>
      </div>

      <h3>推荐执行</h3>
      <ol>
        <li v-for="item in plan.recommendedRun" :key="item">{{ item }}</li>
      </ol>

      <h3>下一步</h3>
      <ol>
        <li v-for="item in plan.nextActions" :key="item">{{ item }}</li>
      </ol>

      <h3>风险</h3>
      <ul>
        <li v-for="item in plan.risks" :key="item">{{ item }}</li>
      </ul>
    </section>
  </div>
</template>
