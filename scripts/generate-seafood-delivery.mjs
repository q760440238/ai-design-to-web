import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(projectRoot, '..')
const envPath = path.join(workspaceRoot, '.env')
const outputSlug = 'seafood-delivery-15'
const outputDir = path.join(projectRoot, 'frontend', 'public', 'generated', outputSlug)
const pagesDir = path.join(outputDir, 'pages')

const expectedPages = [
  { id: 'home', title: '首页', route: '/' },
  { id: 'categories', title: '分类', route: '/categories' },
  { id: 'fresh-today', title: '今日鲜货', route: '/fresh-today' },
  { id: 'search', title: '搜索结果', route: '/search' },
  { id: 'product-detail', title: '商品详情', route: '/products/salmon' },
  { id: 'bundles', title: '套餐组合', route: '/bundles' },
  { id: 'cart', title: '购物车', route: '/cart' },
  { id: 'checkout', title: '结算', route: '/checkout' },
  { id: 'addresses', title: '地址管理', route: '/addresses' },
  { id: 'delivery-slots', title: '配送时间', route: '/delivery-slots' },
  { id: 'payment-success', title: '支付成功', route: '/payment-success' },
  { id: 'orders', title: '订单列表', route: '/orders' },
  { id: 'order-tracking', title: '订单追踪', route: '/orders/FD2048' },
  { id: 'profile', title: '会员中心', route: '/profile' },
  { id: 'business', title: '企业采购', route: '/business' }
]

const fallbackTokens = {
  primary: '#006C70',
  secondary: '#0EA5A4',
  accent: '#F59E0B',
  ink: '#102033',
  muted: '#607080',
  background: '#F2FAFA',
  surface: '#FFFFFF',
  line: '#D6E7EA',
  success: '#138A5B',
  danger: '#C2410C'
}

async function main() {
  const env = await readEnv(envPath)
  const config = readGpt55Config(env)
  console.log(`Generating ${expectedPages.length} seafood delivery pages with ${config.model}...`)

  const rawSpec = await generateProjectSpec(config)
  const spec = normalizeSpec(rawSpec)
  const assetBatch = buildAssetBatch(spec)
  const manifest = buildManifest(spec, assetBatch)

  await rm(outputDir, { recursive: true, force: true })
  await mkdir(pagesDir, { recursive: true })

  await writeFile(path.join(outputDir, 'project-spec.json'), `${JSON.stringify(spec, null, 2)}\n`, 'utf8')
  await writeFile(path.join(outputDir, 'asset-map.json'), `${JSON.stringify(assetBatch, null, 2)}\n`, 'utf8')
  await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await writeFile(path.join(outputDir, 'README.md'), renderGeneratedReadme(spec), 'utf8')

  await Promise.all(
    spec.pages.map((page, index) => {
      return writeFile(
        path.join(pagesDir, `${page.id}.html`),
        renderPageHtml(spec, page, index),
        'utf8'
      )
    })
  )

  console.log(`Wrote generated project to frontend/public/generated/${outputSlug}`)
  console.log(`Open /make?project=${outputSlug} to inspect the 15-page canvas.`)
}

async function readEnv(filePath) {
  const text = await readFile(filePath, 'utf8')
  const env = {}

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const equalsIndex = line.indexOf('=')
    if (equalsIndex === -1) continue

    const key = line.slice(0, equalsIndex).trim()
    const value = line.slice(equalsIndex + 1).trim()
    env[key] = stripQuotes(value)
  }

  for (const key of Object.keys(env)) {
    env[key] = resolveEnvValue(env[key], env)
  }

  return env
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function resolveEnvValue(value, env, seen = new Set()) {
  return String(value || '').replace(/\$\{([^}]+)\}/g, (_, key) => {
    if (seen.has(key)) return ''
    seen.add(key)
    return resolveEnvValue(env[key] || '', env, seen)
  })
}

function readGpt55Config(env) {
  const apiKey = env.VITE_GPT55_API_KEY || env.model_gpt_key || ''
  if (!apiKey) {
    throw new Error('Missing VITE_GPT55_API_KEY/model_gpt_key in workspace .env')
  }

  return {
    baseUrl: env.VITE_GPT55_BASE_URL || 'https://api.ai6800.com',
    endpoint: env.VITE_GPT55_CHAT_PATH || '/v1/chat/completions',
    model: env.VITE_GPT55_MODEL || 'gpt-5.5',
    apiKey
  }
}

async function generateProjectSpec(config) {
  const shell = await generateProjectShell(config)
  const pages = []

  for (let start = 0; start < expectedPages.length; start += 5) {
    const batch = expectedPages.slice(start, start + 5)
    const batchPages = await generatePageBatch(config, shell, batch, start)
    pages.push(...batchPages)
  }

  return { ...shell, pages }
}

