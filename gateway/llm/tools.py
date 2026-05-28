METRIC_ENUM = ["temperature", "humidity", "pressure", "vibration", "light"]
WINDOW_ENUM = ["1h", "6h", "24h", "7d"]
HORIZON_ENUM = ["15m", "1h", "6h"]
DIRECTION_ENUM = ["above", "below"]

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "query_window",
            "description": (
                "Aggregate statistic (min/max/mean/std) for one sensor over a time window. "
                "When aggregation is 'min' or 'max', the result also includes a 'time' field "
                "(local time) marking when that extreme occurred — use it to answer "
                "'at what time ... was the highest/lowest'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "metric": {"type": "string", "enum": METRIC_ENUM},
                    "window": {"type": "string", "enum": WINDOW_ENUM},
                    "aggregation": {
                        "type": "string",
                        "enum": ["min", "max", "mean", "std"],
                    },
                },
                "required": ["metric", "window", "aggregation"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_anomalies",
            "description": (
                "Find anomalous samples — points whose value deviates from the mean "
                "by more than threshold_sigma times the standard deviation of the "
                "same window."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "metric": {"type": "string", "enum": METRIC_ENUM},
                    "window": {"type": "string", "enum": WINDOW_ENUM},
                    "threshold_sigma": {
                        "type": "number",
                        "minimum": 1.0,
                        "maximum": 5.0,
                        "description": "Stddev multiplier above which a sample counts as an anomaly. Default 2.5.",
                    },
                },
                "required": ["metric", "window"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_windows",
            "description": "Compare the aggregate (mean or max) of one sensor across two different time windows.",
            "parameters": {
                "type": "object",
                "properties": {
                    "metric": {"type": "string", "enum": METRIC_ENUM},
                    "window_a": {"type": "string", "enum": WINDOW_ENUM},
                    "window_b": {"type": "string", "enum": WINDOW_ENUM},
                    "aggregation": {"type": "string", "enum": ["mean", "max"]},
                },
                "required": ["metric", "window_a", "window_b", "aggregation"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "time_to_threshold",
            "description": (
                "Estimate how long until a sensor's current-session trend "
                "crosses a threshold (e.g. 'when will temperature reach 35 °C?'). "
                "Uses a linear fit on the active session only and returns "
                "eta_minutes plus a projected crossing_time. If the trend is "
                "flat or heading the other way, returns ok=false with a reason. "
                "If the value is already on the requested side of the "
                "threshold, returns ok=true with already_crossed=true and "
                "eta_minutes=0."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "metric": {"type": "string", "enum": METRIC_ENUM},
                    "history_window": {"type": "string", "enum": WINDOW_ENUM},
                    "threshold": {
                        "type": "number",
                        "description": (
                            "Target value in the metric's own units (e.g. 35.0 "
                            "for temperature in °C)."
                        ),
                    },
                    "direction": {"type": "string", "enum": DIRECTION_ENUM},
                },
                "required": ["metric", "history_window", "threshold", "direction"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "forecast_accuracy",
            "description": (
                "Report the measured forecast error (MAE and RMSE) of the "
                "linear forecaster over recent history, by backtesting the "
                "same forecast() used in production. Walks anchors through "
                "every session in the history window, predicts horizon "
                "ahead from each anchor, and compares to the actual value. "
                "Returns aggregate MAE/RMSE in the metric's native units "
                "plus the number of anchors evaluated. Use this to answer "
                "'how trustworthy is the forecast?' or 'what's the typical "
                "error?' — never invent a confidence interval, quote this."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "metric": {"type": "string", "enum": METRIC_ENUM},
                    "history_window": {"type": "string", "enum": WINDOW_ENUM},
                    "horizon": {"type": "string", "enum": HORIZON_ENUM},
                },
                "required": ["metric", "history_window", "horizon"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "detect_drift",
            "description": (
                "Compare the current active session to a baseline built "
                "from prior sessions in the history window. Returns a "
                "status ('normal' / 'drifting' / 'fault'), a drift_score "
                "(the larger of |z_value| and |z_slope|), and the "
                "underlying z-scores alongside the baseline mean/stddev. "
                "Use this to answer 'is the case behaving normally', "
                "'is anything drifting today', or 'how does today compare "
                "to the last week'. If there is no historical baseline "
                "yet (only one session of data) or the baseline is too "
                "sparse, returns ok=false with a reason — never invent a "
                "verdict in that case. Quote the status and drift_score "
                "from the result; do not fabricate. The slope channel is "
                "automatically suppressed on noise-dominated baselines, "
                "in which case z_slope is null and the verdict rests on "
                "z_value alone."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "metric": {"type": "string", "enum": METRIC_ENUM},
                    "baseline_window": {"type": "string", "enum": WINDOW_ENUM},
                },
                "required": ["metric", "baseline_window"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "forecast_window",
            "description": (
                "Project a sensor forward over a short horizon using a linear "
                "trend fit on the current active session (samples not separated "
                "by a powered-off gap). Returns slope_per_hour, the predicted "
                "value at the end of the horizon, and a series of forecast "
                "points. If the current session is too short to support the "
                "horizon, returns ok=false with a reason — use this to answer "
                "'where is X heading' or 'is X rising/falling'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "metric": {"type": "string", "enum": METRIC_ENUM},
                    "history_window": {"type": "string", "enum": WINDOW_ENUM},
                    "horizon": {"type": "string", "enum": HORIZON_ENUM},
                },
                "required": ["metric", "history_window", "horizon"],
            },
        },
    },
]
