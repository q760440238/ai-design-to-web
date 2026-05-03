const API_BASE = import.meta.env.VITE_API_BASE || '/api'

async function request(path, options = {}) {
  const { headers = {}, ...fetchOptions } = options
  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error || '请求失败')
  }
  return payload
}

export function getWorkflow() {
  return request('/workflow')
}

export function getDocuments() {
  return request('/documents')
}

export function getDocument(slug) {
  return request(`/documents/${slug}`)
}

export function createProjectPlan(form) {
  return request('/project-plans', {
    method: 'POST',
    body: JSON.stringify(form)
  })
}

export function runAgent(payload) {
  return request('/agent-runs', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function updateStageStatus(stageId, status) {
  return request(`/stages/${stageId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  })
}

export function getImageMakeRuns(limit = 50) {
  return request(`/image-make-runs?limit=${encodeURIComponent(limit)}`)
}

export function saveImageMakeRun(payload) {
  return request('/image-make-runs', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}