async function generateProjectShell(config) {
  const messages = [
    {
      role: 'system',
      content: [
        '你是资深产品经理、移动端 UX 设计师和电商增长设计师。',
        '你必须只输出有效 JSON，不要 Markdown，不要解释。',
        '内容必须能直接用于移动端 HTML 页面生成。'
      ].join('\n')
    },
    {
      role: 'user',
      content: buildShellPrompt()
    }
  ]

  const text = await callChatCompletion(config, {
    model: config.model,
    messages,
    temperature: 0.5,
    max_tokens: 3600
  })

  const shell = tryParseSpec(text)
  if (!shell || typeof shell !== 'object') {
    throw new Error('GPT-5.5 did not return a valid project shell JSON')
  }

  return shell
}

async function generatePageBatch(config, shell, batch, startIndex) {
  const messages = [
    {
      role: 'system',
      content: [
        '你是资深产品经理、移动端 UX 设计师和电商增长设计师。',
        '你必须只输出有效 JSON，不要 Markdown，不要解释。',
        '内容必须能直接用于移动端 HTML 页面生成。'
      ].join('\n')
    },
    {
      role: 'user',
      content: buildPageBatchPrompt(shell, batch, startIndex)
    }
  ]

  let text = await callChatCompletion(config, {
    model: config.model,
    messages,
    temperature: 0.58,
    max_tokens: 9000
  })

  let spec = tryParseSpec(text)
  if (spec && isValidPageBatch(spec, batch.length)) return spec.pages

  text = await callChatCompletion(config, {
    model: config.model,
    messages: [
      messages[0],
      {
        role: 'user',
        content: [
          '下面的输出不是可用的严格 JSON，或者 pages 不是 15 个。',
          '请修复为严格 JSON，仍然只输出 JSON，不要 Markdown。',
          `必须保留海鲜配送 App 的真实业务细节，并且 pages 正好 ${batch.length} 个。`,
          '',
          text.slice(0, 22000)
        ].join('\n')
      }
    ],
    temperature: 0.2,
    max_tokens: 9000
  })

  spec = tryParseSpec(text)
  if (!spec || !isValidPageBatch(spec, batch.length)) {
    throw new Error(`GPT-5.5 did not return a valid page batch starting at ${startIndex + 1}`)
  }
  return spec.pages
}

function buildShellPrompt() {
  return [
    '为一个面向中国城市家庭、餐厅小店和办公室团购的「海鲜配送 App」生成项目级产品和 UI 设计规格。',
    '项目目标：用户能浏览海鲜、查看产地和鲜度、加入购物车、选择配送时间、支付、追踪冷链订单、管理会员和企业采购。',
    '视觉气质：专业、干净、高信任感、有鲜活海洋感，但不能像营销落地页；要像真实可用的移动电商 App。',
    '',
    '必须严格输出以下 JSON 结构，不要包含 pages：',
    JSON.stringify({
      brandName: '品牌名',
      tagline: '一句中文品牌主张',
      summary: '产品摘要',
      designDirection: '视觉方向说明',
      tokens: {
        primary: '#006C70',
        secondary: '#0EA5A4',
        accent: '#F59E0B',
        ink: '#102033',
        muted: '#607080',
        background: '#F2FAFA',
        surface: '#FFFFFF',
        line: '#D6E7EA',
        success: '#138A5B',
        danger: '#C2410C'
      },
      nav: [
        { label: '首页', route: '/' },
        { label: '分类', route: '/categories' },
        { label: '购物车', route: '/cart' },
        { label: '订单', route: '/orders' },
        { label: '我的', route: '/profile' }
      ]
    }, null, 2),
    '',
    '要求：',
    '- 品牌名和文案必须是中文，可商业化，不要像测试数据。',
    '- tokens 必须是可用十六进制颜色。',
    '- nav 必须适合移动端底部导航，最多 5 项。'
  ].join('\n')
}

function buildPageBatchPrompt(shell, batch, startIndex) {
  return [
    `继续为「${shell.brandName || '海鲜配送 App'}」生成第 ${startIndex + 1} 到 ${startIndex + batch.length} 页的页面级设计规格。`,
    `品牌主张：${shell.tagline || ''}`,
    `产品摘要：${shell.summary || ''}`,
    `视觉方向：${shell.designDirection || ''}`,
    '',
    '必须严格输出以下 JSON 结构：',
    JSON.stringify({
      pages: [
        {
          id: 'home',
          title: '首页',
          route: '/',
          goal: '页面目标',
          hero: {
            eyebrow: '短标签',
            title: '主标题',
            description: '2 句以内说明',
            primaryAction: '主按钮',
            secondaryAction: '次按钮'
          },
          metrics: [
            { label: '指标名', value: '指标值' },
            { label: '指标名', value: '指标值' },
            { label: '指标名', value: '指标值' }
          ],
          cards: [
            { title: '卡片标题', body: '卡片正文', meta: '补充信息' },
            { title: '卡片标题', body: '卡片正文', meta: '补充信息' },
            { title: '卡片标题', body: '卡片正文', meta: '补充信息' }
          ],
          sections: [
            { title: '区块标题', items: ['要点 1', '要点 2', '要点 3'] },
            { title: '区块标题', items: ['要点 1', '要点 2', '要点 3'] }
          ],
          workflow: ['流程节点 1', '流程节点 2', '流程节点 3'],
          sidebar: { title: '辅助信息标题', items: ['信息 1', '信息 2', '信息 3'] }
        }
      ]
    }, null, 2),
    '',
    `pages 必须正好 ${batch.length} 个，并且按这个顺序生成：`,
    batch.map((page, index) => `${startIndex + index + 1}. ${page.id} · ${page.title} · ${page.route}`).join('\n'),
    '',
    '要求：',
    '- 每页都要有真实业务文案，不要写“示例”“占位”“Lorem”。',
    '- 每页 cards 至少 3 个，sections 至少 2 个，每个 section 至少 3 个 items。',
    '- 内容要覆盖产地溯源、鲜度标签、冷链配送、售后保障、会员权益、企业采购。',
    '- 当前批次里的每个页面都要和它的页面标题、路径、业务目标强相关。'
  ].join('\n')
}

