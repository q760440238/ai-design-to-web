<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { KeyRound, Plus, Save, Settings2, Trash2, X } from 'lucide-vue-next'
import {
  AGENT_PROFILES,
  createDefaultAgentRuntimeSettings,
  loadAgentRuntimeSettings,
  normalizeSettings,
  saveAgentRuntimeSettings
} from '../services/agentRuntime'
import {
  MODEL_PROVIDER_PRESETS,
  applyModelPreset,
  createModelConfigFromPreset
} from '../services/workflowOptimizations'

const open = ref(false)
const saved = ref(loadAgentRuntimeSettings())
const draft = ref(cloneSettings(saved.value))
const savedAt = ref('')
const selectedPresetId = ref(MODEL_PROVIDER_PRESETS[0]?.id || '')

const modeLabel = computed(() => saved.value.browserDirectEnabled ? 'Web 直连' : '后端执行')
const selectedPreset = computed(() => {
  return MODEL_PROVIDER_PRESETS.find((preset) => preset.id === selectedPresetId.value) || MODEL_PROVIDER_PRESETS[0]
})

function openPanel() {
  draft.value = cloneSettings(loadAgentRuntimeSettings())
  open.value = true
}

function closePanel() {
  open.value = false
}

function addModelConfig() {
  draft.value.modelConfigs.push({
    id: `custom-model-${Date.now()}`,
    name: '自定义模型',
    protocol: 'openai-compatible',
    baseUrl: '',
    endpoint: '/chat/completions',
    model: '',
    apiKey: '',
    temperature: 0.2
  })
}

function addPresetModel(presetId = selectedPresetId.value) {
  const preset = MODEL_PROVIDER_PRESETS.find((item) => item.id === presetId)
  if (!preset) return
  draft.value.modelConfigs.push(createModelConfigFromPreset(preset))
}

function applyPreset(model, presetId) {
  const preset = MODEL_PROVIDER_PRESETS.find((item) => item.id === presetId)
  if (!preset) return
  applyModelPreset(model, preset)
}

function removeModelConfig(modelId) {
  if (draft.value.modelConfigs.length <= 1) return

  draft.value.modelConfigs = draft.value.modelConfigs.filter((model) => model.id !== modelId)
  const fallbackId = draft.value.modelConfigs[0]?.id || ''
  Object.values(draft.value.agentBindings).forEach((binding) => {
    if (binding.modelConfigId === modelId) {
      binding.modelConfigId = fallbackId
    }
  })
}

function resetSettings() {
  draft.value = cloneSettings(createDefaultAgentRuntimeSettings())
}

function saveSettings() {
  saved.value = saveAgentRuntimeSettings(draft.value)
  draft.value = cloneSettings(saved.value)
  savedAt.value = '已保存'
  window.setTimeout(() => {
    savedAt.value = ''
  }, 1400)
}

function cloneSettings(settings) {
  return normalizeSettings(JSON.parse(JSON.stringify(settings)))
}

