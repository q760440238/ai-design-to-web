package workflow

import (
	"path/filepath"
	"testing"
)

func TestStageStatusPersists(t *testing.T) {
	storePath := filepath.Join(t.TempDir(), "workflow-state.json")

	service := NewService(Config{StorePath: storePath})
	if _, err := service.UpdateStageStatus("stage-0", StatusCompleted); err != nil {
		t.Fatalf("update status: %v", err)
	}

	reloaded := NewService(Config{StorePath: storePath})
	stage := reloaded.Snapshot().Stages[0]
	if stage.Status != StatusCompleted || stage.Progress != 100 {
		t.Fatalf("expected persisted completed stage, got %+v", stage)
	}
}

func TestDocumentReadsMarkdownContent(t *testing.T) {
	service := NewService(Config{StorePath: filepath.Join(t.TempDir(), "state.json")})

	document, err := service.Document("brief")
	if err != nil {
		t.Fatalf("get document: %v", err)
	}
	if !document.Exists {
		t.Fatalf("expected brief.md to exist")
	}
	if document.Bytes == 0 || document.Content == "" {
		t.Fatalf("expected document content to be loaded")
	}
}

func TestRunAgentHonorsExplicitAgentType(t *testing.T) {
	service := NewService(Config{StorePath: filepath.Join(t.TempDir(), "state.json")})

	run, err := service.RunAgent(AgentRunRequest{
		StageID:   "stage-5",
		AgentType: "gemini-spec-agent",
		Message:   "参考 OpenPencil 输出节点树，后续再转 HTML/Vue。",
	})
	if err != nil {
		t.Fatalf("run agent: %v", err)
	}
	if run.Agent.Type != "gemini-spec-agent" || run.Agent.Mode != "image-to-json" {
		t.Fatalf("expected explicit gemini spec agent, got %+v", run.Agent)
	}
}
