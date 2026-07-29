package remotehttp

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"goldbus/internal/controller"
)

const defaultPort = controller.DefaultCompanionPort

// Server serves the phone companion SPA and JSON API over LAN/AP.
type Server struct {
	ctrl   *controller.WLEDController
	assets fs.FS
	logger *log.Logger

	// devFrontend, when set (typically FRONTEND_DEVSERVER_URL during `wails3 dev`),
	// reverse-proxies non-API requests to Vite so companion UI changes hot-reload.
	devFrontend *url.URL

	mu       sync.Mutex
	enabled  bool
	port     int
	httpSrv  *http.Server
	listener net.Listener
}

// New creates a companion server. assets should contain companion.html at the root
// (or under frontend/dist after Sub). Pass nil assets to serve API-only.
func New(ctrl *controller.WLEDController, assets fs.FS, logger *log.Logger) *Server {
	if logger == nil {
		logger = log.Default()
	}
	return &Server{
		ctrl:   ctrl,
		assets: assets,
		logger: logger,
		port:   defaultPort,
	}
}

// UseDevFrontend proxies the companion UI to a Vite (or other) dev server.
// Empty or invalid URLs are ignored. Call before Run/Sync.
// Prefer GOLDBUS_COMPANION_VITE_URL, else FRONTEND_DEVSERVER_URL (set by wails3 dev).
func (s *Server) UseDevFrontend(raw string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		s.logger.Printf("companion: ignoring invalid dev frontend URL %q", raw)
		return
	}
	s.devFrontend = u
	s.logger.Printf("companion: UI hot-reload via %s (API still served locally)", u.String())
}

// Run syncs the listener with controller settings until ctx is cancelled.
func (s *Server) Run(ctx context.Context) {
	s.Sync()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			s.Stop()
			return
		case <-ticker.C:
			s.Sync()
		}
	}
}

// Sync starts, stops, or restarts the HTTP listener to match current settings.
func (s *Server) Sync() {
	if s.ctrl == nil {
		s.Stop()
		return
	}
	settings := s.ctrl.Snapshot().Settings.Companion
	port := settings.Port
	if port <= 0 || port > 65535 {
		port = defaultPort
	}

	s.mu.Lock()
	needRestart := s.httpSrv != nil && (s.enabled != settings.Enabled || s.port != port)
	running := s.httpSrv != nil
	s.mu.Unlock()

	if !settings.Enabled {
		s.Stop()
		return
	}
	if running && !needRestart {
		return
	}
	if needRestart {
		s.Stop()
	}
	if err := s.start(port); err != nil {
		s.logger.Printf("companion http: %v", err)
	}
}

// Stop shuts down the HTTP listener if running.
func (s *Server) Stop() {
	s.mu.Lock()
	srv := s.httpSrv
	listener := s.listener
	s.httpSrv = nil
	s.listener = nil
	s.enabled = false
	s.mu.Unlock()

	if srv == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	if listener != nil {
		_ = listener.Close()
	}
	s.logger.Printf("companion http: stopped")
}

// CompanionStatus is returned to the desktop UI and /api/info.
type CompanionStatus struct {
	Enabled   bool     `json:"enabled"`
	Listening bool     `json:"listening"`
	Port      int      `json:"port"`
	URLs      []string `json:"urls"`
	QRDataURL string   `json:"qrDataUrl,omitempty"`
}

func (s *Server) Status() CompanionStatus {
	snap := controller.ControllerSnapshot{}
	if s.ctrl != nil {
		snap = s.ctrl.Snapshot()
	}
	cfg := snap.Settings.Companion
	port := cfg.Port
	if port <= 0 || port > 65535 {
		port = defaultPort
	}

	s.mu.Lock()
	listening := s.httpSrv != nil && s.listener != nil
	listenPort := s.port
	s.mu.Unlock()

	if listening {
		port = listenPort
	}
	urls := CompanionURLs(port)
	return CompanionStatus{
		Enabled:   cfg.Enabled,
		Listening: listening,
		Port:      port,
		URLs:      urls,
		QRDataURL: CompanionQRDataURL(urls),
	}
}

func (s *Server) start(port int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.httpSrv != nil {
		return nil
	}

	mux := http.NewServeMux()
	s.registerAPI(mux)
	s.registerStatic(mux)

	addr := net.JoinHostPort("0.0.0.0", strconv.Itoa(port))
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("listen %s: %w", addr, err)
	}

	srv := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	s.httpSrv = srv
	s.listener = listener
	s.enabled = true
	s.port = port

	go func() {
		s.logger.Printf("companion http: listening on http://0.0.0.0:%d/", port)
		err := srv.Serve(listener)
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			s.logger.Printf("companion http: serve error: %v", err)
		}
	}()
	return nil
}

func (s *Server) registerStatic(mux *http.ServeMux) {
	if s.devFrontend != nil {
		mux.Handle("/", s.devFrontendProxy())
		return
	}

	if s.assets == nil {
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/" {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = w.Write([]byte("Goldbus companion API is running. Build the companion UI to serve the phone interface.\n"))
		})
		return
	}

	fileServer := http.FileServer(http.FS(s.assets))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" || path == "" {
			// Prefer dedicated companion entry; fall back to index.html.
			for _, name := range []string{"companion.html", "index.html"} {
				if f, err := s.assets.Open(name); err == nil {
					_ = f.Close()
					r.URL.Path = "/" + name
					fileServer.ServeHTTP(w, r)
					return
				}
			}
			http.NotFound(w, r)
			return
		}
		// SPA-style: unknown paths without a file extension serve companion.html
		if !strings.Contains(strings.TrimPrefix(path, "/"), ".") {
			if f, err := s.assets.Open("companion.html"); err == nil {
				_ = f.Close()
				r.URL.Path = "/companion.html"
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		fileServer.ServeHTTP(w, r)
	})
}

// devFrontendProxy reverse-proxies UI (and Vite HMR websockets) to the frontend
// dev server. "/" is rewritten to companion.html so the phone URL stays the same.
func (s *Server) devFrontendProxy() http.Handler {
	target := s.devFrontend
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.FlushInterval = -1 // stream HMR websockets / SSE without buffering
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = target.Host
		if req.URL.Path == "/" || req.URL.Path == "" {
			req.URL.Path = "/companion.html"
			req.URL.RawPath = "/companion.html"
		}
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		s.logger.Printf("companion vite proxy %s: %v", r.URL.Path, err)
		http.Error(w, "companion frontend dev server unavailable; is Vite running?", http.StatusBadGateway)
	}
	return proxy
}
