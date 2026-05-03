<script setup>
import { computed } from 'vue'
import { CheckCircle2, FileText, LibraryBig, Star, XCircle } from 'lucide-vue-next'

const props = defineProps({
  documents: {
    type: Array,
    required: true
  },
  selectedDocument: {
    type: Object,
    default: null
  }
})

defineEmits(['select'])

const selectedContent = computed(() => {
  return props.selectedDocument?.content || '选择左侧文档后，这里会显示真实 Markdown 内容。'
})
</script>

<template>
  <div class="panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Documents</p>
        <h2>文档库</h2>
      </div>
      <LibraryBig :size="20" />
    </div>

    <div class="doc-list">
      <button
        v-for="document in documents"
        :key="document.slug"
        class="doc-row"
        type="button"
        :class="{ 'is-selected': selectedDocument?.slug === document.slug }"
        @click="$emit('select', document)"
      >
        <FileText :size="17" />
        <span>
          <strong>{{ document.title }}</strong>
          <small>{{ document.path }} · {{ document.bytes || 0 }} bytes</small>
        </span>
        <CheckCircle2 v-if="document.exists" :size="15" class="doc-exists" />
        <XCircle v-else :size="15" class="doc-missing" />
      </button>
    </div>

    <section v-if="selectedDocument" class="doc-detail">
      <div class="doc-detail-title">
        <div>
          <p class="eyebrow">{{ selectedDocument.kind }}</p>
          <h3>{{ selectedDocument.title }}</h3>
        </div>
        <Star v-if="selectedDocument.required" :size="16" />
      </div>
      <p>{{ selectedDocument.description }}</p>
      <pre class="markdown-preview">{{ selectedContent }}</pre>
    </section>
  </div>
</template>
