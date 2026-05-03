import JSZip from 'jszip'

const MOBILE_FRAME = {
  width: 390,
  height: 844
}

export async function downloadCompleteProjectPackage(snapshot) {
  const zip = new JSZip()
  const baseName = projectFileBaseName(snapshot)
  const collected = await collectProjectImages(zip, snapshot)
  const localizedHtml = localizeHtmlAssets(snapshot.html || '', collected.files)

  zip.file('index.html', localizedHtml || snapshot.html || '')
  zip.file('README.md', buildHtmlPackageReadme(snapshot, collected))
  zip.file('manifest.json', JSON.stringify(buildPackageManifest(snapshot, collected), null, 2))
  zip.file('metadata/project.json', JSON.stringify(buildProjectJson(snapshot), null, 2))
  zip.file('metadata/asset-map.json', JSON.stringify({ assets: snapshot.assets || [] }, null, 2))
  zip.file('metadata/design-spec.json', JSON.stringify(snapshot.designSpec || {}, null, 2))
  zip.file('metadata/design-node-tree.json', JSON.stringify(buildDesignNodeTree(snapshot), null, 2))
  zip.file('metadata/reviews.json', JSON.stringify(buildReviewsJson(snapshot), null, 2))

  if (collected.external.length) {
    zip.file('metadata/external-assets.json', JSON.stringify(collected.external, null, 2))
    zip.file('assets/external-urls.md', buildExternalAssetsMarkdown(collected.external))
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })
  downloadBlob(blob, `${baseName}-html-assets.zip`, 'application/zip')
}

export async function downloadFigmaImportPackage(snapshot) {
  const zip = new JSZip()
  const baseName = projectFileBaseName(snapshot)
  const collected = await collectProjectImages(zip, snapshot)
  const importData = buildFigmaImportData(snapshot, collected)

  zip.file('README.md', buildFigmaPackageReadme(snapshot))
  zip.file('figma-import-data.json', JSON.stringify(buildFigmaHandoffData(importData), null, 2))
  zip.file('design-node-tree.json', JSON.stringify(buildDesignNodeTree(snapshot), null, 2))
  zip.file('design-tokens.json', JSON.stringify(extractDesignTokens(snapshot), null, 2))
  zip.file('figma-plugin/manifest.json', JSON.stringify(buildFigmaPluginManifest(importData), null, 2))
  zip.file('figma-plugin/code.js', buildFigmaPluginCode())
  zip.file('figma-plugin/ui.html', buildFigmaPluginUi(importData))

  if (snapshot.html) {
    zip.file('source/index.html', localizeHtmlAssets(snapshot.html, collected.files))
  }
  zip.file('source/project.json', JSON.stringify(buildProjectJson(snapshot), null, 2))
  zip.file('source/asset-map.json', JSON.stringify({ assets: snapshot.assets || [] }, null, 2))

  if (collected.external.length) {
    zip.file('source/external-assets.json', JSON.stringify(collected.external, null, 2))
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })
  downloadBlob(blob, `${baseName}-figma-import.zip`, 'application/zip')
}

