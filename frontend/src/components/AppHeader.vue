<script setup>
import { Github, Images, LayoutDashboard, RefreshCw, WandSparkles, Workflow } from 'lucide-vue-next'
import ModelSettingsPanel from './ModelSettingsPanel.vue'

defineProps({
  activePage: {
    type: String,
    default: 'dashboard'
  }
})
defineEmits(['refresh'])
</script>

<template>
  <header class="app-header">
    <div class="brand-block">
      <div class="brand-mark">
        <Workflow :size="22" />
      </div>
      <div>
        <p class="eyebrow">AI UI Workflow Console</p>
        <h1>AI Design to Web</h1>
      </div>
    </div>

    <div class="header-actions">
      <nav class="app-nav" aria-label="页面导航">
        <a class="nav-link" :class="{ 'is-active': activePage === 'dashboard' }" href="/">
          <LayoutDashboard :size="16" />
          控制台
        </a>
        <a class="nav-link" :class="{ 'is-active': activePage === 'make' }" href="/make">
          <WandSparkles :size="16" />
          Make
        </a>
        <a class="nav-link" :class="{ 'is-active': activePage === 'image-make' }" href="/image-make">
          <Images :size="16" />
          单图生成
        </a>
      </nav>
      <a class="icon-link" href="https://github.com" target="_blank" rel="noreferrer" title="GitHub">
        <Github :size="18" />
      </a>
      <ModelSettingsPanel />
      <button class="button button-secondary" type="button" @click="$emit('refresh')">
        <RefreshCw :size="16" />
        刷新
      </button>
    </div>
  </header>
</template>
