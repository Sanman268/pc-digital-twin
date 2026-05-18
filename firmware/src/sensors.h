#ifndef SENSORS_H
#define SENSORS_H

#include <stdint.h>

typedef struct {
    float temperature_c;
    float humidity_pct;
    float pressure_hpa;
    float light_lux;
    uint8_t air_quality_index;
    uint16_t co2_ppm;
    float accel_x;
    float accel_y;
    float accel_z;
    uint32_t uptime_s;
} sensor_sample_t;

void sensors_init(void);
void sensors_read(sensor_sample_t *out);

#endif // SENSORS_H
