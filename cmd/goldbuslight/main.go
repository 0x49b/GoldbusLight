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

	startState := application.WindowStateNormal
	if os.Getenv("GOLDBUS_FULLSCREEN") == "1" {
		startState = application.WindowStateFullscreen
	}
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Goldbus Licht Controller",
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

	greetService := service.NewGreetService(controller, service.ConsoleWindowCallbacks{
		Open:       openDetachedConsoleWindow,
		Close:      closeDetachedConsoleWindow,
		IsDetached: isDetachedConsoleWindow,
	})
	app.RegisterService(application.NewService(greetService))

	go func() {
		for {
			now := time.Now().Format(time.RFC1123)
			app.Event.Emit("time", now)
			app.Event.Emit("controller:snapshot", controller.Snapshot())
			time.Sleep(time.Second)
		}
	}()

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
