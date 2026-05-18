// BLE GATT service for the PC Digital Twin sensor node.
//
// Service / characteristic UUIDs are placeholders -- regenerate with a tool
// such as `uuidgen` and mirror the same values in gateway/ble/scanner.py.
//
//   Service:    00000000-0000-0000-0000-000000000000
//   Char Data:  00000000-0000-0000-0000-000000000001  (notify, JSON payload)
//   Char Event: 00000000-0000-0000-0000-000000000002  (notify, boot/heartbeat)

#include <stdio.h>
#include <string.h>
#include "sensors.h"
#include "config.h"

// TODO: include the Silicon Labs Bluetooth API
// #include "sl_bluetooth.h"
// #include "gatt_db.h"

// Encode a sensor sample as the short-key JSON payload defined in the spec.
int ble_format_payload(const sensor_sample_t *s, char *buf, int buflen) {
    return snprintf(
        buf, buflen,
        "{\"t\":%.1f,\"h\":%.1f,\"p\":%.1f,\"l\":%.0f,\"aq\":%u,\"co2\":%u,"
        "\"vx\":%.3f,\"vy\":%.3f,\"vz\":%.3f,\"up\":%lu}",
        s->temperature_c, s->humidity_pct, s->pressure_hpa, s->light_lux,
        (unsigned)s->air_quality_index, (unsigned)s->co2_ppm,
        s->accel_x, s->accel_y, s->accel_z,
        (unsigned long)s->uptime_s
    );
}

void ble_service_init(void) {
    // TODO: configure advertisements with device name "Thunderboard Sense 2"
}

void ble_service_notify_sample(const sensor_sample_t *s) {
    char buf[200];
    int n = ble_format_payload(s, buf, sizeof(buf));
    if (n <= 0) return;
    // TODO: sl_bt_gatt_server_send_notification(connection, gattdb_data_char, n, (uint8_t*)buf);
}

void ble_service_notify_boot(uint32_t boot_counter) {
    char buf[120];
    snprintf(buf, sizeof(buf),
             "{\"boot\":%lu,\"fw\":\"%s\",\"src\":\"usb\"}",
             (unsigned long)boot_counter, FIRMWARE_VERSION);
    // TODO: notify on gattdb_event_char
}