async function callChatCompletion(config, body) {
  const url = joinUrl(config.baseUrl, config.endpoint)
  let lastError = null

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 180000)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      const responseText = await response.text()
      if (!response.ok) {
        throw new Error(`GPT-5.5 request failed: HTTP ${response.status} ${responseText.slice(0, 300)}`)
      }

      const data = JSON.parse(responseText)
      const text = data.choices?.[0]?.message?.content || data.output_text || ''
      if (!text.trim()) throw new Error('GPT-5.5 returned empty content')
      return text
    } catch (error) {
      lastError = error
      const message = String(error?.message || error)
      const canRetry = /HTTP 429|HTTP 500|HTTP 502|HTTP 503|timeout|aborted/i.test(message)
      if (!canRetry || attempt === 3) break
      console.log(`Transient GPT-5.5 error, retrying attempt ${attempt + 1}/3...`)
      await sleep(2500 * attempt)
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError
}

function joinUrl(baseUrl, endpoint) {
  return `${String(baseUrl).replace(/\/+$/, '')}/${String(endpoint).replace(/^\/+/, '')}`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function tryParseSpec(text) {
  try {
    return JSON.parse(extractJson(text))
  } catch {
    return null
  }
}

function extractJson(text) {
  const raw = String(text || '').trim()
  if (raw.startsWith('{') && raw.endsWith('}')) return raw
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return raw
  return raw.slice(start, end + 1)
}

function isValidPageBatch(spec, expectedCount) {
  return Boolean(spec && Array.isArray(spec.pages) && spec.pages.length === expectedCount)
}

function normalizeSpec(rawSpec) {
  const tokens = { ...fallbackTokens, ...(rawSpec.tokens || {}) }
  const pages = expectedPages.map((expected, index) => normalizePage(rawSpec.pages[index] || {}, expected, index))
  const nav = normalizeNav(rawSpec.nav, pages)

  return {
    id: outputSlug,
    generatedAt: new Date().toISOString(),
    brandName: safeText(rawSpec.brandName, '鲜潮达'),
    tagline: safeText(rawSpec.tagline, '鲜活海产，当日冷链到家'),
    summary: safeText(rawSpec.summary, '面向家庭、办公室和餐饮小店的海鲜即时配送 App，覆盖选购、结算、冷链追踪、会员和企业采购。'),
    designDirection: safeText(rawSpec.designDirection, '以清洁的海洋青、冰白背景和琥珀价格强调构成高信任移动电商体验。'),
    tokens,
    nav,
    pages
  }
}

function normalizeNav(nav, pages) {
  const fallback = ['home', 'categories', 'cart', 'orders', 'profile']
    .map((id) => pages.find((page) => page.id === id))
    .filter(Boolean)
    .map((page) => ({ label: page.title, route: page.route }))

  if (!Array.isArray(nav) || nav.length < 3) return fallback
  return nav.slice(0, 5).map((item, index) => ({
    label: safeText(item.label, fallback[index]?.label || `导航 ${index + 1}`),
    route: safeText(item.route, fallback[index]?.route || '/')
  }))
}

function normalizePage(page, expected, index) {
  const sections = Array.isArray(page.sections) && page.sections.length
    ? page.sections.slice(0, 3).map((section, sectionIndex) => normalizeSection(section, sectionIndex))
    : defaultSections(expected.title)

  return {
    id: expected.id,
    title: safeText(page.title, expected.title),
    route: expected.route,
    goal: safeText(page.goal, `${expected.title}用于完成海鲜配送 App 的核心流程。`),
    hero: normalizeHero(page.hero, expected.title),
    metrics: normalizeMetrics(page.metrics, index),
    cards: normalizeCards(page.cards, expected.title),
    sections,
    workflow: normalizeStringList(page.workflow, ['浏览鲜货', '确认规格', '选择冷链配送', '完成支付'], 4),
    sidebar: {
      title: safeText(page.sidebar?.title, `${expected.title}提醒`),
      items: normalizeStringList(page.sidebar?.items, ['支持售后极速响应', '冷链温控全程记录', '可查看产地和检测信息'], 3)
    }
  }
}

function normalizeHero(hero, title) {
  return {
    eyebrow: safeText(hero?.eyebrow, '今日冷链鲜达'),
    title: safeText(hero?.title, title),
    description: safeText(hero?.description, '从产地、仓配到签收全流程可追踪，适合家庭采购、办公室团购和餐饮小店补货。'),
    primaryAction: safeText(hero?.primaryAction, '立即选购'),
    secondaryAction: safeText(hero?.secondaryAction, '查看溯源')
  }
}

function normalizeMetrics(metrics, index) {
  const fallback = [
    { label: '最快送达', value: index % 2 === 0 ? '29 分钟' : '45 分钟' },
    { label: '冷链温区', value: '0-4C' },
    { label: '售后响应', value: '15 分钟' }
  ]

  if (!Array.isArray(metrics) || !metrics.length) return fallback
  return metrics.slice(0, 3).map((metric, metricIndex) => ({
    label: safeText(metric.label, fallback[metricIndex]?.label || '指标'),
    value: safeText(metric.value, fallback[metricIndex]?.value || '--')
  }))
}

function normalizeCards(cards, title) {
  const fallback = [
    { title: `${title}精选`, body: '按鲜度、产地、规格和配送时段组织信息，减少用户判断成本。', meta: '平台严选' },
    { title: '冷链保障', body: '展示入仓时间、温控记录和配送进度，增强履约信任。', meta: '全程可追踪' },
    { title: '无忧售后', body: '坏单、少件和规格不符可快速提交凭证，客服优先处理。', meta: '先赔后核' }
  ]

  if (!Array.isArray(cards) || cards.length < 3) return fallback
  return cards.slice(0, 5).map((card, index) => ({
    title: safeText(card.title, fallback[index % fallback.length].title),
    body: safeText(card.body, fallback[index % fallback.length].body),
    meta: safeText(card.meta, fallback[index % fallback.length].meta)
  }))
}

function normalizeSection(section, index) {
  return {
    title: safeText(section.title, `业务区块 ${index + 1}`),
    items: normalizeStringList(section.items, ['产地信息完整', '规格价格清晰', '配送承诺可见'], 3)
  }
}

function defaultSections(title) {
  return [
    {
      title: `${title}核心信息`,
      items: ['展示鲜度等级和产地批次', '突出当日可送时段', '提供规格、重量和处理方式']
    },
    {
      title: '履约和信任',
      items: ['冷链温控记录可查看', '签收异常可快速售后', '会员和企业客户可复购']
    }
  ]
}

function normalizeStringList(items, fallback, minCount) {
  const list = Array.isArray(items) ? items.map((item) => safeText(item, '')).filter(Boolean) : []
  while (list.length < minCount) list.push(fallback[list.length % fallback.length])
  return list.slice(0, Math.max(minCount, Math.min(5, list.length)))
}

function safeText(value, fallback) {
  const text = String(value || '').trim()
  return text || fallback
}

function buildAssetBatch(spec) {
  const assets = spec.pages.map((page, index) => ({
    id: `asset-${String(index + 1).padStart(2, '0')}`,
    fileName: `${page.id}-visual.png`,
    purpose: `${page.title}页面的核心海鲜视觉资产`,
    size: index % 3 === 0 ? '1024x1024' : index % 3 === 1 ? '1536x1024' : '1024x1536',
    transparent: index % 4 === 0,
    status: 'planned',
    webPath: `/assets/${page.id}-visual.png`,
    prompt: [
      `为${spec.brandName}的${page.title}页面生成高端、真实、干净的海鲜配送 App 视觉资产。`,
      `主题：${page.hero.title}。`,
      '要求：鲜活海产、冷链可信赖、移动电商可用，不包含 UI 文字，不生成按钮和表单。'
    ].join('')
  }))

  return {
    requestedCount: assets.length,
    generatedCount: 0,
    summary: '本次 15 页 HTML 已生成；切图资产已按页面规划好 image2 提示词，可继续批量调用图生图 Agent。',
    assets
  }
}

function buildManifest(spec, assetBatch) {
  const pages = spec.pages.map((page) => ({
    id: page.id,
    title: page.title,
    route: page.route,
    viewport: 'mobile',
    srcdocPath: `pages/${page.id}.html`
  }))

  return {
    id: outputSlug,
    title: `${spec.brandName} · 15 页海鲜配送 App`,
    summary: `${spec.brandName}已生成 15 个移动端 HTML 页面，并在画布中以多页面节点展示。`,
    focusedRunId: 'seafood-real-html',
    generatedAt: spec.generatedAt,
    runs: [
      {
        id: 'seafood-real-html',
        createdAt: spec.generatedAt,
        stageId: 'stage-7',
        stageTitle: 'HTML/CSS/JS 还原页面',
        agent: {
          type: 'code-restore-agent',
          name: '图生 HTML 还原 Agent',
          description: '根据 GPT-5.5 生成的产品规格和设计规格输出多页面 HTML。',
          mode: 'image-to-html'
        },
        reply: `${spec.brandName}的 15 个页面已生成为独立 HTML 文件，当前画布可同时查看和拖动每个页面。`,
        handoffPrompt: `把${spec.brandName}的 15 页移动端 HTML 继续整理为 Vue 路由、组件和设计 token。`,
        requiredInputs: ['project-spec.json', 'asset-map.json', 'design-tokens-final.json'],
        expectedOutputs: ['pages/*.html', 'manifest.json', 'responsive-checklist.md'],
        checklist: ['15 个页面数量正确', '页面可在 iPhone 比例画布查看', '核心购买、结算、追踪、会员流程完整', '切图资产已规划'],
        nextActions: ['调用 image2-assets-agent 生成真实图片资产', '将内联 HTML 拆分为 Vue 组件', '接入真实商品和订单 API'],
        suggestedStatus: 'active',
        htmlPagesArtifact: pages
      },
      {
        id: 'seafood-real-qa',
        createdAt: spec.generatedAt,
        stageId: 'stage-8',
        stageTitle: '截图和视觉验收',
        agent: {
          type: 'qa-agent',
          name: '视觉 QA Agent',
          description: '对 15 页移动端 HTML 做视觉一致性和产品完整性检查。',
          mode: 'image-compare'
        },
        reply: '已生成验收清单：重点检查 iPhone 比例、页面连线、购买链路、冷链追踪和企业采购入口。',
        checklist: ['检查所有 iframe 渲染', '检查导航和 CTA 一致性', '检查画布拖动和连线', '检查移动端文本不溢出'],
        nextActions: ['运行浏览器截图验收', '补充真实 image2 切图'],
        suggestedStatus: 'active',
        qaArtifact: {
          score: '92/100',
          issues: [
            {
              level: 'medium',
              title: '真实商品图片待生成',
              detail: '当前 HTML 使用 CSS 视觉承载产品图区域，下一步应调用 image2 批量生成 15 张页面主视觉。'
            },
            {
              level: 'low',
              title: '订单和支付数据为静态内容',
              detail: '页面结构完整，接入后端订单 API 后可替换为真实状态。'
            }
          ]
        }
      },
      {
        id: 'seafood-real-assets',
        createdAt: spec.generatedAt,
        stageId: 'stage-6',
        stageTitle: '图生图切图资产',
        agent: {
          type: 'image2-assets-agent',
          name: 'image2 图生图切图 Agent',
          description: '把每个页面需要的复杂视觉资产整理为 image2 可执行提示词。',
          mode: 'image-to-image'
        },
        reply: '已按 15 页页面规划 15 张核心切图资产，每张包含用途、尺寸、透明背景建议和 image2 提示词。',
        checklist: ['资产只覆盖复杂视觉', '文字按钮由 HTML/CSS 实现', '每页至少一张可选主视觉'],
        nextActions: ['按固定 15 张调用 image2 生成', '写入 assets 并替换 HTML CSS 视觉区域'],
        suggestedStatus: 'planned',
        assetBatchArtifact: assetBatch
      },
      {
        id: 'seafood-real-spec',
        createdAt: spec.generatedAt,
        stageId: 'stage-5',
        stageTitle: '输出结构化设计规格',
        agent: {
          type: 'gemini-spec-agent',
          name: 'Gemini 结构化标注 Agent',
          description: '整理页面结构、设计 token 和模块清单。',
          mode: 'image-to-json'
        },
        reply: '已沉淀 15 页设计规格、导航结构、设计 token 和页面模块。',
        checklist: ['页面列表完整', 'Token 可复用', '核心流程覆盖'],
        nextActions: ['进入图生 HTML 还原', '生成真实切图资产'],
        suggestedStatus: 'done',
        specArtifact: {
          sections: spec.pages.map((page) => page.title),
          tokens: Object.entries(spec.tokens).map(([key, value]) => `${key}: ${value}`)
        }
      },
      {
        id: 'seafood-real-product',
        createdAt: spec.generatedAt,
        stageId: 'stage-1',
        stageTitle: '生成产品原型',
        agent: {
          type: 'product-agent',
          name: '产品原型 Agent',
          description: '拆解海鲜配送 App 的核心用户、页面和业务链路。',
          mode: 'text-to-spec'
        },
        reply: spec.summary,
        checklist: ['用户画像明确', '15 页路径完整', '下单和追踪闭环成立'],
        nextActions: ['生成 UI 设计稿', '生成页面 HTML'],
        suggestedStatus: 'done',
        productArtifact: {
          audience: '城市家庭、办公室团购、餐饮小店和高频海鲜复购用户',
          p0Pages: spec.pages.map((page) => page.title)
        },
        designArtifact: {
          brand: spec.brandName,
          tagline: spec.tagline,
          palette: Object.values(spec.tokens).slice(0, 6),
          sections: spec.pages.slice(0, 4).map((page) => ({ title: page.title, text: page.goal })),
          products: spec.pages.slice(0, 4).map((page, index) => ({
            name: page.cards[0]?.title || page.title,
            price: index % 2 === 0 ? '¥39.9 起' : '¥68.0 起',
            tag: page.hero.eyebrow
          }))
        }
      }
    ]
  }
}

function renderGeneratedReadme(spec) {
  return [
    `# ${spec.brandName} · 15 页海鲜配送 App`,
    '',
    `生成时间：${spec.generatedAt}`,
    '',
    spec.summary,
    '',
    '## 页面',
    '',
    ...spec.pages.map((page, index) => `${index + 1}. ${page.title} · ${page.route} · \`pages/${page.id}.html\``),
    '',
    '## 查看方式',
    '',
    `启动前端后打开：\`/make?project=${outputSlug}\``,
    ''
  ].join('\n')
}

function renderPageHtml(spec, page, index) {
  const token = spec.tokens
  const nav = spec.nav
  const metrics = page.metrics.slice(0, 3)
  const primaryCards = page.cards.slice(0, 3)
  const secondaryCards = page.cards.slice(3, 5)
  const heroTone = index % 3

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(spec.brandName)} · ${escapeHtml(page.title)}</title>
  <style>
    :root {
      --primary: ${cssColor(token.primary, fallbackTokens.primary)};
      --secondary: ${cssColor(token.secondary, fallbackTokens.secondary)};
      --accent: ${cssColor(token.accent, fallbackTokens.accent)};
      --ink: ${cssColor(token.ink, fallbackTokens.ink)};
      --muted: ${cssColor(token.muted, fallbackTokens.muted)};
      --background: ${cssColor(token.background, fallbackTokens.background)};
      --surface: ${cssColor(token.surface, fallbackTokens.surface)};
      --line: ${cssColor(token.line, fallbackTokens.line)};
      --success: ${cssColor(token.success, fallbackTokens.success)};
      --danger: ${cssColor(token.danger, fallbackTokens.danger)};
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background: var(--background);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }

    button,
    input {
      font: inherit;
    }

    .app {
      min-height: 100vh;
      padding: 14px 14px 76px;
      background:
        radial-gradient(circle at 18% 0%, rgba(14, 165, 164, 0.16), transparent 28%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(242, 250, 250, 0.96) 38%, #fff 100%);
    }

    .topbar {
      display: grid;
      grid-template-columns: 42px 1fr 42px;
      align-items: center;
      gap: 10px;
      min-height: 48px;
    }

    .icon-btn {
      width: 42px;
      height: 42px;
      border: 1px solid rgba(16, 32, 51, 0.08);
      border-radius: 8px;
      color: var(--ink);
      background: rgba(255, 255, 255, 0.88);
      font-weight: 900;
    }

    .brand {
      min-width: 0;
      text-align: center;
    }

    .brand strong,
    .brand span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .brand strong {
      font-size: 15px;
    }

    .brand span {
      margin-top: 2px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
    }

    .hero {
      position: relative;
      overflow: hidden;
      margin-top: 12px;
      padding: 18px;
      border: 1px solid rgba(255, 255, 255, 0.72);
      border-radius: 10px;
      color: #fff;
      background:
        linear-gradient(135deg, rgba(0, 108, 112, 0.96), rgba(14, 165, 164, 0.86)),
        linear-gradient(45deg, var(--primary), var(--secondary));
      box-shadow: 0 16px 34px rgba(0, 108, 112, 0.18);
    }

    .hero.tone-1 {
      background:
        linear-gradient(135deg, rgba(16, 32, 51, 0.95), rgba(0, 108, 112, 0.88)),
        linear-gradient(45deg, var(--primary), var(--secondary));
    }

    .hero.tone-2 {
      background:
        linear-gradient(135deg, rgba(5, 80, 86, 0.94), rgba(245, 158, 11, 0.74)),
        linear-gradient(45deg, var(--primary), var(--accent));
    }

    .hero::after {
      content: "";
      position: absolute;
      right: -40px;
      bottom: -52px;
      width: 170px;
      height: 170px;
      border: 28px solid rgba(255, 255, 255, 0.16);
      border-radius: 999px;
    }

    .hero-content {
      position: relative;
      z-index: 1;
      display: grid;
      gap: 12px;
    }

    .eyebrow {
      width: fit-content;
      max-width: 100%;
      padding: 6px 9px;
      border: 1px solid rgba(255, 255, 255, 0.28);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.14);
      font-size: 11px;
      font-weight: 900;
    }

    h1 {
      margin: 0;
      font-size: 28px;
      line-height: 1.08;
      letter-spacing: 0;
    }

    .hero p {
      margin: 0;
      max-width: 31em;
      color: rgba(255, 255, 255, 0.86);
      font-size: 13px;
      line-height: 1.62;
    }

    .hero-actions {
      display: flex;
      gap: 9px;
      flex-wrap: wrap;
    }

    .hero-actions button {
      min-height: 38px;
      padding: 0 13px;
      border: 0;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 900;
    }

    .hero-actions button:first-child {
      color: var(--ink);
      background: #fff;
    }

    .hero-actions button:last-child {
      color: #fff;
      background: rgba(255, 255, 255, 0.18);
    }

    .visual-card {
      position: relative;
      min-height: 132px;
      margin-top: 14px;
      overflow: hidden;
      border-radius: 10px;
      background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(222, 247, 246, 0.88)),
        #fff;
    }

    .visual-card::before,
    .visual-card::after {
      content: "";
      position: absolute;
      border-radius: 999px;
    }

    .visual-card::before {
      left: 22px;
      top: 22px;
      width: 92px;
      height: 70px;
      background:
        radial-gradient(circle at 34% 40%, rgba(245, 158, 11, 0.92), transparent 18%),
        linear-gradient(135deg, rgba(0, 108, 112, 0.94), rgba(14, 165, 164, 0.82));
      box-shadow: 100px 26px 0 -18px rgba(245, 158, 11, 0.76), 148px -4px 0 -24px rgba(0, 108, 112, 0.72);
      transform: rotate(-8deg);
    }

    .visual-card::after {
      right: 28px;
      bottom: 18px;
      width: 106px;
      height: 54px;
      border: 13px solid rgba(14, 165, 164, 0.2);
      border-left-color: rgba(245, 158, 11, 0.34);
      transform: rotate(12deg);
    }

    .visual-card span {
      position: absolute;
      left: 18px;
      bottom: 15px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 900;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-top: 12px;
    }

    .metric {
      min-width: 0;
      padding: 11px 9px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.9);
    }

    .metric strong,
    .metric span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .metric strong {
      color: var(--primary);
      font-size: 16px;
    }

    .metric span {
      margin-top: 3px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 850;
    }

    .search {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      margin-top: 12px;
    }

    .search input {
      min-width: 0;
      height: 42px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 13px;
      background: #fff;
      color: var(--ink);
      outline: 0;
    }

    .search button {
      width: 74px;
      border: 0;
      border-radius: 8px;
      color: #fff;
      background: var(--primary);
      font-size: 12px;
      font-weight: 900;
    }

    .section {
      margin-top: 18px;
    }

    .section-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }

    .section-head h2 {
      margin: 0;
      font-size: 18px;
      line-height: 1.2;
      letter-spacing: 0;
    }

    .section-head span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 900;
      white-space: nowrap;
    }

    .card-list {
      display: grid;
      gap: 10px;
    }

    .product-card {
      display: grid;
      grid-template-columns: 78px 1fr;
      gap: 12px;
      min-width: 0;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 9px;
      background: #fff;
      box-shadow: 0 8px 20px rgba(16, 32, 51, 0.06);
    }

    .thumb {
      min-height: 78px;
      border-radius: 8px;
      background:
        radial-gradient(circle at 36% 38%, rgba(245, 158, 11, 0.88), transparent 20%),
        linear-gradient(135deg, rgba(0, 108, 112, 0.86), rgba(14, 165, 164, 0.18)),
        #e7fbfb;
    }

    .product-card h3,
    .product-card p {
      margin: 0;
    }

    .product-card h3 {
      font-size: 14px;
      line-height: 1.25;
    }

    .product-card p {
      margin-top: 5px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.48;
    }

    .product-meta {
      display: flex;
      align-items: center;
      gap: 7px;
      flex-wrap: wrap;
      margin-top: 8px;
    }

    .pill {
      max-width: 100%;
      padding: 5px 7px;
      border-radius: 999px;
      color: var(--primary);
      background: rgba(14, 165, 164, 0.1);
      font-size: 10px;
      font-weight: 900;
    }

    .price {
      margin-left: auto;
      color: var(--accent);
      font-size: 15px;
      font-weight: 950;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .info-card {
      min-width: 0;
      padding: 13px;
      border: 1px solid var(--line);
      border-radius: 9px;
      background: #fff;
    }

    .info-card strong {
      display: block;
      font-size: 13px;
      line-height: 1.3;
    }

    .info-card ul {
      display: grid;
      gap: 6px;
      margin: 9px 0 0;
      padding: 0;
      list-style: none;
    }

    .info-card li {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.4;
    }

    .workflow {
      display: grid;
      gap: 8px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 9px;
      background: #fff;
    }

    .step {
      display: grid;
      grid-template-columns: 24px 1fr;
      gap: 9px;
      align-items: start;
    }

    .step b {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 999px;
      color: #fff;
      background: var(--primary);
      font-size: 11px;
    }

    .step span {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.55;
    }

    .side-note {
      margin-top: 14px;
      padding: 13px;
      border: 1px solid rgba(245, 158, 11, 0.28);
      border-radius: 9px;
      background: rgba(245, 158, 11, 0.08);
    }

    .side-note strong {
      display: block;
      font-size: 13px;
    }

    .side-note ul {
      display: grid;
      gap: 6px;
      margin: 8px 0 0;
      padding-left: 16px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }

    .bottom-nav {
      position: fixed;
      left: 14px;
      right: 14px;
      bottom: 12px;
      display: grid;
      grid-template-columns: repeat(${Math.min(nav.length, 5)}, minmax(0, 1fr));
      gap: 4px;
      padding: 7px;
      border: 1px solid rgba(16, 32, 51, 0.08);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.94);
      box-shadow: 0 14px 36px rgba(16, 32, 51, 0.14);
      backdrop-filter: blur(18px);
    }

    .bottom-nav a {
      min-width: 0;
      padding: 8px 4px;
      border-radius: 8px;
      color: var(--muted);
      text-align: center;
      text-decoration: none;
      font-size: 11px;
      font-weight: 900;
    }

    .bottom-nav a.is-active {
      color: #fff;
      background: var(--primary);
    }

    @media (min-width: 700px) {
      .app {
        max-width: 430px;
        margin: 0 auto;
      }
    }
  </style>
