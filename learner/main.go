package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/segmentio/kafka-go"
)

type config struct {
	KafkaBrokers     []string
	KafkaTopic       string
	KafkaGroupID     string
	HTTPAddr         string
	WorkerConfigPath string
}

type workerConfig struct {
	WorkerURLs []string `json:"workerUrls"`
}

type telemetryRecord struct {
	Decision struct {
		WorkerURL string `json:"workerUrl"`
	} `json:"decision"`
	Outcome struct {
		StatusCode int   `json:"statusCode"`
		Success    *bool `json:"success"`
	} `json:"outcome"`
	Reward float64 `json:"reward"`
}

type workerStats struct {
	Successes   int64
	Failures    int64
	LastUpdated time.Time
}

type learner struct {
	statsMu sync.RWMutex
	stats   map[string]*workerStats

	rngMu sync.Mutex
	rng   *rand.Rand
}

func main() {
	cfg := loadConfig()

	workerURLs, err := loadWorkerURLs(cfg.WorkerConfigPath)
	if err != nil {
		log.Fatalf("failed to load worker config: %v", err)
	}

	if len(workerURLs) == 0 {
		log.Fatal("no worker URLs configured; learner cannot start")
	}

	l := &learner{
		stats: make(map[string]*workerStats),
		rng:   rand.New(rand.NewSource(time.Now().UnixNano())),
	}

	for _, url := range workerURLs {
		l.ensureWorker(url)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		cancel()
	}()

	go l.consumeTelemetry(ctx, cfg)

	server := &http.Server{
		Addr:    cfg.HTTPAddr,
		Handler: l.routes(),
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancelShutdown()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("http server shutdown error: %v", err)
		}
	}()

	log.Printf("learner listening on %s (kafka brokers: %s, topic: %s)", cfg.HTTPAddr, strings.Join(cfg.KafkaBrokers, ","), cfg.KafkaTopic)

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("http server error: %v", err)
	}
}

func loadConfig() config {
	return config{
		KafkaBrokers:     splitAndTrim(getEnv("LEARNER_KAFKA_BROKERS", "localhost:29092")),
		KafkaTopic:       getEnv("LEARNER_KAFKA_TOPIC", "telemetry"),
		KafkaGroupID:     getEnv("LEARNER_KAFKA_GROUP", "magnetar-learner"),
		HTTPAddr:         getEnv("LEARNER_HTTP_ADDR", ":8090"),
		WorkerConfigPath: getEnv("LEARNER_WORKER_CONFIG", defaultWorkerConfigPath()),
	}
}

func defaultWorkerConfigPath() string {
	// default to ../config/workers.json relative to learner directory
	if cwd, err := os.Getwd(); err == nil {
		return filepath.Clean(filepath.Join(cwd, "..", "config", "workers.json"))
	}
	return "./config/workers.json"
}

func getEnv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func splitAndTrim(value string) []string {
	parts := strings.Split(value, ",")
	var result []string
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func loadWorkerURLs(path string) ([]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg workerConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	return cfg.WorkerURLs, nil
}

func (l *learner) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":    "ok",
			"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		})
	})
	mux.HandleFunc("/stats", l.handleStats)
	mux.HandleFunc("/recommendation", l.handleRecommendation)
	return mux
}

