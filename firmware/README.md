# Firmware — Thunderboard Sense 2

Sensor node firmware for the PC Digital Twin.

## Build

1. Open **Simplicity Studio** and import the *SoC – Empty* example for the
   Thunderboard Sense 2 (`BRD4166A`).
2. Copy the files from `src/` into the project's `app/` folder.
3. Add the Si7021, BMP280, Si1133, ICM-20648, and CCS811 sensor components
   from the Component Editor.
4. Build and flash.

## BLE protocol

See `../docs/ble_protocol.md`. UUIDs are defined in `src/ble_service.c` and
must be mirrored in `gateway/ble/scanner.py`.
