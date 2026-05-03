package workflow

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var ErrNotFound = errors.New("not found")
var ErrInvalidStatus = errors.New("invalid status")

type Service struct {
	mu        sync.RWMutex
	stages    []Stage
	documents []Document
	storePath string
	docsRoot  string
}

type Config struct {
	StorePath string
	DocsRoot  string
}

type persistedState struct {
	UpdatedAt time.Time `json:"updatedAt"`
	Stages    []Stage   `json:"stages"`
}

func NewService(configs ...Config) *Service {
	config := Config{}
	if len(configs) > 0 {
		config = configs[0]
	}
	if config.StorePath == "" {
		config.StorePath = filepath.Join("data", "workflow-state.json")
	}
	if config.DocsRoot == "" {
		config.DocsRoot = detectDocsRoot()
	}

	service := &Service{
		stages:    defaultStages(),
		documents: defaultDocuments(),
		storePath: config.StorePath,
		docsRoot:  config.DocsRoot,
	}
	service.refreshDocumentMetadata()
	service.loadState()
	return service
}

func (s *Service) Snapshot() WorkflowSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stages := cloneStages(s.stages)
	documents := cloneDocuments(s.documents)
	return WorkflowSnapshot{
		GeneratedAt: time.Now().UTC(),
		Stages:      stages,
		Documents:   documents,
		Summary:     summarize(stages),
	}
}

func (s *Service) Documents() []Document {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneDocuments(s.documents)
}

func (s *Service) Document(slug string) (Document, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, document := range s.documents {
		if document.Slug == slug {
			return s.withDocumentContent(document), nil
		}
	}
	return Document{}, ErrNotFound
}

