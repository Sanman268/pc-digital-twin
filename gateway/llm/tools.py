METRIC_ENUM = ["temperature", "humidity", "pressure", "vibration", "light"]
WINDOW_ENUM = ["1h", "6h", "24h", "7d"]

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
                    "aggregation": {"type": "string", "enum": ["min", "max", "mean", "std"]},
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
]
