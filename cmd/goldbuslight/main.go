package main

import (
	"context"
	"goldbus/internal/controller"
	"log"
	"os"
	"sync"
	"time"

	"goldbus"
	"goldbus/internal/logging"
	"goldbus/internal/service"

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

func main() {
	defer logging.InitFileLogger()()

	controller := controller.NewWLEDController(log.Default())
	if err := controller.Start(context.Background()); err != nil {
		log.Printf("controller startup failed: %v", err)
	}
	defer controller.Stop()

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

	// App Updater
	const currentVersion = "0.0.1"

	gh, err := github.New(github.Config{
		Repository:    "0x49b/GoldbusLight",
		ChecksumAsset: "SHA256SUMS",
	})

	if err != nil {
		log.Fatalf("github.New: %v", err)
	}

	if err := app.Updater.Init(updater.Config{
		CurrentVersion: currentVersion,
		Providers:      []updater.Provider{gh},
	}); err != nil {
		log.Fatalf("updater.Init: %v", err)
	}

	// App Updater Menu
	menu := app.Menu.New()
	app.Menu.SetApplicationMenu(menu)
	appMenu := menu.AddSubmenu("App")
	appMenu.Add("Check for Updates…").OnClick(func(*application.Context) {
		go func() {
			if err := app.Updater.CheckAndInstall(context.Background()); err != nil {
				app.Logger.Error("update", "error", err)
			}
		}()
	})
	appMenu.Add("Quit").OnClick(func(*application.Context) {
		confirmationQuit(app)
	})

	startState := application.WindowStateNormal
	if os.Getenv("GOLDBUS_FULLSCREEN") == "1" {
		startState = application.WindowStateFullscreen
	}
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Goldbus Light Controller",
		StartState:       startState,
		Width:            1400,
		Height:           788,
		BackgroundColour: application.NewRGB(255, 255, 255),
		URL:              "/",
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

	greetService := service.NewGreetService(controller, service.ConsoleWindowCallbacks{
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
	})
	app.RegisterService(application.NewService(greetService))

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
				app.Event.Emit("controller:snapshot", controller.Snapshot())
			}()
			time.Sleep(time.Second)
		}
	}()

	err = app.Run()
	if err != nil {
		log.Fatal(err)
	}
}

func confirmationQuit(app *application.App) {
	dialog := app.Dialog.Question().SetTitle("Quit").SetMessage("Do you want Quit the Application?")
	yes := dialog.AddButton("Yes")
	yes.OnClick(func() {
		app.Quit()
	})
	no := dialog.AddButton("No")
	dialog.SetDefaultButton(no)
	dialog.Show()
}
