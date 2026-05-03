package history

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

var ErrNotFound = errors.New("history run not found")

type Store struct {
	db *sql.DB
}

type ImageMakeRun struct {
	ID         string          `json:"id"`
	Title      string          `json:"title"`
	Prompt     string          `json:"prompt"`
	Stage      string          `json:"stage"`
	DesignURL  string          `json:"designUrl"`
	AssetCount int             `json:"assetCount"`
	HTMLReady  bool            `json:"htmlReady"`
	Data       json.RawMessage `json:"data"`
	CreatedAt  time.Time       `json:"createdAt"`
	UpdatedAt  time.Time       `json:"updatedAt"`
}

func OpenStore(path string) (*Store, error) {
	if path == "" {
		path = filepath.Join("data", "image-make-history.sqlite")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create history directory: %w", err)
	}

	db, err := sql.Open("sqlite3", path+"?_busy_timeout=5000&_journal_mode=WAL")
	if err != nil {
		return nil, fmt.Errorf("open sqlite history store: %w", err)
	}

	store := &Store{db: db}
	if err := store.migrate(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) ListImageMakeRuns(ctx context.Context, limit int) ([]ImageMakeRun, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, title, prompt, stage, design_url, asset_count, html_ready, data_json, created_at, updated_at
		FROM image_make_runs
		ORDER BY updated_at DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list image make runs: %w", err)
	}
	defer rows.Close()

	runs := make([]ImageMakeRun, 0)
	for rows.Next() {
		var run ImageMakeRun
		var data string
		var htmlReady int
		var createdAt string
		var updatedAt string
		if err := rows.Scan(
			&run.ID,
			&run.Title,
			&run.Prompt,
			&run.Stage,
			&run.DesignURL,
			&run.AssetCount,
			&htmlReady,
			&data,
			&createdAt,
			&updatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan image make run: %w", err)
		}
		run.HTMLReady = htmlReady == 1
		run.Data = json.RawMessage(data)
		run.CreatedAt = parseTime(createdAt)
		run.UpdatedAt = parseTime(updatedAt)
		runs = append(runs, run)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate image make runs: %w", err)
	}
	return runs, nil
}

func (s *Store) GetImageMakeRun(ctx context.Context, id string) (ImageMakeRun, error) {
	var run ImageMakeRun
	var data string
	var htmlReady int
	var createdAt string
	var updatedAt string
	err := s.db.QueryRowContext(ctx, `
		SELECT id, title, prompt, stage, design_url, asset_count, html_ready, data_json, created_at, updated_at
		FROM image_make_runs
		WHERE id = ?
	`, strings.TrimSpace(id)).Scan(
		&run.ID,
		&run.Title,
		&run.Prompt,
		&run.Stage,
		&run.DesignURL,
		&run.AssetCount,
		&htmlReady,
		&data,
		&createdAt,
		&updatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return ImageMakeRun{}, ErrNotFound
	}
	if err != nil {
		return ImageMakeRun{}, fmt.Errorf("get image make run: %w", err)
	}

	run.HTMLReady = htmlReady == 1
	run.Data = json.RawMessage(data)
	run.CreatedAt = parseTime(createdAt)
	run.UpdatedAt = parseTime(updatedAt)
	return run, nil
}

func (s *Store) UpsertImageMakeRun(ctx context.Context, run ImageMakeRun) (ImageMakeRun, error) {
	run.ID = strings.TrimSpace(run.ID)
	if run.ID == "" {
		return ImageMakeRun{}, errors.New("image make run id is required")
	}
	run.Title = strings.TrimSpace(run.Title)
	run.Prompt = strings.TrimSpace(run.Prompt)
	run.Stage = strings.TrimSpace(run.Stage)
	run.DesignURL = strings.TrimSpace(run.DesignURL)
	if len(run.Data) == 0 {
		run.Data = json.RawMessage(`{}`)
	}
	if !json.Valid(run.Data) {
		return ImageMakeRun{}, errors.New("image make run data must be valid JSON")
	}
	now := time.Now().UTC()
	if run.CreatedAt.IsZero() {
		run.CreatedAt = now
	}
	if run.UpdatedAt.IsZero() {
		run.UpdatedAt = now
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO image_make_runs (
			id, title, prompt, stage, design_url, asset_count, html_ready, data_json, created_at, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			prompt = excluded.prompt,
			stage = excluded.stage,
			design_url = excluded.design_url,
			asset_count = excluded.asset_count,
			html_ready = excluded.html_ready,
			data_json = excluded.data_json,
			updated_at = excluded.updated_at
	`, run.ID, run.Title, run.Prompt, run.Stage, run.DesignURL, run.AssetCount, boolToInt(run.HTMLReady), string(run.Data), run.CreatedAt.Format(time.RFC3339Nano), run.UpdatedAt.Format(time.RFC3339Nano))
	if err != nil {
		return ImageMakeRun{}, fmt.Errorf("upsert image make run: %w", err)
	}
	return run, nil
}

func (s *Store) migrate(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS image_make_runs (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL DEFAULT '',
			prompt TEXT NOT NULL DEFAULT '',
			stage TEXT NOT NULL DEFAULT '',
			design_url TEXT NOT NULL DEFAULT '',
			asset_count INTEGER NOT NULL DEFAULT 0,
			html_ready INTEGER NOT NULL DEFAULT 0,
			data_json TEXT NOT NULL DEFAULT '{}',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_image_make_runs_updated_at ON image_make_runs(updated_at DESC);
	`)
	if err != nil {
		return fmt.Errorf("migrate image make history store: %w", err)
	}
	return nil
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func parseTime(value string) time.Time {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}
	}
	return parsed
}
