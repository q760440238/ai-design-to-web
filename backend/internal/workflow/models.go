package workflow

import "time"

type Status string

const (
	StatusPending   Status = "pending"
	StatusActive    Status = "active"
	StatusCompleted Status = "completed"
	StatusBlocked   Status = "blocked"
)

type Stage struct {
	ID       string   `json:"id"`
	Number   int      `json:"number"`
	Title    string   `json:"title"`
	Phase    string   `json:"phase"`
	Owner    string   `json:"owner"`
	Summary  string   `json:"summary"`
	Inputs   []string `json:"inputs"`
	Outputs  []string `json:"outputs"`
	Gate     []string `json:"gate"`
	Rollback []string `json:"rollback"`
	Status   Status   `json:"status"`
	Progress int      `json:"progress"`
}

type Document struct {
	Slug        string   `json:"slug"`
	Title       string   `json:"title"`
	Kind        string   `json:"kind"`
	Path        string   `json:"path"`
	Description string   `json:"description"`
	Required    bool     `json:"required"`
	Exists      bool     `json:"exists"`
	Bytes       int      `json:"bytes,omitempty"`
	StageIDs    []string `json:"stageIds"`
	Content     string   `json:"content,omitempty"`
}

type WorkflowSnapshot struct {
	GeneratedAt time.Time  `json:"generatedAt"`
	Stages      []Stage    `json:"stages"`
	Documents   []Document `json:"documents"`
	Summary     Summary    `json:"summary"`
}

type Summary struct {
	TotalStages     int `json:"totalStages"`
	CompletedStages int `json:"completedStages"`
	ActiveStages    int `json:"activeStages"`
	BlockedStages   int `json:"blockedStages"`
	Progress        int `json:"progress"`
}

type ProjectRequest struct {
	ProductName  string `json:"productName"`
	Audience     string `json:"audience"`
	PriorityPage string `json:"priorityPage"`
	DeliveryGoal string `json:"deliveryGoal"`
	Style        string `json:"style"`
}

type ProjectPlan struct {
	ID             string    `json:"id"`
	ProductName    string    `json:"productName"`
	CreatedAt      time.Time `json:"createdAt"`
	RecommendedRun []string  `json:"recommendedRun"`
	NextActions    []string  `json:"nextActions"`
	Risks          []string  `json:"risks"`
}

type AgentProfile struct {
	Type        string `json:"type"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Mode        string `json:"mode"`
}

type AgentRunRequest struct {
	StageID       string   `json:"stageId"`
	AgentType     string   `json:"agentType"`
	Message       string   `json:"message"`
	DocumentSlugs []string `json:"documentSlugs"`
}

type AgentRunResponse struct {
	ID               string       `json:"id"`
	CreatedAt        time.Time    `json:"createdAt"`
	StageID          string       `json:"stageId"`
	StageTitle       string       `json:"stageTitle"`
	Agent            AgentProfile `json:"agent"`
	Reply            string       `json:"reply"`
	HandoffPrompt    string       `json:"handoffPrompt"`
	RequiredInputs   []string     `json:"requiredInputs"`
	ExpectedOutputs  []string     `json:"expectedOutputs"`
	Checklist        []string     `json:"checklist"`
	NextActions      []string     `json:"nextActions"`
	SuggestedStatus  Status       `json:"suggestedStatus"`
	RelatedDocuments []Document   `json:"relatedDocuments"`
}