export function downloadExperimentalFigFile(snapshot) {
  const baseName = projectFileBaseName(snapshot)
  const payload = {
    fileType: 'ai-design-to-web.experimental-fig',
    version: '0.1',
    generatedAt: new Date().toISOString(),
    warning: 'Figma native .fig is a proprietary export format. This file is an experimental design handoff envelope for OpenPencil/agent pipelines. For reliable Figma import, use the generated Figma import ZIP.',
    title: snapshot.title || 'AI Design to Web',
    prompt: snapshot.prompt || '',
    document: buildDesignNodeTree(snapshot),
    figmaImportData: buildFigmaImportData(snapshot, { files: [], external: [] }),
    source: buildProjectJson(snapshot)
  }
  downloadText(`${baseName}.fig`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8')
}

export function buildProjectJson(snapshot) {
  return {
    title: snapshot.title || '',
    prompt: snapshot.prompt || '',
    useReferenceImages: Boolean(snapshot.useReferenceImages),
    referenceImages: snapshot.referenceImages || [],
    design: snapshot.design || null,
    assetPlan: snapshot.assetPlan || null,
    missingAssetScan: snapshot.missingAssetScan || null,
    designDetailReview: snapshot.designDetailReview || null,
    designSpec: snapshot.designSpec || null,
    assets: snapshot.assets || [],
    html: snapshot.html || '',
    htmlScreenshotDataUrl: snapshot.htmlScreenshotDataUrl || '',
    codeReview: snapshot.codeReview || '',
    visualReview: snapshot.visualReview || '',
    htmlDualReview: snapshot.htmlDualReview || null,
    htmlReviewNotes: snapshot.htmlReviewNotes || '',
    generatedAt: snapshot.generatedAt || new Date().toISOString()
  }
}

function buildPackageManifest(snapshot, collected) {
  return {
    name: snapshot.title || 'AI Design to Web export',
    type: 'html-assets-package',
    generatedAt: new Date().toISOString(),
    entry: 'index.html',
    design: stripPackedFileData(collected.files.find((file) => file.kind === 'design')) || null,
    htmlScreenshot: stripPackedFileData(collected.files.find((file) => file.kind === 'html-screenshot')) || null,
    assets: collected.files.filter((file) => file.kind === 'asset').map(stripPackedFileData),
    externalAssets: collected.external
  }
}

function stripPackedFileData(file) {
  if (!file) return null
  const { dataUrl, ...rest } = file
  return rest
}

function buildReviewsJson(snapshot) {
  return {
    codeReview: snapshot.codeReview || '',
    visualReview: snapshot.visualReview || '',
    htmlDualReview: snapshot.htmlDualReview || null,
    htmlReviewNotes: snapshot.htmlReviewNotes || '',
    designDetailReview: snapshot.designDetailReview || null
  }
}

function buildFigmaImportData(snapshot, collected = { files: [], external: [] }) {
  const design = snapshot.design || null
  const designFile = collected.files?.find((file) => file.kind === 'design')
  const htmlScreenshot = collected.files?.find((file) => file.kind === 'html-screenshot')
  const assetFiles = new Map((collected.files || [])
    .filter((file) => file.kind === 'asset')
    .map((file) => [file.id, file]))

  return {
    version: '0.1',
    generatedAt: new Date().toISOString(),
    title: snapshot.title || 'AI Design to Web',
    prompt: snapshot.prompt || '',
    frame: MOBILE_FRAME,
    design: design
      ? {
        id: design.id || 'ui-design',
        fileName: design.fileName || design.name || 'ui-design.png',
        purpose: design.purpose || 'UI 设计图',
        src: designFile?.source || imageSource(design),
        localPath: designFile?.path || '',
        dataUrl: designFile?.dataUrl || dataUrlSource(design)
      }
      : null,
    htmlPreview: snapshot.html
      ? {
        fileName: 'index.html',
        src: htmlScreenshot?.source || snapshot.htmlScreenshotDataUrl || '',
        localPath: htmlScreenshot?.path || '',
        dataUrl: htmlScreenshot?.dataUrl || dataUrlOrEmpty(snapshot.htmlScreenshotDataUrl),
        html: snapshot.html
      }
      : null,
    assets: (snapshot.assets || []).map((asset, index) => {
      const file = assetFiles.get(asset.id || asset.fileName || `${index}`)
      return {
        id: asset.id || `asset-${index + 1}`,
        fileName: asset.fileName || asset.name || `asset-${index + 1}.png`,
        purpose: asset.purpose || '',
        status: asset.status || '',
        src: file?.source || imageSource(asset),
        localPath: file?.path || '',
        dataUrl: file?.dataUrl || dataUrlSource(asset),
        size: asset.size || asset.imageSize || '',
        transparent: Boolean(asset.transparent)
      }
    }),
    tokens: extractDesignTokens(snapshot),
    nodeTree: buildDesignNodeTree(snapshot),
    reviews: buildReviewsJson(snapshot)
  }
}

function buildFigmaHandoffData(importData) {
  return {
    ...importData,
    note: 'Lightweight handoff JSON. Binary image data is kept inside figma-plugin/ui.html for offline Figma import, while this file points to exported assets by localPath/src.',
    design: stripFigmaBinaryData(importData.design),
    htmlPreview: importData.htmlPreview
      ? {
        ...stripFigmaBinaryData(importData.htmlPreview),
        html: undefined,
        htmlSourcePath: 'source/index.html'
      }
      : null,
    assets: (importData.assets || []).map(stripFigmaBinaryData)
  }
}

function stripFigmaBinaryData(item) {
  if (!item) return item
  const { dataUrl, ...rest } = item
  return rest
}

function buildDesignNodeTree(snapshot) {
  const sections = extractHtmlSections(snapshot.html || '')
  const tokens = extractDesignTokens(snapshot)
  return {
    version: '0.1',
    source: 'ai-design-to-web',
    title: snapshot.title || 'AI Design to Web',
    prompt: snapshot.prompt || '',
    viewport: {
      platform: 'mobile',
      width: MOBILE_FRAME.width,
      height: MOBILE_FRAME.height,
      note: 'Use this as the target editable Figma frame size. The original generated image may be higher resolution.'
    },
    tokens,
    root: {
      id: 'root-mobile-frame',
      name: snapshot.title || 'Generated Mobile UI',
      type: 'FRAME',
      bbox: {
        x: 0,
        y: 0,
        width: MOBILE_FRAME.width,
        height: MOBILE_FRAME.height
      },
      semanticRole: 'mobile-screen',
      autoLayout: {
        direction: 'vertical',
        gap: tokens.spacing?.[2]?.value || 12,
        padding: tokens.spacing?.[3]?.value || 16
      },
      children: sections
    },
    assets: (snapshot.assets || []).map((asset) => ({
      id: asset.id || asset.fileName || asset.name,
      name: asset.fileName || asset.name,
      type: 'IMAGE_ASSET',
      purpose: asset.purpose || '',
      url: imageSource(asset),
      transparent: Boolean(asset.transparent),
      htmlHint: asset.prompt || asset.visualBrief || ''
    })),
    designImage: snapshot.design
      ? {
        name: snapshot.design.fileName || snapshot.design.name || 'ui-design.png',
        url: imageSource(snapshot.design),
        purpose: snapshot.design.purpose || 'UI 设计图'
      }
      : null
  }
}

function extractHtmlSections(html) {
  if (!html) return []
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const candidates = Array.from(doc.body.querySelectorAll('header, main > section, main > article, section, article, nav, footer'))
    const nodes = (candidates.length ? candidates : Array.from(doc.body.children)).slice(0, 18)
    return nodes.map((node, index) => {
      const title = node.querySelector('h1,h2,h3,[aria-label]')?.textContent?.trim()
        || node.getAttribute('aria-label')
        || node.className
        || node.tagName.toLowerCase()
      return {
        id: `section-${index + 1}`,
        name: cleanText(title).slice(0, 42) || `Section ${index + 1}`,
        type: sectionTypeForTag(node.tagName),
        semanticRole: semanticRoleForNode(node),
        bbox: null,
        autoLayout: {
          direction: 'vertical',
          gap: 10,
          padding: 12
        },
        fills: [],
        typography: null,
        textContent: collectTexts(node).slice(0, 10),
        imageHints: collectImageHints(node).slice(0, 8),
        htmlHint: compactNodeHtml(node)
      }
    })
  } catch {
    return []
  }
}

