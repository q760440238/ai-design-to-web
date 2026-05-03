package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"ai-design-to-web/backend/internal/history"
	"ai-design-to-web/backend/internal/workflow"
)

func TestWorkflowEndpoint(t *testing.T) {
	handler := testHandler(t)

	request := httptest.NewRequest(http.MethodGet, "/api/workflow", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", response.Code)
	}

	var payload workflow.WorkflowSnapshot
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Summary.TotalStages != 11 {
		t.Fatalf("expected 11 stages, got %d", payload.Summary.TotalStages)
	}
}

func TestUpdateStageStatus(t *testing.T) {
	handler := testHandler(t)
	body := bytes.NewBufferString(`{"status":"completed"}`)

	request := httptest.NewRequest(http.MethodPatch, "/api/stages/stage-0/status", body)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", response.Code)
	}

	var stage workflow.Stage
	if err := json.NewDecoder(response.Body).Decode(&stage); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if stage.Status != workflow.StatusCompleted || stage.Progress != 100 {
		t.Fatalf("stage was not completed: %+v", stage)
	}
}

func TestRunAgent(t *testing.T) {
	handler := testHandler(t)
	body := bytes.NewBufferString(`{"stageId":"stage-7","message":"把设计稿图生 HTML","agentType":"code-restore-agent"}`)

	request := httptest.NewRequest(http.MethodPost, "/api/agent-runs", body)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d", response.Code)
	}

	var run workflow.AgentRunResponse
	if err := json.NewDecoder(response.Body).Decode(&run); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if run.Agent.Mode != "image-to-html" {
		t.Fatalf("expected image-to-html agent mode, got %q", run.Agent.Mode)
	}
	if run.HandoffPrompt == "" {
		t.Fatalf("expected handoff prompt")
	}
}

func TestImageMakeRunHistory(t *testing.T) {
	handler := testHandler(t)
	body := bytes.NewBufferString(`{
		"id":"image-run-test",
		"title":"海鲜配送首页",
		"prompt":"生成移动端 UI",
		"stage":"html",
		"designUrl":"https://example.com/design.png",
		"assetCount":3,
		"htmlReady":true,
		"data":{"prompt":"生成移动端 UI","html":"<html></html>"}
	}`)

	saveRequest := httptest.NewRequest(http.MethodPost, "/api/image-make-runs", body)
	saveResponse := httptest.NewRecorder()
	handler.ServeHTTP(saveResponse, saveRequest)
	if saveResponse.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d: %s", saveResponse.Code, saveResponse.Body.String())
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/image-make-runs", nil)
	listResponse := httptest.NewRecorder()
	handler.ServeHTTP(listResponse, listRequest)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", listResponse.Code)
	}

	var payload struct {
		Runs []history.ImageMakeRun `json:"runs"`
	}
	if err := json.NewDecoder(listResponse.Body).Decode(&payload); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(payload.Runs) != 1 || payload.Runs[0].ID != "image-run-test" {
		t.Fatalf("unexpected history runs: %+v", payload.Runs)
	}
	if !payload.Runs[0].HTMLReady || payload.Runs[0].AssetCount != 3 {
		t.Fatalf("history metadata was not saved: %+v", payload.Runs[0])
	}
}

func testHandler(t *testing.T) http.Handler {
	t.Helper()
	store, err := history.OpenStore(filepath.Join(t.TempDir(), "image-make-history.sqlite"))
	if err != nil {
		t.Fatalf("open history store: %v", err)
	}
	t.Cleanup(func() {
		_ = store.Close()
	})
	return NewServer(testService(t), slog.New(slog.NewTextHandler(io.Discard, nil)), store)
}

func testService(t *testing.T) *workflow.Service {
	t.Helper()
	return workflow.NewService(workflow.Config{
		StorePath: filepath.Join(t.TempDir(), "workflow-state.json"),
	})
}
