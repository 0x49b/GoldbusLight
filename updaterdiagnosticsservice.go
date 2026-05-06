package main

import (
	"os"
	"os/user"
	"path/filepath"
	"runtime"
	"strconv"
	"syscall"
	"time"

	"github.com/wailsapp/wails/v3/pkg/services/selfupdate"
)

type PathPermissionDiagnostic struct {
	Path      string `json:"path"`
	Exists    bool   `json:"exists"`
	IsDir     bool   `json:"isDir"`
	Mode      string `json:"mode,omitempty"`
	OwnerUID  int    `json:"ownerUid,omitempty"`
	OwnerGID  int    `json:"ownerGid,omitempty"`
	Writable  bool   `json:"writable"`
	WriteTest string `json:"writeTest,omitempty"`
	Error     string `json:"error,omitempty"`
}

type UpdatePermissionDiagnostics struct {
	TimestampUTC     string                   `json:"timestampUtc"`
	GOOS             string                   `json:"goos"`
	GOARCH           string                   `json:"goarch"`
	Username         string                   `json:"username,omitempty"`
	RuntimeUID       int                      `json:"runtimeUid"`
	RuntimeGID       int                      `json:"runtimeGid"`
	ExecutablePath   string                   `json:"executablePath,omitempty"`
	ExecutablePathErr string                  `json:"executablePathError,omitempty"`
	ExecutableDir    string                   `json:"executableDir,omitempty"`
	CanUpdate        bool                     `json:"canUpdate"`
	Paths            []PathPermissionDiagnostic `json:"paths"`
}

type UpdaterDiagnosticsService struct {
	updater *selfupdate.Service
}

func NewUpdaterDiagnosticsService(updater *selfupdate.Service) *UpdaterDiagnosticsService {
	return &UpdaterDiagnosticsService{updater: updater}
}

func (s *UpdaterDiagnosticsService) GetUpdatePermissionDiagnostics() UpdatePermissionDiagnostics {
	diag := UpdatePermissionDiagnostics{
		TimestampUTC: time.Now().UTC().Format(time.RFC3339),
		GOOS:         runtime.GOOS,
		GOARCH:       runtime.GOARCH,
		RuntimeUID:   os.Getuid(),
		RuntimeGID:   os.Getgid(),
	}

	if u, err := user.LookupId(strconv.Itoa(diag.RuntimeUID)); err == nil {
		diag.Username = u.Username
	}

	exePath, exeErr := os.Executable()
	if exeErr == nil {
		if resolved, err := filepath.EvalSymlinks(exePath); err == nil {
			exePath = resolved
		} else {
			diag.ExecutablePathErr = err.Error()
		}
	} else {
		diag.ExecutablePathErr = exeErr.Error()
	}

	diag.ExecutablePath = exePath
	if exePath != "" {
		diag.ExecutableDir = filepath.Dir(exePath)
	}

	if s.updater != nil {
		diag.CanUpdate = s.updater.CanUpdate()
	}

	paths := []string{}
	if diag.ExecutableDir != "" {
		paths = append(paths, diag.ExecutableDir)
	}
	if diag.ExecutablePath != "" {
		paths = append(paths, diag.ExecutablePath)
		paths = append(paths, filepath.Join(diag.ExecutableDir, "."+filepath.Base(diag.ExecutablePath)+".new"))
		paths = append(paths, filepath.Join(diag.ExecutableDir, "."+filepath.Base(diag.ExecutablePath)+".old"))
	}

	seen := map[string]bool{}
	for _, p := range paths {
		if p == "" || seen[p] {
			continue
		}
		seen[p] = true
		diag.Paths = append(diag.Paths, inspectPathPermission(p))
	}

	return diag
}

func inspectPathPermission(path string) PathPermissionDiagnostic {
	out := PathPermissionDiagnostic{Path: path}
	info, err := os.Stat(path)
	if err != nil {
		out.Error = err.Error()
		if os.IsNotExist(err) {
			out.Exists = false
		}
		parent := filepath.Dir(path)
		out.WriteTest = testDirWritable(parent)
		out.Writable = out.WriteTest == ""
		return out
	}

	out.Exists = true
	out.IsDir = info.IsDir()
	out.Mode = info.Mode().String()
	if st, ok := info.Sys().(*syscall.Stat_t); ok {
		out.OwnerUID = int(st.Uid)
		out.OwnerGID = int(st.Gid)
	}

	if out.IsDir {
		out.WriteTest = testDirWritable(path)
	} else {
		out.WriteTest = testFileWritable(path)
	}
	out.Writable = out.WriteTest == ""
	return out
}

func testDirWritable(dir string) string {
	tmp := filepath.Join(dir, ".goldbuslight-permcheck-"+strconv.FormatInt(time.Now().UnixNano(), 10))
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o600)
	if err != nil {
		return err.Error()
	}
	_ = f.Close()
	_ = os.Remove(tmp)
	return ""
}

func testFileWritable(path string) string {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_APPEND, 0)
	if err != nil {
		return err.Error()
	}
	_ = f.Close()
	return ""
}