function sectionTypeForTag(tagName) {
  const tag = String(tagName || '').toLowerCase()
  if (tag === 'nav') return 'NAVIGATION'
  if (tag === 'footer') return 'BOTTOM_BAR'
  if (tag === 'header') return 'HEADER'
  return 'SECTION'
}

function semanticRoleForNode(node) {
  const text = `${node.tagName} ${node.className || ''} ${node.getAttribute('aria-label') || ''}`.toLowerCase()
  if (/nav|tab|bottom|footer/.test(text)) return 'navigation'
  if (/hero|banner/.test(text)) return 'hero'
  if (/card|product|recommend/.test(text)) return 'content-list'
  if (/search/.test(text)) return 'search'
  return 'content-section'
}

function collectTexts(node) {
  return Array.from(node.querySelectorAll('h1,h2,h3,h4,p,span,strong,button,a,li,label'))
    .map((item) => cleanText(item.textContent))
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
}

function collectImageHints(node) {
  return Array.from(node.querySelectorAll('img'))
    .map((img) => ({
      src: img.getAttribute('src') || '',
      alt: img.getAttribute('alt') || '',
      className: img.className || ''
    }))
    .filter((item) => item.src || item.alt)
}

function compactNodeHtml(node) {
  return node.outerHTML
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()
    .slice(0, 1200)
}

