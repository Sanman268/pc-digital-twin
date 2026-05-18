# BLE Protocol

## GATT Service

| Role | UUID | Properties |
|---|---|---|
| Service | `00000000-0000-0000-0000-000000000000` | primary |
| Char Data | `00000000-0000-0000-0000-000000000001` | notify |
| Char Event | `00000000-0000-0000-0000-000000000002` | notify |

> Regenerate these UUIDs (`uuidgen`) before flashing real hardware and mirror
> the values in `firmware/src/ble_service.c` and `gateway/ble/scanner.py`.

## Data payload (short keys, JSON)

| Key | Type | Field | Unit |
|---|---|---|---|
| `t` | float | temperature | °C |
| `h` | float | humidity | % |
| `p` | float | pressure | hPa |
| `l` | float | light | lux |
| `aq` | uint8 | air quality index | – |
| `co2` | uint16 | CO₂ | ppm |
| `vx`/`vy`/`vz` | float | acceleration | g |
| `up` | uint32 | uptime | s |

Example:

```json
{"t":38.5,"h":45.2,"p":1013.1,"l":12,"aq":1,"co2":820,"vx":0.01,"vy":-0.02,"vz":9.80,"up":3600}
```

## Event payload

```json
{"boot":42,"fw":"0.1.0","src":"usb"}
```

## Timestamps

The board has no RTC. Only `up` (uptime in seconds) is transmitted; the
gateway stamps the wall-clock time on receipt. Document this when analysing
historical data.
