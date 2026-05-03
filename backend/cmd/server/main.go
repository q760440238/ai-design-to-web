package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ai-design-to-web/backend/internal/history"
	"ai-design-to-web/backend/internal/httpapi"
	"ai-design-to-web/backend/internal/workflow"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	service := workflow.NewService(workflow.Config{
		StorePath: os.Getenv("WORKFLOW_STORE_PATH"),
		DocsRoot:  os.Getenv("WORKFLOW_DOCS_ROOT"),
	})

	historyStore, err := history.OpenStore(os.Getenv("IMAGE_MAKE_HISTORY_DB_PATH"))
	if err != nil {
		logger.Error("failed to open image make history store", "error", err)
		os.Exit(1)
	}
	defer historyStore.Close()

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           httpapi.NewServer(service, logger, historyStore),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("backend listening", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
		os.Exit(1)
	}
	logger.Info("backend stopped")
}