function extractDesignTokens(snapshot) {
  const specTokens = snapshot.designSpec?.tokens || {}
  const cssVars = extractCssVariables(snapshot.html || '')
  return {
    colors: normalizeTokenList(specTokens.colors, cssVars.colors, [
      { name: 'background', value: '#f7f8fa' },
      { name: 'surface', value: '#ffffff' },
      { name: 'primary', value: '#1677ff' },
      { name: 'text', value: '#111827' }
    ]),
    typography: normalizeTokenList(specTokens.typography, [], [
      { name: 'body', value: 'Inter / system 14px' },
      { name: 'title', value: 'Inter / system 24px 700' }
    ]),
    spacing: normalizeTokenList(specTokens.spacing, cssVars.spacing, [
      { name: 'xs', value: 4 },
      { name: 'sm', value: 8 },
      { name: 'md', value: 12 },
      { name: 'lg', value: 16 },
      { name: 'xl', value: 24 }
    ]),
    radius: normalizeTokenList(specTokens.radius, cssVars.radius, [
      { name: 'card', value: 18 },
      { name: 'pill', value: 999 }
    ]),
    shadows: normalizeTokenList(specTokens.shadows, [], [
      { name: 'card', value: '0 12px 30px rgba(15,23,42,.08)' }
    ])
  }
}

function extractCssVariables(html) {
  const vars = {
    colors: [],
    spacing: [],
    radius: []
  }
  const matches = String(html || '').matchAll(/--([a-z0-9-_]+)\s*:\s*([^;}{]+);/gi)
  for (const match of matches) {
    const name = match[1]
    const rawValue = match[2].trim()
    const token = { name, value: rawValue }
    if (/^#|rgb|hsl/i.test(rawValue) || /color|bg|surface|primary|text|border|accent/i.test(name)) {
      vars.colors.push(token)
    } else if (/radius|rounded/i.test(name)) {
      vars.radius.push(token)
    } else if (/space|gap|pad|margin/i.test(name)) {
      vars.spacing.push(token)
    }
  }
  return vars
}

function normalizeTokenList(...groups) {
  const tokens = []
  const seen = new Set()
  groups.flat().filter(Boolean).forEach((item, index) => {
    if (typeof item === 'string') {
      item = { name: `token-${index + 1}`, value: item }
    }
    const name = String(item.name || item.key || item.label || `token-${index + 1}`).trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) return
    seen.add(key)
    tokens.push({
      name,
      value: item.value ?? item.color ?? item.size ?? item
    })
  })
  return tokens.slice(0, 32)
}

async function collectProjectImages(zip, snapshot) {
  const files = []
  const external = []
  const tasks = []
  const usedPaths = new Set()
  const design = snapshot.design || null

  if (design) {
    tasks.push(addImageToZip({
      zip,
      item: design,
      kind: 'design',
      directory: 'assets/design',
      fallbackName: 'ui-design.png',
      files,
      external,
      usedPaths
    }))
  }

  if (snapshot.htmlScreenshotDataUrl) {
    tasks.push(addImageToZip({
      zip,
      item: {
        id: 'html-screenshot',
        fileName: 'html-preview.png',
        resultUrl: snapshot.htmlScreenshotDataUrl,
        purpose: 'HTML 预览截图'
      },
      kind: 'html-screenshot',
      directory: 'assets/preview',
      fallbackName: 'html-preview.png',
      files,
      external,
      usedPaths
    }))
  }

  for (const [index, asset] of (snapshot.assets || []).entries()) {
    tasks.push(addImageToZip({
      zip,
      item: asset,
      kind: 'asset',
      directory: 'assets/generated',
      fallbackName: `asset-${index + 1}.png`,
      files,
      external,
      usedPaths
    }))
  }

  await Promise.all(tasks)

  return { files, external }
}

async function addImageToZip({ zip, item, kind, directory, fallbackName, files, external, usedPaths }) {
  const source = imageSource(item)
  if (!source) return
  const fileName = sanitizeFileName(item.fileName || item.name || fallbackName)
  const finalName = ensureImageExtension(fileName, source)
  const path = uniqueZipPath(`${directory}/${finalName}`, usedPaths)

  try {
    const blob = await loadImageBlob(source)
    zip.file(path, blob)
    const dataUrl = await blobToDataUrl(blob)
    files.push({
      id: item.id || item.fileName || item.name || path,
      kind,
      fileName: finalName,
      path,
      source,
      dataUrl,
      purpose: item.purpose || ''
    })
  } catch (error) {
    external.push({
      id: item.id || item.fileName || item.name || path,
      kind,
      fileName: finalName,
      source,
      purpose: item.purpose || '',
      error: error.message
    })
  }
}