func (s *Service) UpdateStageStatus(id string, status Status) (Stage, error) {
	if !validStatus(status) {
		return Stage{}, ErrInvalidStatus
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for index := range s.stages {
		if s.stages[index].ID == id {
			s.stages[index].Status = status
			switch status {
			case StatusPending:
				s.stages[index].Progress = 0
			case StatusActive:
				if s.stages[index].Progress == 0 {
					s.stages[index].Progress = 45
				}
			case StatusCompleted:
				s.stages[index].Progress = 100
			case StatusBlocked:
				if s.stages[index].Progress == 100 {
					s.stages[index].Progress = 75
				}
			}
			if err := s.saveStateLocked(); err != nil {
				return Stage{}, err
			}
			return s.stages[index], nil
		}
	}
	return Stage{}, ErrNotFound
}

func (s *Service) CreateProjectPlan(request ProjectRequest) ProjectPlan {
	name := strings.TrimSpace(request.ProductName)
	if name == "" {
		name = "未命名 AI UI 项目"
	}

	page := strings.TrimSpace(request.PriorityPage)
	if page == "" {
		page = "P0 核心页面"
	}

	style := strings.TrimSpace(request.Style)
	if style == "" {
		style = "专业、清晰、适合 Web App 落地"
	}

	return ProjectPlan{
		ID:          fmt.Sprintf("plan-%d", time.Now().UnixNano()),
		ProductName: name,
		CreatedAt:   time.Now().UTC(),
		RecommendedRun: []string{
			"先只跑一个 P0 页面，验证 image2、Gemini 3.1 和前端还原链路。",
			"优先生成 Desktop 设计稿，再补 Mobile 版本。",
			"进入前端开发前必须确认 design-spec.json、design-tokens-final.json 和 asset-map.json。",
		},
		NextActions: []string{
			fmt.Sprintf("完善 %q 的 brief-filled.md。", name),
			fmt.Sprintf("围绕 %q 生成 prd-final.md、pages.yaml 和 copywriting.md。", page),
			fmt.Sprintf("用 %q 作为 image2 的视觉约束。", style),
			"选择一张 selected-ui-desktop.png 和一张 selected-ui-mobile.png。",
		},
		Risks: []string{
			"如果 UI 设计稿含乱码或透视角度，必须回到 image2 重生成。",
			"不要把整页设计稿作为网页背景，核心内容必须由 HTML/CSS/JS 实现。",
			"Gemini 输出的 bbox 只作为布局参考，前端仍应使用响应式规则还原。",
		},
	}
}

func (s *Service) RunAgent(request AgentRunRequest) (AgentRunResponse, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stage, err := s.stageByID(request.StageID)
	if err != nil {
		return AgentRunResponse{}, err
	}

	agent := agentProfile(normalizeAgentType(request.AgentType, request.Message, stage))
	documents := s.relatedDocuments(request.DocumentSlugs, stage.ID)
	message := strings.TrimSpace(request.Message)
	if message == "" {
		message = defaultAgentMessage(agent.Type, stage)
	}

	return AgentRunResponse{
		ID:               fmt.Sprintf("agent-run-%d", time.Now().UnixNano()),
		CreatedAt:        time.Now().UTC(),
		StageID:          stage.ID,
		StageTitle:       stage.Title,
		Agent:            agent,
		Reply:            agentReply(agent.Type, stage),
		HandoffPrompt:    handoffPrompt(agent.Type, stage, message, documents),
		RequiredInputs:   stage.Inputs,
		ExpectedOutputs:  stage.Outputs,
		Checklist:        agentChecklist(agent.Type, stage),
		NextActions:      agentNextActions(agent.Type, stage),
		SuggestedStatus:  suggestedStatus(stage),
		RelatedDocuments: documents,
	}, nil
}

func summarize(stages []Stage) Summary {
	var summary Summary
	summary.TotalStages = len(stages)

	if len(stages) == 0 {
		return summary
	}

	progressTotal := 0
	for _, stage := range stages {
		progressTotal += stage.Progress
		switch stage.Status {
		case StatusCompleted:
			summary.CompletedStages++
		case StatusActive:
			summary.ActiveStages++
		case StatusBlocked:
			summary.BlockedStages++
		}
	}
	summary.Progress = progressTotal / len(stages)
	return summary
}

func validStatus(status Status) bool {
	switch status {
	case StatusPending, StatusActive, StatusCompleted, StatusBlocked:
		return true
	default:
		return false
	}
}

func cloneStages(stages []Stage) []Stage {
	result := make([]Stage, len(stages))
	copy(result, stages)
	return result
}

func cloneDocuments(documents []Document) []Document {
	result := make([]Document, len(documents))
	copy(result, documents)
	return result
}

func (s *Service) stageByID(id string) (Stage, error) {
	for _, stage := range s.stages {
		if stage.ID == id {
			return stage, nil
		}
	}
	return Stage{}, ErrNotFound
}

func (s *Service) relatedDocuments(slugs []string, stageID string) []Document {
	selected := make(map[string]bool)
	for _, slug := range slugs {
		selected[slug] = true
	}

	var documents []Document
	for _, document := range s.documents {
		if selected[document.Slug] || contains(document.StageIDs, stageID) {
			documents = append(documents, s.withDocumentContent(document))
		}
	}
	return documents
}

func contains(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

func normalizeAgentType(agentType string, message string, stage Stage) string {
	if explicitAgentType := strings.TrimSpace(agentType); explicitAgentType != "" {
		return explicitAgentType
	}

	value := strings.ToLower(strings.TrimSpace(message))
	switch {
	case strings.Contains(value, "图生html"), strings.Contains(value, "html"), strings.Contains(value, "code"), strings.Contains(value, "还原"):
		return "code-restore-agent"
	case strings.Contains(value, "图生图"), strings.Contains(value, "image2"), strings.Contains(value, "设计稿"):
		if stage.Number >= 6 {
			return "image2-assets-agent"
		}
		return "image2-ui-agent"
	case strings.Contains(value, "gemini"), strings.Contains(value, "审图"), strings.Contains(value, "验收"):
		if stage.Number >= 8 {
			return "qa-agent"
		}
		return "gemini-review-agent"
	case strings.Contains(value, "切图"), strings.Contains(value, "asset"):
		return "image2-assets-agent"
	case strings.Contains(value, "prd"), strings.Contains(value, "产品"), strings.Contains(value, "原型"):
		return "product-agent"
	}

	switch stage.Number {
	case 0, 1:
		return "product-agent"
	case 2:
		return "style-agent"
	case 3:
		return "image2-ui-agent"
	case 4:
		return "gemini-review-agent"
	case 5:
		return "gemini-spec-agent"
	case 6:
		return "image2-assets-agent"
	case 7:
		return "code-restore-agent"
	case 8:
		return "qa-agent"
	case 9:
		return "code-fix-agent"
	default:
		return "delivery-agent"
	}
}

func agentProfile(agentType string) AgentProfile {
	profiles := map[string]AgentProfile{
		"product-agent":       {Type: "product-agent", Name: "产品原型 Agent", Description: "把业务需求转成 PRD、页面结构、用户流程和真实文案。", Mode: "text-to-spec"},
		"style-agent":         {Type: "style-agent", Name: "视觉方向 Agent", Description: "收敛品牌气质、设计 token、组件风格和 image2 视觉约束。", Mode: "text-to-style"},
		"image2-ui-agent":     {Type: "image2-ui-agent", Name: "image2 UI 设计稿 Agent", Description: "根据产品规格和视觉方向生成可还原的高保真 UI 设计稿提示词。", Mode: "text-to-image"},
		"gemini-review-agent": {Type: "gemini-review-agent", Name: "Gemini 审图 Agent", Description: "审查设计稿质量、前端可还原性和是否能进入结构化标注。", Mode: "image-to-review"},
		"gemini-spec-agent":   {Type: "gemini-spec-agent", Name: "Gemini 结构化标注 Agent", Description: "把设计稿转为 design-spec、layout、components、tokens 和 assets_needed。", Mode: "image-to-json"},
		"image2-assets-agent": {Type: "image2-assets-agent", Name: "image2 图生图切图 Agent", Description: "基于设计稿局部重新生成 Hero、空状态、产品图等可用切图资产。", Mode: "image-to-image"},
		"code-restore-agent":  {Type: "code-restore-agent", Name: "图生 HTML 还原 Agent", Description: "根据设计稿、结构化规格和切图资产生成 HTML/CSS/JS 或 Vue 页面。", Mode: "image-to-html"},
		"qa-agent":            {Type: "qa-agent", Name: "视觉 QA Agent", Description: "对比设计稿和页面截图，输出 P0/P1/P2 修复建议。", Mode: "image-compare"},
		"code-fix-agent":      {Type: "code-fix-agent", Name: "代码修复 Agent", Description: "根据视觉 QA 结果修复前端代码并复验。", Mode: "code-fix"},
		"delivery-agent":      {Type: "delivery-agent", Name: "交付归档 Agent", Description: "整理最终产物、验收结果、已知问题和扩展计划。", Mode: "delivery"},
	}
	if profile, ok := profiles[agentType]; ok {
		return profile
	}
	return profiles["product-agent"]
}

func defaultAgentMessage(agentType string, stage Stage) string {
	switch agentType {
	case "image2-ui-agent":
		return "根据当前阶段生成 Desktop 和 Mobile 高保真 UI 设计稿提示词。"
	case "image2-assets-agent":
		return "根据 assets_needed 生成一整套切图资产提示词，明确张数、用途、尺寸和 asset-map，并确保不把 HTML 元素切成图片。"
	case "code-restore-agent":
		return "根据设计稿图片、design-spec.json 和 asset-map.json 生成可运行的多页面 Web 画布。"
	default:
		return fmt.Sprintf("请根据“%s”给出可执行下一步。", stage.Title)
	}
}

func agentReply(agentType string, stage Stage) string {
	switch agentType {
	case "image2-ui-agent":
		return "我会把当前产品规格、页面结构和视觉方向整理成 image2 可用提示词，目标是生成正视角、文案可读、适合 HTML/CSS 还原的 UI 设计稿。"
	case "image2-assets-agent":
		return "我会只处理真正需要图片化的视觉资产，支持固定张数或自由规划数量，避免把标题、按钮、表格、导航等 HTML 元素切成图片。"
	case "code-restore-agent":
		return "我会把设计稿图片和结构化规格转成多页面前端实现任务，要求页面主体用代码还原，图片只作为复杂视觉资产引用。"
	case "gemini-review-agent", "gemini-spec-agent":
		return "我会把 Gemini 的任务限定为审图、标注和结构化输出，避免泛泛评价，直接产出可进入下一阶段的规格。"
	case "qa-agent":
		return "我会把验收问题按 P0/P1/P2 分类，并输出能直接交给代码模型修改的建议。"
	default:
		return fmt.Sprintf("我会围绕“%s”整理当前阶段的输入、输出、门禁和下一步执行提示。", stage.Title)
	}
}

func handoffPrompt(agentType string, stage Stage, message string, documents []Document) string {
	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("你是%s。\n\n", agentProfile(agentType).Name))
	builder.WriteString(fmt.Sprintf("当前阶段：Stage %d - %s\n", stage.Number, stage.Title))
	builder.WriteString(fmt.Sprintf("阶段目标：%s\n", stage.Summary))
	builder.WriteString(fmt.Sprintf("用户指令：%s\n\n", message))
	builder.WriteString("必须使用的输入：\n")
	for _, input := range stage.Inputs {
		builder.WriteString("- " + input + "\n")
	}
	builder.WriteString("\n必须产出的结果：\n")
	for _, output := range stage.Outputs {
		builder.WriteString("- " + output + "\n")
	}
	builder.WriteString("\n验收门禁：\n")
	for _, gate := range stage.Gate {
		builder.WriteString("- " + gate + "\n")
	}

	if len(documents) > 0 {
		builder.WriteString("\n参考文档摘要：\n")
		for _, document := range documents {
			content := strings.TrimSpace(document.Content)
			if len(content) > 500 {
				content = content[:500] + "..."
			}
			builder.WriteString(fmt.Sprintf("## %s (%s)\n%s\n\n", document.Title, document.Path, content))
		}
	}

	switch agentType {
	case "image2-ui-agent":
		builder.WriteString("额外约束：输出 image2 提示词，必须强调正视角网页截图、真实可读文字、不要设备外壳、不要透视图、不要把整页做成图片。\n")
	case "image2-assets-agent":
		builder.WriteString("额外约束：输出一整套图生图/切图提示词；必须说明固定张数或自由规划数量；只生成复杂视觉资产；不要包含标题、按钮、表单、表格、导航和状态标签。\n")
	case "code-restore-agent":
		builder.WriteString("额外约束：输出多页面前端实现指令，页面主体必须用 HTML/CSS/JS 或 Vue 组件实现；图片只来自 asset-map.json；必须响应式；多个页面应能同时放进画布预览。\n")
	case "gemini-spec-agent":
		builder.WriteString("额外约束：只输出合法 JSON，不要额外解释；必须包含 sections、components、tokens、assets_needed、html_css_elements。\n")
	case "qa-agent":
		builder.WriteString("额外约束：按 P0/P1/P2 输出问题，每条必须包含位置、原因和具体修改建议。\n")
	}

	builder.WriteString("\n本阶段产物协议：\n")
	for _, artifact := range artifactProtocol(agentType) {
		builder.WriteString("- " + artifact + "\n")
	}
	builder.WriteString("\n设计与还原 Lint：\n")
	for _, rule := range designLintRules() {
		builder.WriteString("- " + rule + "\n")
	}

	return builder.String()
}

func artifactProtocol(agentType string) []string {
	protocols := map[string][]string{
		"product-agent":       {"prd-final.md：产品目标、用户、范围、P0/P1/P2 页面", "pages.yaml：页面清单、路由、状态和优先级", "copywriting.md：真实可用的界面文案"},
		"style-agent":         {"visual-direction.md：品牌气质、参考风格和禁用项", "design-tokens-draft.json：颜色、字体、间距、圆角和阴影 token 草案", "image2-style-constraints.md：给 image2 的统一视觉约束"},
		"image2-ui-agent":     {"image2-ui-prompt.md：Desktop/Mobile 高保真 UI 设计稿提示词", "selected-ui-desktop.png：最终入选 Desktop 设计稿", "selected-ui-mobile.png：最终入选 Mobile 设计稿"},
		"gemini-review-agent": {"gemini-review.md：设计稿质量、可还原性和重生成建议", "design-risk-list.md：P0/P1/P2 视觉和实现风险", "next-regenerate-prompt.md：需要回到 image2 时的修正提示词"},
		"gemini-spec-agent":   {"design-spec.json：页面结构、节点、组件和布局约束", "component-instances.json：组件实例、状态、文案和语义角色", "design-tokens-final.json：最终 token 映射"},
		"image2-assets-agent": {"asset-prompts.md：每个复杂图片资产的图生图提示词", "generated-assets/*：按固定张数或自由规划数量生成的一整套切图", "asset-map.json：资产名称、用途、尺寸和引用路径", "asset-lint.md：确认没有把 HTML 元素切成图片"},
		"code-restore-agent":  {"files.json：待生成文件树和依赖说明", "Vue pages / HTML files：可同时放进画布预览的多页面代码", "responsive-checklist.md：Desktop/Mobile 还原检查项"},
		"qa-agent":            {"visual-qa-report.md：设计稿与页面截图差异报告", "fix-ticket-list.md：P0/P1/P2 修复票据", "acceptance-record.md：验收结论和剩余风险"},
		"code-fix-agent":      {"patch-plan.md：具体修复方案", "changed-files.md：修改文件和原因", "recheck-report.md：复验结果"},
		"delivery-agent":      {"delivery-summary.md：最终交付物和版本说明", "known-issues.md：已知问题和边界", "next-roadmap.md：下一阶段扩展计划"},
	}
	if protocol, ok := protocols[agentType]; ok {
		return protocol
	}
	return protocols["delivery-agent"]
}

func designLintRules() []string {
	return []string{
		"文本、按钮、导航、表格、表单必须用 HTML/CSS 实现，不进入切图。",
		"每个页面必须同时考虑 Desktop 和 Mobile 视口。",
		"每个视觉资产必须有明确用途、尺寸、命名和替代文本。",
		"设计 token 必须覆盖颜色、字体、间距、圆角、阴影和状态色。",
		"Figma/OpenPencil 节点命名应稳定，避免自动生成的无语义名称。",
	}
}

func agentChecklist(agentType string, stage Stage) []string {
	checklist := append([]string{}, stage.Gate...)
	switch agentType {
	case "image2-ui-agent":
		return append(checklist, "生成 Desktop 与 Mobile 两版", "选稿后保存 selected-ui-desktop.png 和 selected-ui-mobile.png")
	case "image2-assets-agent":
		return append(checklist, "支持固定张数或自由规划数量", "每个资产有透明背景要求", "asset-map.json 同时包含 sourceFile 和 webFile")
	case "code-restore-agent":
		return append(checklist, "不使用整页截图作为背景", "通过 Desktop / Tablet / Mobile 响应式检查")
	default:
		return checklist
	}
}

func agentNextActions(agentType string, stage Stage) []string {
	switch agentType {
	case "image2-ui-agent":
		return []string{"复制 handoff prompt 到 image2。", "生成 3 到 5 张 Desktop 设计稿。", "选定后继续生成 Mobile 版本。"}
	case "image2-assets-agent":
		return []string{"从 design-spec.json 提取 assets_needed。", "确定固定张数或自由规划上限。", "逐个生成 PNG/WebP 资产。", "补齐 asset-map.json。"}
	case "code-restore-agent":
		return []string{"整理 design-spec.json、design-tokens-final.json、asset-map.json。", "生成 Vue/HTML/CSS 页面。", "启动页面并截图进入视觉 QA。"}
	case "gemini-review-agent":
		return []string{"上传 selected-ui-desktop.png。", "让 Gemini 按 P0/P1/P2 审查。", "评分低于 8 时回到 image2 重生成。"}
	default:
		return []string{"确认当前阶段输入是否齐全。", "执行 handoff prompt。", "用门禁清单判断是否进入下一阶段。"}
	}
}

func suggestedStatus(stage Stage) Status {
	if stage.Status == StatusPending {
		return StatusActive
	}
	return stage.Status
}

func (s *Service) loadState() {
	if s.storePath == "" {
		return
	}

	data, err := os.ReadFile(s.storePath)
	if err != nil {
		return
	}

	var state persistedState
	if err := json.Unmarshal(data, &state); err != nil {
		return
	}

	stageByID := make(map[string]Stage, len(state.Stages))
	for _, stage := range state.Stages {
		stageByID[stage.ID] = stage
	}

	for index, stage := range s.stages {
		persisted, ok := stageByID[stage.ID]
		if !ok {
			continue
		}
		s.stages[index].Status = persisted.Status
		s.stages[index].Progress = persisted.Progress
	}
}

func (s *Service) saveStateLocked() error {
	if s.storePath == "" {
		return nil
	}

	state := persistedState{
		UpdatedAt: time.Now().UTC(),
		Stages:    cloneStages(s.stages),
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal workflow state: %w", err)
	}

	if err := os.MkdirAll(filepath.Dir(s.storePath), 0o755); err != nil {
		return fmt.Errorf("create workflow state directory: %w", err)
	}
	if err := os.WriteFile(s.storePath, data, 0o644); err != nil {
		return fmt.Errorf("write workflow state: %w", err)
	}
	return nil
}

func (s *Service) refreshDocumentMetadata() {
	for index := range s.documents {
		path := filepath.Join(s.docsRoot, s.documents[index].Path)
		info, err := os.Stat(path)
		if err != nil {
			s.documents[index].Exists = false
			s.documents[index].Bytes = 0
			continue
		}
		s.documents[index].Exists = true
		s.documents[index].Bytes = int(info.Size())
	}
}

func (s *Service) withDocumentContent(document Document) Document {
	if s.docsRoot == "" {
		return document
	}

	data, err := os.ReadFile(filepath.Join(s.docsRoot, document.Path))
	if err != nil {
		return document
	}
	document.Content = string(data)
	document.Exists = true
	document.Bytes = len(data)
	return document
}

func detectDocsRoot() string {
	workingDir, err := os.Getwd()
	if err != nil {
		return "."
	}

	for dir := workingDir; ; dir = filepath.Dir(dir) {
		if fileExists(filepath.Join(dir, "brief.md")) && fileExists(filepath.Join(dir, "workflow-execution-plan.md")) {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
	}
	return workingDir
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func defaultStages() []Stage {
	return []Stage{
		{
			ID:      "stage-0",
			Number:  0,
			Title:   "初始化工作区和准备需求",
			Phase:   "Product",
			Owner:   "人工负责人",
			Summary: "创建 work 目录，填写 brief-filled.md，确定第一个 P0 试跑页面。",
			Inputs:  []string{"brief.md"},
			Outputs: []string{"work/01-product/brief-filled.md"},
			Gate:    []string{"产品一句话介绍清楚", "目标用户明确", "至少指定 1 个优先页面"},
			Rollback: []string{
				"页面目标不清楚时回到 brief 补充业务目标和用户任务。",
			},
			Status:   StatusActive,
			Progress: 45,
		},
		{
			ID:       "stage-1",
			Number:   1,
			Title:    "生成产品原型",
			Phase:    "Product",
			Owner:    "AI 产品经理",
			Summary:  "把需求转成 PRD、用户流程、页面结构、组件清单和真实文案。",
			Inputs:   []string{"brief-filled.md", "prd.md", "user-flow.md"},
			Outputs:  []string{"prd-final.md", "user-flow-final.md", "pages.yaml", "components.yaml", "copywriting.md"},
			Gate:     []string{"每个 P0 页面都有目标", "核心用户流程能走到结果", "关键状态处理原则完整"},
			Rollback: []string{"流程缺页面时先补 pages.yaml。", "文案空泛时先修 copywriting.md。"},
			Status:   StatusPending,
			Progress: 0,
		},
		{
			ID:       "stage-2",
			Number:   2,
			Title:    "确认视觉方向",
			Phase:    "Design",
			Owner:    "AI UI 设计师",
			Summary:  "确定品牌气质、颜色、字体、间距、圆角和组件风格。",
			Inputs:   []string{"style-direction.md"},
			Outputs:  []string{"style-direction-final.md", "design-tokens-draft.json"},
			Gate:     []string{"风格关键词不超过 8 个", "主色和中性色明确", "禁止项明确"},
			Rollback: []string{"视觉方向太泛时回到产品定位重新收敛关键词。"},
			Status:   StatusPending,
			Progress: 0,
		},
		{
			ID:       "stage-3",
			Number:   3,
			Title:    "image2 生成 UI 设计稿",
			Phase:    "Design",
			Owner:    "image2",
			Summary:  "生成 Desktop 和 Mobile 高保真设计稿，并保存最终选稿。",
			Inputs:   []string{"image2-ui-prompts.md", "pages.yaml", "style-direction-final.md"},
			Outputs:  []string{"selected-ui-desktop.png", "selected-ui-mobile.png"},
			Gate:     []string{"正视角网页截图", "无设备外壳", "无明显乱码", "适合 HTML/CSS 还原"},
			Rollback: []string{"文案乱码或透视严重时回到 image2 重新生成。"},
			Status:   StatusPending,
			Progress: 0,
		},
		{
			ID:       "stage-4",
			Number:   4,
			Title:    "Gemini 3.1 审图",
			Phase:    "Review",
			Owner:    "Gemini 3.1",
			Summary:  "从产品可用性、视觉一致性和前端可还原性评估设计稿。",
			Inputs:   []string{"selected-ui-desktop.png", "selected-ui-mobile.png", "gemini-design-review.md"},
			Outputs:  []string{"home-design-review.md"},
			Gate:     []string{"评分 >= 8/10", "P0 = 0", "P1 <= 3", "人工确认最终版本"},
			Rollback: []string{"评分低于 8 时回到 image2 重新生成。"},
			Status:   StatusPending,
			Progress: 0,
		},
		{
			ID:      "stage-5",
			Number:  5,
			Title:   "输出结构化设计规格",
			Phase:   "Spec",
			Owner:   "Gemini 3.1",
			Summary: "输出 design-spec、layout、components 和 design-tokens-final。",
			Inputs:  []string{"selected-ui-desktop.png", "gemini-design-review.md"},
			Outputs: []string{"home-design-spec.json", "home-layout.json", "home-components.json", "design-tokens-final.json"},
			Gate:    []string{"JSON 可解析", "主区块有 id/name/bbox/purpose", "assets_needed 只包含真正需要切图的资产"},
			Rollback: []string{
				"JSON 不合法时让 Gemini 只修复 JSON 格式。",
				"切图列表过多时让 Gemini 重新判断哪些不该切。",
			},
			Status:   StatusPending,
			Progress: 0,
		},
		{
			ID:       "stage-6",
			Number:   6,
			Title:    "image2 生成切图资产",
			Phase:    "Assets",
			Owner:    "image2",
			Summary:  "根据 assets_needed 按固定张数或自由规划数量生成 PNG/WebP 资产，并建立 asset-map.json。",
			Inputs:   []string{"assets_needed", "image2-assets-prompts.md"},
			Outputs:  []string{"asset-request-list.json", "generated-assets/*", "asset-map.json"},
			Gate:     []string{"资产边缘干净", "风格和设计稿一致", "不包含应由 HTML 实现的文字和控件"},
			Rollback: []string{"资产含无关文字或背景不透明时重新生成。"},
			Status:   StatusPending,
			Progress: 0,
		},
		{
			ID:       "stage-7",
			Number:   7,
			Title:    "HTML/CSS/JS 还原页面",
			Phase:    "Build",
			Owner:    "代码模型",
			Summary:  "基于设计规格、token、文案和资产生成可运行 Web 页面。",
			Inputs:   []string{"home-design-spec.json", "design-tokens-final.json", "asset-map.json", "copywriting.md"},
			Outputs:  []string{"index.html", "styles.css", "app.js", "assets/"},
			Gate:     []string{"页面可运行", "无资源 404", "移动端不横向溢出", "关键状态有反馈"},
			Rollback: []string{"页面整体不像设计稿时先修布局和 token。"},
			Status:   StatusPending,
			Progress: 0,
		},
		{
			ID:       "stage-8",
			Number:   8,
			Title:    "截图和视觉验收",
			Phase:    "QA",
			Owner:    "Gemini 3.1",
			Summary:  "用 Playwright 截图，并让 Gemini 对比设计稿和页面截图。",
			Inputs:   []string{"selected-ui-desktop.png", "页面截图", "visual-qa.md"},
			Outputs:  []string{"home-desktop.png", "home-mobile.png", "visual-review.md"},
			Gate:     []string{"P0 = 0", "P1 = 0", "P2 <= 3"},
			Rollback: []string{"布局问题回 CSS，设计稿不可还原则回 Gemini 规格或 image2。"},
			Status:   StatusPending,
			Progress: 0,
		},
		{
			ID:       "stage-9",
			Number:   9,
			Title:    "自动修复和复验",
			Phase:    "QA",
			Owner:    "代码模型",
			Summary:  "根据 visual-review.md 修复 P0/P1，并循环复验 2 到 3 轮。",
			Inputs:   []string{"visual-review.md", "work/06-web/"},
			Outputs:  []string{"fix-log.md"},
			Gate:     []string{"P0 = 0", "P1 = 0", "P2 <= 3", "无连续两轮相同 P0/P1"},
			Rollback: []string{"连续两轮同一问题时回到设计规格或资产阶段。"},
			Status:   StatusPending,
			Progress: 0,
		},
		{
			ID:       "stage-10",
			Number:   10,
			Title:    "交付归档",
			Phase:    "Delivery",
			Owner:    "人工负责人",
			Summary:  "整理最终 PRD、设计稿、规格、资产、Web 页面和验收记录。",
			Inputs:   []string{"全部 work 产物"},
			Outputs:  []string{"交付包", "交付说明", "已知问题列表"},
			Gate:     []string{"页面可运行", "验收 P0/P1 为 0", "剩余 P2 有记录"},
			Rollback: []string{"交付缺关键文件时回对应阶段补齐。"},
			Status:   StatusPending,
			Progress: 0,
		},
	}
}

func defaultDocuments() []Document {
	return []Document{
		{
			Slug:        "brief",
			Title:       "需求输入模板",
			Kind:        "Product",
			Path:        "brief.md",
			Description: "收集产品名称、目标用户、页面范围、功能需求、视觉偏好和交付要求。",
			Required:    true,
			StageIDs:    []string{"stage-0", "stage-1"},
			Content:     "先把业务目标写清楚，再进入 UI 生成。brief-filled.md 是整条流水线的起点。",
		},
		{
			Slug:        "prd",
			Title:       "PRD 产品需求文档",
			Kind:        "Product",
			Path:        "prd.md",
			Description: "沉淀页面清单、功能清单、交互需求和验收标准。",
			Required:    true,
			StageIDs:    []string{"stage-1"},
			Content:     "PRD 负责把 brief 转成可执行的产品结构，尤其要明确 P0 页面和关键状态。",
		},
		{
			Slug:        "style-direction",
			Title:       "视觉风格方向",
			Kind:        "Design",
			Path:        "style-direction.md",
			Description: "约束品牌气质、颜色、字体、间距、圆角和组件风格。",
			Required:    true,
			StageIDs:    []string{"stage-2", "stage-3"},
			Content:     "风格方向需要克制和具体，避免 image2 生成无法落地的视觉稿。",
		},
		{
			Slug:        "image2-ui",
			Title:       "image2 UI 设计稿提示词",
			Kind:        "Prompt",
			Path:        "image2-ui-prompts.md",
			Description: "生成低保真、高保真 Desktop、Mobile、Dashboard 和 Landing Page 设计稿。",
			Required:    true,
			StageIDs:    []string{"stage-3"},
			Content:     "强调正视角、真实可读文案、可 HTML/CSS 还原，不要设备外壳和透视图。",
		},
		{
			Slug:        "gemini-design-review",
			Title:       "Gemini 设计稿审查",
			Kind:        "Review",
			Path:        "gemini-design-review.md",
			Description: "让 Gemini 3.1 审图、结构化标注并输出设计规格 JSON。",
			Required:    true,
			StageIDs:    []string{"stage-4", "stage-5"},
			Content:     "Gemini 负责把视觉稿转成区块、组件、token、assets_needed 和 html_css_elements。",
		},
		{
			Slug:        "image2-assets",
			Title:       "image2 切图资产提示词",
			Kind:        "Assets",
			Path:        "image2-assets-prompts.md",
			Description: "只生成 Hero 插画、空状态、产品图等真正需要图片化的资产。",
			Required:    true,
			StageIDs:    []string{"stage-6"},
			Content:     "不要把按钮、表格、导航、标题文案切成图片。网页主体必须由 HTML/CSS 实现。",
		},
		{
			Slug:        "implementation",
			Title:       "HTML/CSS/JS 前端还原规格",
			Kind:        "Build",
			Path:        "implementation-spec.md",
			Description: "规定前端技术栈、token、语义化 HTML、响应式和代码验收标准。",
			Required:    true,
			StageIDs:    []string{"stage-7"},
			Content:     "前端实现应使用 token 和组件规则，还原设计稿而不是贴整页截图。",
		},
		{
			Slug:        "visual-qa",
			Title:       "视觉验收与自动迭代",
			Kind:        "QA",
			Path:        "visual-qa.md",
			Description: "用 Playwright 截图，结合 Gemini 视觉对比输出 P0/P1/P2 修复建议。",
			Required:    true,
			StageIDs:    []string{"stage-8", "stage-9"},
			Content:     "验收通过标准是 P0 = 0、P1 = 0、P2 <= 3。",
		},
	}
}