func (l *learner) handleStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("content-type", "application/json")
	snapshot := l.snapshotStats()
	if err := json.NewEncoder(w).Encode(snapshot); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (l *learner) handleRecommendation(w http.ResponseWriter, r *http.Request) {
	rec, err := l.sampleRecommendation()
	if err != nil {
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("content-type", "application/json")
	if err := json.NewEncoder(w).Encode(rec); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (l *learner) snapshotStats() map[string]workerStats {
	l.statsMu.RLock()
	defer l.statsMu.RUnlock()

	result := make(map[string]workerStats, len(l.stats))
	for worker, stats := range l.stats {
		result[worker] = *stats
	}
	return result
}

type recommendation struct {
	WorkerURL    string         `json:"workerUrl"`
	SampledScore float64        `json:"sampledScore"`
	GeneratedAt  string         `json:"generatedAt"`
	Scores       []workerSample `json:"scores"`
}

type workerSample struct {
	WorkerURL string  `json:"workerUrl"`
	Sample    float64 `json:"sample"`
	Mean      float64 `json:"mean"`
	Successes int64   `json:"successes"`
	Failures  int64   `json:"failures"`
}

func (l *learner) sampleRecommendation() (*recommendation, error) {
	l.statsMu.RLock()
	if len(l.stats) == 0 {
		l.statsMu.RUnlock()
		return nil, errors.New("no workers tracked")
	}

	copies := make(map[string]workerStats, len(l.stats))
	for key, value := range l.stats {
		copies[key] = *value
	}
	l.statsMu.RUnlock()

	var bestWorker string
	var bestScore float64
	var allSamples []workerSample

	for worker, stats := range copies {
		alpha := float64(stats.Successes) + 1
		beta := float64(stats.Failures) + 1

		sample := l.sampleBeta(alpha, beta)
		mean := alpha / (alpha + beta)

		ws := workerSample{
			WorkerURL: worker,
			Sample:    sample,
			Mean:      mean,
			Successes: stats.Successes,
			Failures:  stats.Failures,
		}
		allSamples = append(allSamples, ws)

		if bestWorker == "" || sample > bestScore {
			bestWorker = worker
			bestScore = sample
		}
	}

	if bestWorker == "" {
		return nil, errors.New("unable to derive recommendation")
	}

	return &recommendation{
		WorkerURL:    bestWorker,
		SampledScore: bestScore,
		GeneratedAt:  time.Now().UTC().Format(time.RFC3339Nano),
		Scores:       allSamples,
	}, nil
}

func (l *learner) consumeTelemetry(ctx context.Context, cfg config) {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers: cfg.KafkaBrokers,
		Topic:   cfg.KafkaTopic,
		GroupID: cfg.KafkaGroupID,
		// start from the latest if there is no committed offset
		StartOffset: kafka.LastOffset,
		MinBytes:    1e3,
		MaxBytes:    10e6,
	})
	defer reader.Close()

	for {
		m, err := reader.ReadMessage(ctx)
		if err != nil {
			if errors.Is(err, context.Canceled) {
				return
			}
			log.Printf("kafka read error: %v", err)
			time.Sleep(time.Second)
			continue
		}

		if err := l.processMessage(m.Value); err != nil {
			log.Printf("telemetry decode error: %v", err)
		}
	}
}

func (l *learner) processMessage(value []byte) error {
	var record telemetryRecord
	if err := json.Unmarshal(value, &record); err != nil {
		return fmt.Errorf("decode telemetry: %w", err)
	}

	worker := strings.TrimSpace(record.Decision.WorkerURL)
	if worker == "" {
		return errors.New("telemetry missing workerUrl")
	}

	success := deriveSuccess(record)

	l.updateWorker(worker, success)
	return nil
}

func deriveSuccess(record telemetryRecord) bool {
	if record.Outcome.Success != nil {
		return *record.Outcome.Success
	}
	return record.Outcome.StatusCode >= 200 && record.Outcome.StatusCode < 500
}

func (l *learner) ensureWorker(worker string) {
	l.statsMu.Lock()
	defer l.statsMu.Unlock()
	if _, ok := l.stats[worker]; !ok {
		l.stats[worker] = &workerStats{
			Successes:   0,
			Failures:    0,
			LastUpdated: time.Now(),
		}
	}
}

func (l *learner) updateWorker(worker string, success bool) {
	l.statsMu.Lock()
	stats, ok := l.stats[worker]
	if !ok {
		stats = &workerStats{}
		l.stats[worker] = stats
	}
	if success {
		stats.Successes++
	} else {
		stats.Failures++
	}
	stats.LastUpdated = time.Now()
	l.statsMu.Unlock()
}

func (l *learner) sampleBeta(alpha, beta float64) float64 {
	x := sampleGamma(alpha, 1, l.randFloat64, l.randNormFloat64)
	y := sampleGamma(beta, 1, l.randFloat64, l.randNormFloat64)
	return x / (x + y)
}

func (l *learner) randFloat64() float64 {
	l.rngMu.Lock()
	defer l.rngMu.Unlock()
	return l.rng.Float64()
}

func (l *learner) randNormFloat64() float64 {
	l.rngMu.Lock()
	defer l.rngMu.Unlock()
	return l.rng.NormFloat64()
}

func sampleGamma(shape, scale float64, randFloat func() float64, randNorm func() float64) float64 {
	if shape <= 0 || scale <= 0 {
		return 0
	}
	if shape < 1 {
		return sampleGamma(shape+1, scale, randFloat, randNorm) * math.Pow(randFloat(), 1/shape)
	}

	d := shape - 1.0/3.0
	c := 1.0 / math.Sqrt(9*d)

	for {
		x := randNorm()
		v := 1 + c*x
		if v <= 0 {
			continue
		}
		v = v * v * v
		u := randFloat()
		if u < 1-0.331*math.Pow(x, 4) {
			return scale * d * v
		}
		if math.Log(u) < 0.5*x*x+d*(1-v+math.Log(v)) {
			return scale * d * v
		}
	}
}
