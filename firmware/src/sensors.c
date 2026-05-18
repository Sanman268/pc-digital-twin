#include "sensors.h"
#include "config.h"

// TODO: include Silicon Labs sensor headers
// #include "sl_sensor_rht.h"     // Si7021 temperature + humidity
// #include "sl_sensor_lux.h"     // Si1133 ambient light + UV
// #include "sl_sensor_pressure.h" // BMP280 pressure
// #include "sl_sensor_imu.h"      // ICM-20648 IMU
// #include "sl_sensor_gas.h"      // CCS811 air quality

void sensors_init(void) {
    // TODO: enable sensor power rail, initialize each driver
}

void sensors_read(sensor_sample_t *out) {
    if (out == 0) return;
    // TODO: replace placeholder values with real sensor reads
    out->temperature_c    = 0.0f;
    out->humidity_pct     = 0.0f;
    out->pressure_hpa     = 0.0f;
    out->light_lux        = 0.0f;
    out->air_quality_index = 0;
    out->co2_ppm          = 0;
    out->accel_x          = 0.0f;
    out->accel_y          = 0.0f;
    out->accel_z          = 0.0f;
    out->uptime_s         = 0;
}