</head>
<body>
  <main class="app">
    <header class="topbar">
      <button class="icon-btn" type="button" aria-label="菜单">≡</button>
      <div class="brand">
        <strong>${escapeHtml(spec.brandName)}</strong>
        <span>${escapeHtml(page.title)} · ${escapeHtml(page.route)}</span>
      </div>
      <button class="icon-btn" type="button" aria-label="消息">••</button>
    </header>

    <section class="hero tone-${heroTone}">
      <div class="hero-content">
        <span class="eyebrow">${escapeHtml(page.hero.eyebrow)}</span>
        <h1>${escapeHtml(page.hero.title)}</h1>
        <p>${escapeHtml(page.hero.description)}</p>
        <div class="hero-actions">
          <button type="button">${escapeHtml(page.hero.primaryAction)}</button>
          <button type="button">${escapeHtml(page.hero.secondaryAction)}</button>
        </div>
      </div>
    </section>

    <section class="visual-card" aria-label="页面主视觉">
      <span>${escapeHtml(page.goal)}</span>
    </section>

    <section class="metrics" aria-label="关键指标">
      ${metrics.map((metric) => `
      <article class="metric">
        <strong>${escapeHtml(metric.value)}</strong>
        <span>${escapeHtml(metric.label)}</span>
      </article>`).join('')}
    </section>

    <form class="search">
      <input aria-label="搜索" value="${escapeAttribute(searchHintFor(page))}">
      <button type="button">筛选</button>
    </form>

    <section class="section">
      <div class="section-head">
        <h2>${escapeHtml(primaryTitleFor(page))}</h2>
        <span>查看全部</span>
      </div>
      <div class="card-list">
        ${primaryCards.map((card, cardIndex) => renderProductCard(card, index, cardIndex)).join('')}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>${escapeHtml(page.sections[0]?.title || '服务细节')}</h2>
        <span>冷链可信</span>
      </div>
      <div class="info-grid">
        ${page.sections.slice(0, 2).map((section) => renderInfoCard(section)).join('')}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>完成路径</h2>
        <span>${escapeHtml(page.hero.eyebrow)}</span>
      </div>
      <div class="workflow">
        ${page.workflow.map((step, stepIndex) => `
        <div class="step">
          <b>${stepIndex + 1}</b>
          <span>${escapeHtml(step)}</span>
        </div>`).join('')}
      </div>
    </section>

    ${secondaryCards.length ? `
    <section class="section">
      <div class="section-head">
        <h2>推荐补充</h2>
        <span>高频使用</span>
      </div>
      <div class="card-list">
        ${secondaryCards.map((card, cardIndex) => renderProductCard(card, index, cardIndex + 3)).join('')}
      </div>
    </section>` : ''}

    <aside class="side-note">
      <strong>${escapeHtml(page.sidebar.title)}</strong>
      <ul>
        ${page.sidebar.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </aside>
  </main>

  <nav class="bottom-nav" aria-label="主导航">
    ${nav.slice(0, 5).map((item) => `
    <a class="${item.route === page.route ? 'is-active' : ''}" href="${escapeAttribute(item.route)}">${escapeHtml(item.label)}</a>`).join('')}
  </nav>
</body>
</html>`
}

function renderProductCard(card, pageIndex, cardIndex) {
  const price = pageIndex % 2 === 0
    ? `¥${39 + pageIndex * 3 + cardIndex * 7}.9`
    : `¥${58 + pageIndex * 2 + cardIndex * 9}.0`

  return `
        <article class="product-card">
          <div class="thumb" aria-hidden="true"></div>
          <div>
            <h3>${escapeHtml(card.title)}</h3>
            <p>${escapeHtml(card.body)}</p>
            <div class="product-meta">
              <span class="pill">${escapeHtml(card.meta)}</span>
              <strong class="price">${escapeHtml(price)}</strong>
            </div>
          </div>
        </article>`
}

function renderInfoCard(section) {
  return `
        <article class="info-card">
          <strong>${escapeHtml(section.title)}</strong>
          <ul>
            ${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
        </article>`
}

function primaryTitleFor(page) {
  if (page.id === 'cart') return '购物车明细'
  if (page.id === 'checkout') return '结算确认'
  if (page.id === 'orders') return '订单状态'
  if (page.id === 'order-tracking') return '冷链追踪'
  if (page.id === 'profile') return '会员权益'
  return '当前推荐'
}

function searchHintFor(page) {
  if (page.id === 'search') return '三文鱼 刺身 当日达'
  if (page.id === 'categories') return '按品类、产地、处理方式筛选'
  if (page.id === 'orders') return '搜索订单号或商品'
  if (page.id === 'business') return '输入企业采购需求'
  return '搜索鲜虾、贝类、刺身、火锅套餐'
}

function cssColor(value, fallback) {
  const text = String(value || '').trim()
  return /^#[0-9a-f]{3,8}$/i.test(text) ? text : fallback
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('\n', ' ')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