function localizeHtmlAssets(html, files = []) {
  let output = String(html || '')
  files.forEach((file) => {
    if (!file.source || !file.path) return
    output = replaceAssetUrl(output, file.source, file.path)
  })
  return output
}

function replaceAssetUrl(html, source, path) {
  if (!source) return html
  if (source.startsWith('data:')) return html.split(source).join(path)
  let output = html.split(source).join(path)
  const baseSource = source.split('?')[0]
  if (baseSource) {
    const pattern = new RegExp(`${escapeRegExp(baseSource)}(?:\\?[^"'\\s)<>]*)?`, 'g')
    output = output.replace(pattern, path)
  }
  return output
}

async function loadImageBlob(source) {
  if (source.startsWith('data:')) return dataUrlToBlob(source)
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(source, {
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.blob()
  } finally {
    window.clearTimeout(timer)
  }
}

function dataUrlToBlob(dataUrl) {
  const [header, body = ''] = dataUrl.split(',')
  const mime = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream'
  const isBase64 = /;base64/i.test(header)
  const binary = isBase64 ? window.atob(body) : decodeURIComponent(body)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mime })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片转 data URL 失败'))
    reader.readAsDataURL(blob)
  })
}

function dataUrlSource(item) {
  const source = imageSource(item)
  return dataUrlOrEmpty(source)
}

function dataUrlOrEmpty(source) {
  return String(source || '').startsWith('data:') ? source : ''
}

function imageSource(item) {
  return String(item?.resultUrl || item?.downloadUrl || item?.url || item?.src || item?.previewUrl || item?.localUrl || '').trim()
}

function projectFileBaseName(snapshot) {
  const text = snapshot.title || snapshot.prompt || 'ai-design-to-web-export'
  return sanitizeFileName(text).replace(/\.[a-z0-9]+$/i, '').slice(0, 48) || 'ai-design-to-web-export'
}

function sanitizeFileName(value) {
  return String(value || 'file')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 96) || 'file'
}

function uniqueZipPath(path, usedPaths) {
  if (!usedPaths) return path
  if (!usedPaths.has(path)) {
    usedPaths.add(path)
    return path
  }

  const extMatch = path.match(/(\.[a-z0-9]+)$/i)
  const ext = extMatch?.[1] || ''
  const base = ext ? path.slice(0, -ext.length) : path
  let index = 2
  let candidate = `${base}-${index}${ext}`
  while (usedPaths.has(candidate)) {
    index += 1
    candidate = `${base}-${index}${ext}`
  }
  usedPaths.add(candidate)
  return candidate
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function ensureImageExtension(fileName, source) {
  if (/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(fileName)) return fileName
  const mimeExt = String(source || '').match(/^data:image\/([a-z0-9+.-]+)/i)?.[1]
  const urlExt = String(source || '').split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1]
  const ext = normalizeImageExtension(mimeExt || urlExt || 'png')
  return `${fileName}.${ext}`
}

function normalizeImageExtension(value) {
  const ext = String(value || 'png').toLowerCase().replace('jpeg', 'jpg').replace('svg+xml', 'svg')
  return ['png', 'jpg', 'webp', 'gif', 'svg'].includes(ext) ? ext : 'png'
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function downloadText(fileName, content, type = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([content], { type }), fileName, type)
}

function downloadBlob(blob, fileName, type) {
  const finalBlob = blob.type ? blob : new Blob([blob], { type })
  const url = URL.createObjectURL(finalBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 500)
}

function buildHtmlPackageReadme(snapshot, collected) {
  return [
    `# ${snapshot.title || 'AI Design to Web 导出包'}`,
    '',
    '这个 ZIP 包包含当前任务的 HTML、UI 设计图、切图、设计规格、复核报告和可交接给 Figma/OpenPencil 的节点树。',
    '',
    '## 文件',
    '',
    '- `index.html`：已尽量把可下载成功的远程图片替换成本地 `assets/` 路径。',
    '- `assets/design/`：第一步 UI 设计图。',
    '- `assets/generated/`：image2 生成的切图资产。',
    '- `assets/preview/`：HTML 预览截图，存在时会导出。',
    '- `metadata/project.json`：完整项目数据。',
    '- `metadata/design-node-tree.json`：面向 Figma/OpenPencil/Agent 的结构化节点草稿。',
    '',
    collected.external.length
      ? `有 ${collected.external.length} 个远程图片因为 CORS 或网络限制没有写入 ZIP，请查看 \`metadata/external-assets.json\`。`
      : '所有可读取图片都已写入 ZIP。',
    '',
    '## Figma 使用建议',
    '',
    '更推荐下载“Figma 导入包”，里面带有本地 Figma 插件，可以把设计图、HTML 截图和切图作为可整理的画布素材导入。'
  ].join('\n')
}