function handleKeydown(event) {
  if (event.key === 'Escape' && open.value) {
    closePanel()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="model-settings">
    <button
      class="button button-secondary model-settings-trigger"
      type="button"
      :class="{ 'is-direct': saved.browserDirectEnabled }"
      @click="openPanel"
    >
      <Settings2 :size="16" />
      模型设置
      <span>{{ modeLabel }}</span>
    </button>

    <div v-if="open" class="settings-overlay" @click.self="closePanel">
      <section class="settings-drawer" role="dialog" aria-modal="true" aria-label="模型与 Agent 设置">
        <header class="settings-head">
          <div>
            <p class="eyebrow">Runtime</p>
            <h2>模型与 Agent 设置</h2>
          </div>
          <button class="icon-button" type="button" title="关闭" @click="closePanel">
            <X :size="16" />
          </button>
        </header>

        <div class="settings-body">
          <label class="runtime-toggle">
            <input v-model="draft.browserDirectEnabled" type="checkbox" />
            <span>
              <strong>Web 端直连</strong>
              <small>Agent 任务由浏览器请求模型接口，Key 保存在本机浏览器。</small>
            </span>
          </label>

          <section class="settings-section">
            <div class="settings-section-head">
              <div>
                <h3>模型配置</h3>
                <p>每个模型可以独立设置 Base URL、模型名和 Key，也可以直接套用 BYOK 预设。</p>
              </div>
              <button class="icon-button" type="button" title="新增模型" @click="addModelConfig">
                <Plus :size="15" />
              </button>
            </div>

            <div class="preset-strip">
              <div>
                <strong>供应商预设</strong>
                <span>{{ selectedPreset.description }}</span>
              </div>
              <select v-model="selectedPresetId" aria-label="选择模型供应商预设">
                <option
                  v-for="preset in MODEL_PROVIDER_PRESETS"
                  :key="preset.id"
                  :value="preset.id"
                >
                  {{ preset.name }}
                </option>
              </select>
              <button class="button button-secondary" type="button" @click="addPresetModel()">
                <Plus :size="15" />
                新增预设
              </button>
            </div>

            <article
              v-for="model in draft.modelConfigs"
              :key="model.id"
              class="model-config-card"
            >
              <div class="model-card-head">
                <label>
                  <span>名称</span>
                  <input v-model.trim="model.name" type="text" />
                </label>
                <button
                  class="icon-button danger-button"
                  type="button"
                  title="删除模型"
                  :disabled="draft.modelConfigs.length <= 1"
                  @click="removeModelConfig(model.id)"
                >
                  <Trash2 :size="15" />
                </button>
              </div>

              <div class="preset-apply-row">
                <span>套用预设</span>
                <button
                  v-for="preset in MODEL_PROVIDER_PRESETS"
                  :key="preset.id"
                  class="preset-chip"
                  type="button"
                  @click="applyPreset(model, preset.id)"
                >
                  {{ preset.name }}
                </button>
              </div>

              <div class="settings-grid two">
                <label>
                  <span>协议</span>
                  <select v-model="model.protocol">
                    <option value="openai-compatible">OpenAI 兼容</option>
                    <option value="openai-responses">OpenAI Responses</option>
                    <option value="gemini">Gemini GenerateContent</option>
                    <option value="cn-image2">CN API · GPT Image 2</option>
                  </select>
                </label>
                <label>
                  <span>模型</span>
                  <input v-model.trim="model.model" type="text" placeholder="model-name" />
                </label>
              </div>

              <label>
                <span>Base URL</span>
                <input v-model.trim="model.baseUrl" type="text" placeholder="https://api.example.com/v1" />
              </label>

              <div class="settings-grid two">
                <label>
                  <span>Endpoint</span>
                  <input
                    v-model.trim="model.endpoint"
                    type="text"
                    :placeholder="model.protocol === 'cn-image2' ? '/v1/media/generate' : '/chat/completions'"
                  />
                </label>
                <label>
                  <span>Temperature</span>
                  <input v-model.number="model.temperature" type="number" min="0" max="2" step="0.1" />
                </label>
              </div>

              <label v-if="model.protocol !== 'cn-image2'">
                <span>Responses Endpoint</span>
                <input v-model.trim="model.responsesEndpoint" type="text" placeholder="/v1/responses" />
              </label>

              <template v-if="model.protocol === 'cn-image2'">
                <div class="settings-grid two">
                  <label>
                    <span>状态 Endpoint</span>
                    <input v-model.trim="model.statusEndpoint" type="text" placeholder="/v1/media/status" />
                  </label>
                  <label>
                    <span>图片尺寸</span>
                    <select v-model="model.size">
                      <option value="auto">auto</option>
                      <option value="1024x1024">1024x1024</option>
                      <option value="1536x1024">1536x1024</option>
                      <option value="1024x1536">1024x1536</option>
                      <option value="1152x2048">1152x2048</option>
                      <option value="2048x1152">2048x1152</option>
                      <option value="2048x2048">2048x2048</option>
                      <option value="2160x3840">2160x3840</option>
                      <option value="3840x2160">3840x2160</option>
                    </select>
                  </label>
                </div>

                <div class="settings-grid two">
                  <label>
                    <span>图片质量</span>
                    <select v-model="model.quality">
                      <option value="auto">auto</option>
                      <option value="high">high</option>
                      <option value="medium">medium</option>
                      <option value="low">low</option>
                    </select>
                  </label>
                  <label>
                    <span>轮询间隔 ms</span>
                    <input v-model.number="model.pollIntervalMs" type="number" min="1000" step="500" />
                  </label>
                </div>

                <label>
                  <span>最大轮询次数</span>
                  <input v-model.number="model.maxPollAttempts" type="number" min="1" step="1" />
                </label>
              </template>

              <label>
                <span>API Key</span>
                <input v-model="model.apiKey" type="password" autocomplete="off" />
              </label>
            </article>
          </section>

          <section class="settings-section">
            <div class="settings-section-head">
              <div>
                <h3>Agent 任务绑定</h3>
                <p>不同任务可以绑定不同模型，并设置各自的执行职责。</p>
              </div>
            </div>

            <div class="agent-binding-list">
              <article
                v-for="agent in AGENT_PROFILES"
                :key="agent.type"
                class="agent-binding-row"
              >
                <div class="agent-binding-title">
                  <KeyRound :size="16" />
                  <div>
                    <strong>{{ agent.name }}</strong>
                    <span>{{ agent.mode }}</span>
                  </div>
                </div>
                <label>
                  <span>模型</span>
                  <select v-model="draft.agentBindings[agent.type].modelConfigId">
                    <option
                      v-for="model in draft.modelConfigs"
                      :key="model.id"
                      :value="model.id"
                    >
                      {{ model.name || model.model || model.id }}
                    </option>
                  </select>
                </label>
                <label>
                  <span>任务职责</span>
                  <textarea v-model="draft.agentBindings[agent.type].taskInstruction" rows="3" />
                </label>
              </article>
            </div>
          </section>
        </div>

        <footer class="settings-footer">
          <button class="button button-secondary" type="button" @click="resetSettings">恢复默认</button>
          <span>{{ savedAt }}</span>
          <button class="button button-primary" type="button" @click="saveSettings">
            <Save :size="16" />
            保存设置
          </button>
        </footer>
      </section>
    </div>
  </div>
</template>
