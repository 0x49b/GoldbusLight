package main

import (
	"context"
	"goldbus/internal/controller"
	"log"
	"os"
	"time"

	"goldbus"
	"goldbus/internal/logging"
	"goldbus/internal/service"

	"github.com/wailsapp/wails/v3/pkg/application"
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

	greetService := service.NewGreetService(controller)

	// 1400 x 1020
	app := application.New(application.Options{
		Name:        "Goldbus Light Controller",
		Description: "Application to control 'smart' Lights in the Goldbus",
		Services: []application.Service{
			application.NewService(greetService),
		},
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