function buildFigmaPackageReadme(snapshot) {
  return [
    `# ${snapshot.title || 'AI Design to Web Figma 导入包'}`,
    '',
    '这个包用于把当前任务添加到 Figma：包含导入数据、节点树、设计 token、HTML 源码、素材，以及一个本地 Figma 插件。',
    '',
    '## 使用方式',
    '',
    '1. 解压 ZIP。',
    '2. 打开 Figma 桌面端。',
    '3. 进入 Plugins > Development > Import plugin from manifest。',
    '4. 选择 `figma-plugin/manifest.json`。',
    '5. 运行插件 “AI Design to Web Importer”，点击 Import current export。',
    '',
    '插件会创建一个页面，放入 UI 设计图、HTML 效果截图、切图网格和可编辑的规格骨架。HTML 本身不能直接变成完全可编辑 Figma 图层，但这个包已经把后续 Agent/Figma 精修所需材料放在一起。',
    '',
    '## 关于 .fig',
    '',
    'Figma 原生 `.fig` 是非公开格式。项目里的“实验 .fig”导出是给 OpenPencil/Agent 管线读取的 JSON envelope，不保证能被 Figma 直接打开。真正可用的 Figma 路线请使用本 ZIP 的插件导入方式。'
  ].join('\n')
}

function buildExternalAssetsMarkdown(external) {
  return [
    '# External Assets',
    '',
    '这些素材因为浏览器 CORS、URL 过期或网络限制没有写入 ZIP。HTML 中仍保留原 URL。',
    '',
    ...external.map((item, index) => `${index + 1}. ${item.fileName} | ${item.purpose || item.kind} | ${item.source} | ${item.error}`)
  ].join('\n')
}

function buildFigmaPluginManifest(importData) {
  const allowedDomains = collectAllowedDomains(importData)
  return {
    name: 'AI Design to Web Importer',
    id: 'ai-design-to-web-importer',
    api: '1.0.0',
    main: 'code.js',
    ui: 'ui.html',
    editorType: ['figma'],
    documentAccess: 'dynamic-page',
    networkAccess: {
      allowedDomains,
      reasoning: allowedDomains[0] === 'none'
        ? 'Images are embedded in the export data as data URLs.'
        : 'The importer may load exported image URLs when an asset cannot be embedded as a data URL.'
    }
  }
}

function collectAllowedDomains(importData) {
  const urls = [
    importData?.design?.dataUrl ? '' : importData?.design?.src,
    importData?.htmlPreview?.dataUrl ? '' : importData?.htmlPreview?.src,
    ...(importData?.assets || []).map((asset) => (asset.dataUrl ? '' : asset.src))
  ].filter(Boolean)

  const domains = [...new Set(urls.map((url) => {
    try {
      const parsed = new URL(url)
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : ''
    } catch {
      return ''
    }
  }).filter(Boolean))]

  return domains.length ? domains.slice(0, 20) : ['none']
}

