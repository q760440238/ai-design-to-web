package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ai-design-to-web/backend/internal/history"
	"ai-design-to-web/backend/internal/workflow"
)

type Server struct {
	service      *workflow.Service
	historyStore *history.Store
	logger       *slog.Logger
}

func NewServer(service *workflow.Service, logger *slog.Logger, historyStores ...*history.Store) http.Handler {
	var historyStore *history.Store
	if len(historyStores) > 0 {
		historyStore = historyStores[0]
	}
	server := &Server{service: service, historyStore: historyStore, logger: logger}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", server.health)
	mux.HandleFunc("GET /api/workflow", server.workflow)
	mux.HandleFunc("GET /api/documents", server.documents)
	mux.HandleFunc("GET /api/documents/", server.document)
	mux.HandleFunc("POST /api/agent-runs", server.runAgent)
	mux.HandleFunc("POST /api/project-plans", server.createProjectPlan)
	mux.HandleFunc("GET /api/image-make-runs", server.imageMakeRuns)
	mux.HandleFunc("GET /api/image-make-runs/", server.imageMakeRun)
	mux.HandleFunc("POST /api/image-make-runs", server.saveImageMakeRun)
	mux.HandleFunc("PATCH /api/stages/", server.updateStageStatus)
	return server.withMiddleware(mux)
}

func (s *Server) withMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
		s.logger.Info("request completed", "method", r.Method, "path", r.URL.Path, "duration", time.Since(started).String())
	})
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"service": "ai-design-to-web",
		"time":    time.Now().UTC(),
	})
}

func (s *Server) workflow(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.service.Snapshot())
}

func (s *Server) documents(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"documents": s.service.Documents(),
	})
}

func (s *Server) document(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimPrefix(r.URL.Path, "/api/documents/")
	if slug == "" {
		writeError(w, http.StatusNotFound, "document slug is required")
		return
	}

	document, err := s.service.Document(slug)
	if err != nil {
		writeError(w, http.StatusNotFound, "document not found")
		return
	}
	writeJSON(w, http.StatusOK, document)
}

func (s *Server) createProjectPlan(w http.ResponseWriter, r *http.Request) {
	var request workflow.ProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	writeJSON(w, http.StatusCreated, s.service.CreateProjectPlan(request))
}

func (s *Server) runAgent(w http.ResponseWriter, r *http.Request) {
	var request workflow.AgentRunRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	response, err := s.service.RunAgent(request)
	if err != nil {
		if errors.Is(err, workflow.ErrNotFound) {
			writeError(w, http.StatusNotFound, "stage not found")
			return
		}
		s.logger.Error("failed to run agent", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to run agent")
		return
	}

	writeJSON(w, http.StatusCreated, response)
}

func (s *Server) imageMakeRuns(w http.ResponseWriter, r *http.Request) {
	if s.historyStore == nil {
		writeError(w, http.StatusServiceUnavailable, "image make history store is not configured")
		return
	}

	limit := 50
	if rawLimit := r.URL.Query().Get("limit"); rawLimit != "" {
		parsedLimit, err := strconv.Atoi(rawLimit)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid limit")
			return
		}
		limit = parsedLimit
	}

	runs, err := s.historyStore.ListImageMakeRuns(r.Context(), limit)
	if err != nil {
		s.logger.Error("failed to list image make runs", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list image make runs")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"runs": runs})
}

func (s *Server) imageMakeRun(w http.ResponseWriter, r *http.Request) {
	if s.historyStore == nil {
		writeError(w, http.StatusServiceUnavailable, "image make history store is not configured")
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/api/image-make-runs/")
	if id == "" {
		writeError(w, http.StatusNotFound, "image make run id is required")
		return
	}

	run, err := s.historyStore.GetImageMakeRun(r.Context(), id)
	if err != nil {
		if errors.Is(err, history.ErrNotFound) {
			writeError(w, http.StatusNotFound, "image make run not found")
			return
		}
		s.logger.Error("failed to get image make run", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to get image make run")
		return
	}
	writeJSON(w, http.StatusOK, run)
}

func (s *Server) saveImageMakeRun(w http.ResponseWriter, r *http.Request) {
	if s.historyStore == nil {
		writeError(w, http.StatusServiceUnavailable, "image make history store is not configured")
		return
	}

	var request history.ImageMakeRun
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	run, err := s.historyStore.UpsertImageMakeRun(r.Context(), request)
	if err != nil {
		s.logger.Error("failed to save image make run", "error", err)
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, run)
}

func (s *Server) updateStageStatus(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/stages/")
	parts := strings.Split(path, "/")
	if len(parts) != 2 || parts[1] != "status" {
		writeError(w, http.StatusNotFound, "stage status route not found")
		return
	}

	var request struct {
		Status workflow.Status `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	stage, err := s.service.UpdateStageStatus(parts[0], request.Status)
	if err != nil {
		switch {
		case errors.Is(err, workflow.ErrInvalidStatus):
			writeError(w, http.StatusBadRequest, "invalid stage status")
		case errors.Is(err, workflow.ErrNotFound):
			writeError(w, http.StatusNotFound, "stage not found")
		default:
			s.logger.Error("failed to update stage status", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to update stage status")
		}
		return
	}
	writeJSON(w, http.StatusOK, stage)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
