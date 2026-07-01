package main

import (
	"crypto/ed25519"
	"encoding/base64"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"goldbus/internal/license"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	switch os.Args[1] {
	case "issue":
		os.Exit(runIssue(os.Args[2:]))
	case "keygen":
		os.Exit(runKeygen())
	case "help", "-h", "--help":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n\n", os.Args[1])
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintf(os.Stderr, `Goldbus Light Controller license generator (admin only)

Usage:
  licensegen issue --customer NAME --customer-id ID --expires YYYY-MM-DD [--machine-id ID] [--private-key FILE]
  licensegen keygen
  licensegen help

Examples:
  licensegen issue --customer "Acme Goldbus" --customer-id cust_abc --expires 2027-06-30
  licensegen issue --customer "Acme Goldbus" --customer-id cust_abc --expires 2027-06-30 --machine-id sha256:...
`)
}

func runIssue(args []string) int {
	fs := flag.NewFlagSet("issue", flag.ExitOnError)
	customer := fs.String("customer", "", "customer display name")
	customerID := fs.String("customer-id", "", "stable customer identifier")
	expires := fs.String("expires", "", "expiration date (YYYY-MM-DD)")
	machineID := fs.String("machine-id", "", "optional machine fingerprint to pre-bind")
	privateKeyPath := fs.String("private-key", "", "Ed25519 private key file (raw 64 bytes or base64); defaults to dev key")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	if strings.TrimSpace(*customer) == "" || strings.TrimSpace(*customerID) == "" || strings.TrimSpace(*expires) == "" {
		fmt.Fprintln(os.Stderr, "customer, customer-id, and expires are required")
		return 2
	}

	expiresAt, err := time.Parse("2006-01-02", strings.TrimSpace(*expires))
	if err != nil {
		fmt.Fprintf(os.Stderr, "invalid expires date: %v\n", err)
		return 2
	}
	expiresAt = time.Date(expiresAt.Year(), expiresAt.Month(), expiresAt.Day(), 23, 59, 59, 0, time.UTC)

	priv, err := loadPrivateKey(*privateKeyPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load private key: %v\n", err)
		return 1
	}

	claims := license.Claims{
		V:            1,
		Product:      license.ProductID,
		Edition:      license.EditionPro,
		CustomerID:   strings.TrimSpace(*customerID),
		CustomerName: strings.TrimSpace(*customer),
		IssuedAt:     time.Now().UTC().Format(time.RFC3339),
		ExpiresAt:    expiresAt.Format(time.RFC3339),
		MachineID:    strings.TrimSpace(*machineID),
	}

	key, err := license.SignClaims(claims, priv)
	if err != nil {
		fmt.Fprintf(os.Stderr, "sign license: %v\n", err)
		return 1
	}

	fmt.Println(key)
	return 0
}

func runKeygen() int {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "generate keypair: %v\n", err)
		return 1
	}
	fmt.Println("Public key (embed in app):")
	fmt.Println(base64.StdEncoding.EncodeToString(pub))
	fmt.Println("Private key (keep offline):")
	fmt.Println(base64.StdEncoding.EncodeToString(priv))
	return 0
}

func loadPrivateKey(path string) (ed25519.PrivateKey, error) {
	if strings.TrimSpace(path) == "" {
		return license.DefaultDevPrivateKey(), nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if len(data) == ed25519.PrivateKeySize {
		return ed25519.PrivateKey(data), nil
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(data)))
	if err == nil && len(decoded) == ed25519.PrivateKeySize {
		return ed25519.PrivateKey(decoded), nil
	}
	return nil, fmt.Errorf("unsupported private key format")
}
