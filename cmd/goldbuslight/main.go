package main

import (
	"context"
	"io/fs"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"goldbus"
	"goldbus/internal/controller"
	"goldbus/internal/logging"
	"goldbus/internal/remotehttp"
	"goldbus/internal/service"
	"goldbus/internal/updates"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

func init() {
	// Register a custom event whose associated data type is string.
	// This is not required, but the binding generator will pick up registered events
	// and provide a strongly typed JS/TS API for them.
	application.RegisterEvent[string]("time")
	application.RegisterEvent[controller.ControllerSnapshot]("controller:snapshot")
	application.RegisterEvent[string]("controller:error")
}

var applicationQuitting bool

func main() {
	defer logging.InitFileLogger()()

	ctrl := controller.NewWLEDController(log.Default())
	if err := ctrl.Start(context.Background()); err != nil {
		log.Printf("controller startup failed: %v", err)
	}
	defer ctrl.Stop()

	var companionAssets fs.FS
	if sub, err := goldbus.FrontendDist(); err != nil {
		log.Printf("companion assets: %v", err)
	} else {
		companionAssets = sub
	}
	companion := remotehttp.New(ctrl, companionAssets, log.Default())
	// Hot-reload companion UI during `wails3 dev` / `task dev` (Vite via FRONTEND_DEVSERVER_URL).
	// Override with GOLDBUS_COMPANION_VITE_URL if needed.
	if vite := companionDevFrontendURL(); vite != "" {
		companion.UseDevFrontend(vite)
	}
	companionCtx, companionCancel := context.WithCancel(context.Background())
	defer companionCancel()
	go companion.Run(companionCtx)

	// 1400 x 1020
	app := application.New(application.Options{
		Name:        "Goldbus Light Controller",
		Description: "Application to control 'smart' Lights in the Goldbus",
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(goldbus.Dist),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	// App Updater (disabled on managed Pi installs — use scripts/goldbuslight-pi.sh update)
	var checkAndInstall func(context.Context) error
	if updates.InAppUpdatesSupported() {
		gh, err := github.New(github.Config{
			Repository:    "0x49b/GoldbusLight",
			ChecksumAsset: "SHA256SUMS",
		})
		if err != nil {
			log.Fatalf("github.New: %v", err)
		}
		if err := app.Updater.Init(updater.Config{
			CurrentVersion: goldbus.EffectiveAppVersion(),
			Providers:      []updater.Provider{gh},
		}); err != nil {
			log.Fatalf("updater.Init: %v", err)
		}
		checkAndInstall = app.Updater.CheckAndInstall
	} else {
		log.Printf("in-app updater disabled for managed install layout")
	}

	// App Menu
	/*menu := app.Menu.New()
	app.Menu.SetApplicationMenu(menu)
	appMenu := menu.AddSubmenu("App")
	if checkAndInstall != nil {
		appMenu.Add("Check for Updates…").OnClick(func(*application.Context) {
			go func() {
				if err := checkAndInstall(context.Background()); err != nil {
					app.Logger.Error("update", "error", err)
				}
			}()
		})
	}
	appMenu.Add("Quit").OnClick(func(*application.Context) {
		confirmApplicationQuit(app)
	})*/

	startState := application.WindowStateNormal
	if os.Getenv("GOLDBUS_FULLSCREEN") == "1" {
		startState = application.WindowStateFullscreen
	}
	mainWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Goldbus Light Controller",
		StartState:       startState,
		Width:            1400,
		Height:           788,
		BackgroundColour: application.NewRGB(255, 255, 255),
		URL:              "/",
	})
	mainWindow.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		if applicationQuitting {
			return
		}
		e.Cancel()
		confirmApplicationQuit(app)
	})
	afterWebviewCreated()

	var consoleWindowMu sync.Mutex
	var consoleWindow *application.WebviewWindow

	openDetachedConsoleWindow := func() error {
		consoleWindowMu.Lock()
		defer consoleWindowMu.Unlock()
		if consoleWindow != nil {
			consoleWindow.Show()
			consoleWindow.Focus()
			return nil
		}
		win := app.Window.NewWithOptions(application.WebviewWindowOptions{
			Name:             "detached-console",
			Title:            "Goldbus Transport Console",
			Width:            960,
			Height:           680,
			BackgroundColour: application.NewRGB(255, 255, 255),
			URL:              "/?view=console-window",
		})
		win.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
			consoleWindowMu.Lock()
			if consoleWindow == win {
				consoleWindow = nil
			}
			consoleWindowMu.Unlock()
		})
		consoleWindow = win
		return nil
	}

	closeDetachedConsoleWindow := func() error {
		consoleWindowMu.Lock()
		win := consoleWindow
		consoleWindowMu.Unlock()
		if win != nil {
			win.Close()
		}
		return nil
	}

	isDetachedConsoleWindow := func() bool {
		consoleWindowMu.Lock()
		defer consoleWindowMu.Unlock()
		return consoleWindow != nil
	}

	// Save dialog: compound suffix is fine (macOS save panel ignores Filters today).
	backupFilter := application.FileFilter{
		DisplayName: "Goldbus configuration backup",
		Pattern:     "*.goldbus-backup.json;*.json",
	}
	// Open dialog: macOS UTType only accepts simple extensions; "*.goldbus-backup.json"
	// becomes "goldbus-backup.json" and yields a nil UTType → NSInvalidArgumentException crash.
	importBackupFilter := application.FileFilter{
		DisplayName: "Goldbus configuration backup",
		Pattern:     "*.json",
	}

	appService := service.NewGoldbusLightService(ctrl, service.ConsoleWindowCallbacks{
		Open:       openDetachedConsoleWindow,
		Close:      closeDetachedConsoleWindow,
		IsDetached: isDetachedConsoleWindow,
	}, service.ConfigurationBackupCallbacks{
		PromptSavePath: func(suggestedFilename string) (string, error) {
			dialog := app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
				Title:    "Export Goldbus configuration",
				Filename: suggestedFilename,
				Filters:  []application.FileFilter{backupFilter},
			})
			return dialog.PromptForSingleSelection()
		},
		PromptOpenPath: func() (string, error) {
			return app.Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
				Message: "Import Goldbus configuration",
				Filters: []application.FileFilter{importBackupFilter},
			}).PromptForSingleSelection()
		},
		PromptSaveFixturePath: func(suggestedFilename string) (string, error) {
			dialog := app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
				Title:    "Export DMX fixture",
				Filename: suggestedFilename,
				Filters:  []application.FileFilter{importBackupFilter},
			})
			return dialog.PromptForSingleSelection()
		},
	}, service.UpdateCallbacks{
		CheckAndInstall: checkAndInstall,
	})
	appService.SetCompanionStatusProvider(func() service.CompanionStatus {
		st := companion.Status()
		return service.CompanionStatus{
			Enabled:   st.Enabled,
			Listening: st.Listening,
			Port:      st.Port,
			URLs:      st.URLs,
		}
	})
	app.RegisterService(application.NewService(appService))

	go func() {
		for {
			now := time.Now().Format(time.RFC1123)
			app.Event.Emit("time", now)
			func() {
				defer func() {
					if recovered := recover(); recovered != nil {
						log.Printf("controller snapshot panic: %v", recovered)
					}
				}()
				app.Event.Emit("controller:snapshot", ctrl.Snapshot())
			}()
			time.Sleep(time.Second)
		}
	}()

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

func confirmApplicationQuit(app *application.App) {
	dialog := app.Dialog.Question().SetTitle("Quit").SetMessage("Do you want to quit the application?")
	yes := dialog.AddButton("Yes")
	yes.OnClick(func() {
		applicationQuitting = true
		app.Quit()
	})
	no := dialog.AddButton("No")
	dialog.SetDefaultButton(no)
	dialog.Show()
}

// companionDevFrontendURL returns the Vite base URL for companion UI hot-reload.
func companionDevFrontendURL() string {
	if v := strings.TrimSpace(os.Getenv("GOLDBUS_COMPANION_VITE_URL")); v != "" {
		return v
	}
	return strings.TrimSpace(os.Getenv("FRONTEND_DEVSERVER_URL"))
}
