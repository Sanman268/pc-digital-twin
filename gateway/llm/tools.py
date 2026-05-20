METRIC_ENUM = ["temperature", "humidity", "pressure", "vibration", "light"]
WINDOW_ENUM = ["1h", "6h", "24h", "7d"]

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "query_window",
            "description": (
                "Lấy thống kê tổng hợp (min/max/mean/std) của một sensor trong một khoảng thời gian. "
                "Với aggregation=min hoặc max, kết quả còn có trường 'time' là thời điểm chính xác "
                "(giờ địa phương) khi đạt giá trị đó — dùng để trả lời 'lúc mấy giờ ... cao/thấp nhất'."
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
                "Tìm điểm bất thường: các sample mà giá trị lệch khỏi mean quá "
                "threshold_sigma lần stddev của chính khoảng đó."
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
                        "description": "Số lần stddev coi là bất thường, mặc định 2.5.",
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
            "description": "So sánh aggregate (mean hoặc max) của 2 khoảng thời gian khác nhau.",
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