function buildFigmaPluginUi(importData) {
  const data = JSON.stringify(importData).replace(/<\/script/gi, '<\\/script')
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; font: 13px Inter, system-ui, sans-serif; color: #111827; background: #f7f8fa; }
    main { padding: 18px; display: grid; gap: 14px; }
    h1 { margin: 0; font-size: 18px; }
    p { margin: 0; color: #4b5563; line-height: 1.5; }
    button { border: 0; border-radius: 8px; background: #1677ff; color: #fff; padding: 11px 14px; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .55; cursor: wait; }
    textarea { width: 100%; min-height: 220px; box-sizing: border-box; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; display: grid; gap: 10px; }
    .status { white-space: pre-wrap; color: #0f766e; }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <h1>AI Design to Web Importer</h1>
      <p>导入当前导出包里的 UI 设计图、HTML 效果截图、切图网格和可编辑规格骨架。</p>
      <button id="import">Import current export</button>
      <p id="status" class="status"></p>
    </section>
    <section class="card">
      <p>需要调整数据时，可以编辑下面 JSON 后再导入。</p>
      <textarea id="data"></textarea>
    </section>
  </main>
  <script id="import-data" type="application/json">${data}</script>
  <script>
    const textArea = document.getElementById('data')
    const status = document.getElementById('status')
    const button = document.getElementById('import')
    textArea.value = document.getElementById('import-data').textContent
    button.onclick = () => {
      button.disabled = true
      status.textContent = 'Importing...'
      try {
        parent.postMessage({ pluginMessage: { type: 'import', data: JSON.parse(textArea.value) } }, '*')
      } catch (error) {
        button.disabled = false
        status.textContent = 'JSON parse failed: ' + error.message
      }
    }
    window.onmessage = (event) => {
      const msg = event.data.pluginMessage
      if (!msg) return
      button.disabled = false
      status.textContent = msg.message || ''
    }
  </script>
</body>
</html>`
}

function buildFigmaPluginCode() {
  return `
figma.showUI(__html__, { width: 520, height: 640 })

figma.ui.onmessage = async (message) => {
  if (message.type !== 'import') return
  try {
    await importAiDesignToWeb(message.data)
    figma.ui.postMessage({ message: 'Imported successfully. You can now edit the page in Figma.' })
  } catch (error) {
    figma.ui.postMessage({ message: 'Import failed: ' + error.message })
  }
}

async function importAiDesignToWeb(data) {
  await loadFonts()
  const page = figma.createPage()
  page.name = safeName(data.title || 'AI Design to Web')
  await figma.setCurrentPageAsync(page)

  const board = figma.createFrame()
  board.name = safeName(data.title || 'AI Design to Web Export')
  board.x = 0
  board.y = 0
  board.resize(1320, 980)
  board.fills = [{ type: 'SOLID', color: hexToRgb('#f7f8fa') }]
  page.appendChild(board)

  await createTitle(board, data)
  await createImagePanel(board, {
    x: 40,
    y: 120,
    title: 'UI Design',
    image: data.design,
    width: data.frame?.width || 390,
    height: data.frame?.height || 844
  })

  await createImagePanel(board, {
    x: 470,
    y: 120,
    title: 'HTML Preview',
    image: data.htmlPreview,
    width: data.frame?.width || 390,
    height: data.frame?.height || 844
  })

  await createAssetGrid(board, data.assets || [], 900, 120)
  await createSpecPanel(board, data, 900, 520)

  figma.viewport.scrollAndZoomIntoView([board])
}

async function loadFonts() {
  const fonts = [
    { family: 'Inter', style: 'Regular' },
    { family: 'Inter', style: 'Medium' },
    { family: 'Inter', style: 'Semi Bold' },
    { family: 'Inter', style: 'Bold' }
  ]
  await Promise.all(fonts.map((font) => figma.loadFontAsync(font).catch(() => null)))
}

async function createTitle(parent, data) {
  const title = figma.createText()
  title.name = 'Project title'
  title.fontName = { family: 'Inter', style: 'Bold' }
  title.fontSize = 26
  title.fills = [{ type: 'SOLID', color: hexToRgb('#111827') }]
  title.characters = data.title || 'AI Design to Web'
  title.x = 40
  title.y = 32
  parent.appendChild(title)

  const prompt = figma.createText()
  prompt.name = 'Prompt'
  prompt.fontName = { family: 'Inter', style: 'Regular' }
  prompt.fontSize = 13
  prompt.lineHeight = { value: 20, unit: 'PIXELS' }
  prompt.fills = [{ type: 'SOLID', color: hexToRgb('#4b5563') }]
  prompt.characters = String(data.prompt || '').slice(0, 220)
  prompt.x = 40
  prompt.y = 68
  prompt.resize(820, 48)
  parent.appendChild(prompt)
}

async function createImagePanel(parent, options) {
  const shell = figma.createFrame()
  shell.name = options.title
  shell.x = options.x
  shell.y = options.y
  shell.resize(options.width + 32, options.height + 72)
  shell.cornerRadius = 18
  shell.fills = [{ type: 'SOLID', color: hexToRgb('#ffffff') }]
  shell.strokes = [{ type: 'SOLID', color: hexToRgb('#e5e7eb') }]
  parent.appendChild(shell)

  const label = figma.createText()
  label.fontName = { family: 'Inter', style: 'Semi Bold' }
  label.fontSize = 14
  label.characters = options.title
  label.x = 16
  label.y = 14
  shell.appendChild(label)

  if (options.image?.dataUrl || options.image?.src) {
    const rect = await createImageRect(options.image.dataUrl || options.image.src, options.width, options.height)
    rect.name = options.image.fileName || options.title
    rect.x = 16
    rect.y = 48
    shell.appendChild(rect)
  } else {
    const empty = figma.createRectangle()
    empty.name = 'Missing image'
    empty.x = 16
    empty.y = 48
    empty.resize(options.width, options.height)
    empty.fills = [{ type: 'SOLID', color: hexToRgb('#eef2ff') }]
    shell.appendChild(empty)
  }
}

async function createAssetGrid(parent, assets, x, y) {
  const title = figma.createText()
  title.name = 'Asset grid title'
  title.fontName = { family: 'Inter', style: 'Bold' }
  title.fontSize = 18
  title.characters = 'Generated Assets'
  title.x = x
  title.y = y
  parent.appendChild(title)

  for (let index = 0; index < Math.min(assets.length, 18); index += 1) {
    const asset = assets[index]
    const col = index % 3
    const row = Math.floor(index / 3)
    const card = figma.createFrame()
    card.name = asset.fileName || 'asset'
    card.x = x + col * 126
    card.y = y + 40 + row * 138
    card.resize(108, 126)
    card.cornerRadius = 12
    card.fills = [{ type: 'SOLID', color: hexToRgb('#ffffff') }]
    card.strokes = [{ type: 'SOLID', color: hexToRgb('#e5e7eb') }]
    parent.appendChild(card)

    if (asset.dataUrl || asset.src) {
      const image = await createImageRect(asset.dataUrl || asset.src, 84, 72).catch(() => null)
      if (image) {
        image.x = 12
        image.y = 12
        card.appendChild(image)
      }
    }

    const label = figma.createText()
    label.fontName = { family: 'Inter', style: 'Regular' }
    label.fontSize = 9
    label.lineHeight = { value: 12, unit: 'PIXELS' }
    label.characters = (asset.fileName || 'asset').slice(0, 32)
    label.x = 10
    label.y = 92
    label.resize(88, 26)
    card.appendChild(label)
  }
}

async function createSpecPanel(parent, data, x, y) {
  const panel = figma.createFrame()
  panel.name = 'Editable spec skeleton'
  panel.x = x
  panel.y = y
  panel.resize(380, 360)
  panel.cornerRadius = 16
  panel.fills = [{ type: 'SOLID', color: hexToRgb('#ffffff') }]
  panel.strokes = [{ type: 'SOLID', color: hexToRgb('#e5e7eb') }]
  parent.appendChild(panel)

  const heading = figma.createText()
  heading.fontName = { family: 'Inter', style: 'Bold' }
  heading.fontSize = 16
  heading.characters = 'Editable Structure'
  heading.x = 18
  heading.y = 16
  panel.appendChild(heading)

  const lines = (data.nodeTree?.root?.children || []).slice(0, 8).map((section, index) => {
    const text = (section.textContent || []).slice(0, 3).join(' / ')
    return (index + 1) + '. ' + section.name + (text ? ' - ' + text : '')
  })

  const body = figma.createText()
  body.fontName = { family: 'Inter', style: 'Regular' }
  body.fontSize = 12
  body.lineHeight = { value: 18, unit: 'PIXELS' }
  body.characters = lines.length ? lines.join('\\n') : 'No HTML structure found. Use design screenshot and assets as references.'
  body.x = 18
  body.y = 50
  body.resize(344, 240)
  panel.appendChild(body)
}

async function createImageRect(src, width, height) {
  const bytes = await fetchBytes(src)
  const image = figma.createImage(bytes)
  const rect = figma.createRectangle()
  rect.resize(width, height)
  rect.cornerRadius = 12
  rect.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }]
  return rect
}

async function fetchBytes(src) {
  if (!src) throw new Error('Missing image source')
  if (src.startsWith('data:')) {
    const body = src.split(',')[1] || ''
    const binary = atob(body)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  }
  const response = await fetch(src)
  if (!response.ok) throw new Error('Image fetch failed: ' + response.status)
  return new Uint8Array(await response.arrayBuffer())
}

function safeName(value) {
  return String(value || 'AI Design to Web').replace(/[\\n\\r]/g, ' ').slice(0, 80)
}

function hexToRgb(hex) {
  const value = String(hex).replace('#', '')
  const num = parseInt(value.length === 3 ? value.split('').map((x) => x + x).join('') : value, 16)
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255
  }
}
`
}
