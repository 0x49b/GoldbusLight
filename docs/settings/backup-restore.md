# Backup & restore

Export and import the complete controller configuration for migration, disaster recovery, or cloning a show to another machine.

## Location

**Settings → General → Configuration backup**

## Export backup

1. Click **Export backup**
2. Choose a save location in the native file dialog
3. File extension: `.goldbus-backup.json` or `.json`

### What is included

| Data | Included |
|------|----------|
| Controller settings (WLED, DMX, access point) | Yes |
| WLED device list and metadata | Yes |
| DMX fixtures (channels, party tuning, cues) | Yes |
| Party mode configuration | Yes |
| General tab state (WLED) | Yes |
| Per-fixture live control layouts | Yes |

### What is not included

- Application binary / version (install separately)
- WLED firmware on physical devices
- USB adapter driver state

## Import backup

1. Click **Import backup**
2. Select a `.goldbus-backup.json` file
3. Controller reloads configuration from disk

!!! warning
    Import **replaces** the current on-disk configuration. Export a backup first if you might need to revert.

## Migration workflow

### Source machine

1. **Settings → General → Export backup**
2. Copy the file via USB stick, network share, or cloud storage

### Target machine

1. Install Goldbus Light Controller
2. Launch once to initialize config directories
3. **Settings → General → Import backup**
4. Restart the app if prompted or if devices do not appear
5. Re-select USB DMX device if paths changed between machines
6. Re-add WLED devices by IP if network addresses differ from the source machine

## Example backup files

The repository `fixtures/` directory contains example `goldbus-config-*.goldbus-backup.json` files for reference. These illustrate structure; import only if you intend to use that demo configuration.

## Related: fixture export

Individual DMX fixtures can be exported as JSON from the fixture **⋮ menu** without a full backup. Use full backup for complete system migration.
