// Thunderboard Sense 2 - PC Digital Twin firmware main loop.
//
// Build / flash via Simplicity Studio. This file is intentionally minimal --
// fill in the SiLabs SDK calls (sleeptimer, bluetooth stack, sensor power)
// after importing the SoC-Empty example project.

#include "sensors.h"
#include "config.h"

extern void ble_service_init(void);
extern void ble_service_notify_sample(const sensor_sample_t *s);
extern void ble_service_notify_boot(unsigned long boot_counter);

static unsigned long s_boot_counter = 0;

void app_init(void) {
    sensors_init();
    ble_service_init();
    s_boot_counter += 1; // TODO: persist to NVM (sl_token_manager)
    ble_service_notify_boot(s_boot_counter);
}

void app_process_action(void) {
    static unsigned long last_ms = 0;
    unsigned long now_ms = 0; // TODO: sl_sleeptimer_get_tick_count64() -> ms
    if (now_ms - last_ms >= SAMPLE_INTERVAL_MS) {
        last_ms = now_ms;
        sensor_sample_t sample;
        sensors_read(&sample);
        ble_service_notify_sample(&sample);
    }
}
