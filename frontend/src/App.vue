<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  getWorkflow,
  getDocument,
  createProjectPlan,
  runAgent,
  updateStageStatus
} from './services/api'
import { loadAgentRuntimeSettings, runBrowserAgent } from './services/agentRuntime'
import AppHeader from './components/AppHeader.vue'
import MetricsStrip from './components/MetricsStrip.vue'
import StageBoard from './components/StageBoard.vue'
import DocumentLibrary from './components/DocumentLibrary.vue'
import AgentConsole from './components/AgentConsole.vue'
import ProjectPlanner from './components/ProjectPlanner.vue'
import MakePage from './pages/MakePage.vue'
import ImageMakePage from './pages/ImageMakePage.vue'

const loading = ref(true)
const error = ref('')
const workflow = ref(null)
const selectedStageId = ref('')
const selectedDocument = ref(null)
const planning = ref(false)
const projectPlan = ref(null)
const agentLoading = ref(false)
const agentRuns = ref([])
const routePath = ref(window.location.pathname)
const makeRefreshKey = ref(0)
const imageMakeRefreshKey = ref(0)

const stages = computed(() => workflow.value?.stages || [])
const documents = computed(() => workflow.value?.documents || [])
const summary = computed(() => workflow.value?.summary || {})
const isMakePage = computed(() => routePath.value.startsWith('/make'))
const isImageMakePage = computed(() => routePath.value.startsWith('/image-make'))
const activePage = computed(() => {
  if (isImageMakePage.value) return 'image-make'
  if (isMakePage.value) return 'make'
  return 'dashboard'
})

const selectedStage = computed(() => {
  return stages.value.find((stage) => stage.id === selectedStageId.value) || stages.value[0]
})

async function loadWorkflow() {
  loading.value = true
  error.value = ''
  try {
    workflow.value = await getWorkflow()
    selectedStageId.value = selectedStageId.value || workflow.value.stages[0]?.id || ''
    if (!selectedDocument.value && workflow.value.documents[0]) {
      await openDocument(workflow.value.documents[0])
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function openDocument(document) {
  try {
    selectedDocument.value = await getDocument(document.slug)
  } catch (err) {
    error.value = err.message
  }
}

async function changeStatus(stage, status) {
  try {
    const updated = await updateStageStatus(stage.id, status)
    workflow.value.stages = workflow.value.stages.map((item) => {
      return item.id === updated.id ? updated : item
    })
    workflow.value.summary = summarize(workflow.value.stages)
  } catch (err) {
    error.value = err.message
  }
}

async function submitPlan(form) {
  planning.value = true
  error.value = ''
  try {
    projectPlan.value = await createProjectPlan(form)
  } catch (err) {
    error.value = err.message
  } finally {
    planning.value = false
  }
}

async function submitAgentRun(payload) {
  agentLoading.value = true
  error.value = ''
  try {
    const runtimeSettings = loadAgentRuntimeSettings()
    const stage = stages.value.find((item) => item.id === payload.stageId) || selectedStage.value
    const run = runtimeSettings.browserDirectEnabled
      ? await runBrowserAgent({
        request: payload,
        stage,
        documents: await loadRelatedDocuments(payload.stageId, payload.documentSlugs),
        settings: runtimeSettings
    })
      : await runAgent(payload)

    agentRuns.value = [run, ...agentRuns.value].slice(0, 8)
    const statusStageId = run.stageId || run.stageID || payload.stageId
    const statusTarget = stages.value.find((item) => item.id === statusStageId)
    if (run.suggestedStatus && statusTarget?.status === 'pending') {
      await changeStatus(statusTarget, run.suggestedStatus)
    }
  } catch (err) {
    error.value = err.message
  } finally {
    agentLoading.value = false
  }
}

async function loadRelatedDocuments(stageId, documentSlugs = []) {
  const selected = new Set(documentSlugs)
  const related = documents.value.filter((document) => {
    return selected.has(document.slug) || document.stageIds?.includes(stageId)
  })

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

function summarize(items) {
  const totalStages = items.length
  const completedStages = items.filter((stage) => stage.status === 'completed').length
  const activeStages = items.filter((stage) => stage.status === 'active').length
  const blockedStages = items.filter((stage) => stage.status === 'blocked').length
  const progress = totalStages
    ? Math.round(items.reduce((total, stage) => total + stage.progress, 0) / totalStages)
    : 0

  return { totalStages, completedStages, activeStages, blockedStages, progress }
}

function refreshActivePage() {
  if (isImageMakePage.value) {
    imageMakeRefreshKey.value += 1
    return
  }
  if (isMakePage.value) {
    makeRefreshKey.value += 1
    return
  }
  loadWorkflow()
}

onMounted(() => {
  if (!isMakePage.value && !isImageMakePage.value) {
    loadWorkflow()
  } else {
    loading.value = false
  }
})
</script>

<template>
  <div class="app-shell">
    <AppHeader :active-page="activePage" @refresh="refreshActivePage" />

    <ImageMakePage v-if="isImageMakePage" :key="imageMakeRefreshKey" />

    <MakePage v-else-if="isMakePage" :key="makeRefreshKey" />

    <main v-else class="app-main">
      <section v-if="error" class="notice notice-error">
        {{ error }}
      </section>

      <section v-if="loading" class="loading-state">
        <div class="loading-bar" />
        <p>正在载入工作流...</p>
      </section>

      <template v-else>
        <MetricsStrip :summary="summary" />

        <div class="workspace-grid">
          <aside class="workspace-side">
            <DocumentLibrary
              :documents="documents"
              :selected-document="selectedDocument"
              @select="openDocument"
            />
          </aside>

          <section class="workspace-center">
            <StageBoard
              :stages="stages"
              :selected-stage="selectedStage"
              @select="selectedStageId = $event.id"
              @status-change="changeStatus"
            />
          </section>

          <aside class="workspace-side">
            <AgentConsole
              :stages="stages"
              :documents="documents"
              :selected-stage="selectedStage"
              :history="agentRuns"
              :loading="agentLoading"
              @run="submitAgentRun"
            />

            <ProjectPlanner
              :loading="planning"
              :plan="projectPlan"
              @submit="submitPlan"
            />
          </aside>
        </div>
      </template>
    </main>
  </div>
</template>
