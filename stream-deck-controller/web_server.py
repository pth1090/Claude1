from __future__ import annotations
import logging
import os
from typing import Any, Callable, Optional
from flask import Flask, jsonify, request, send_from_directory
from flask_socketio import SocketIO

logger = logging.getLogger(__name__)

PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "public")


class WebServer:
    def __init__(self, port: int = 8080) -> None:
        self._port = port
        self._app = Flask(__name__, static_folder=None)
        self._app.config["SECRET_KEY"] = "labvision-stream-deck"
        self._socketio = SocketIO(self._app, cors_allowed_origins="*", async_mode="eventlet")
        self._on_button_save: Optional[Callable[[int, dict], None]] = None
        self._on_connection_save: Optional[Callable[[dict], None]] = None
        self._on_button_press: Optional[Callable[[int], None]] = None
        self._status: dict = {
            "opcua": "disconnected",
            "modbus": "disconnected",
            "streamdeck": "disconnected",
        }
        self._live_values: dict[int, Any] = {}
        self._button_colors: dict[int, str] = {}
        self._config_getter: Optional[Callable[[], dict]] = None
        self._setup_routes()

    def set_config_getter(self, fn: Callable[[], dict]) -> None:
        self._config_getter = fn

    def set_button_save_callback(self, fn: Callable[[int, dict], None]) -> None:
        self._on_button_save = fn

    def set_connection_save_callback(self, fn: Callable[[dict], None]) -> None:
        self._on_connection_save = fn

    def set_button_press_callback(self, fn: Callable[[int], None]) -> None:
        self._on_button_press = fn

    def update_status(self, key: str, state: str) -> None:
        self._status[key] = state
        self._socketio.emit("status_update", self._status)

    def update_live_value(self, index: int, value: Any, color: str) -> None:
        self._live_values[index] = value
        self._button_colors[index] = color

    def broadcast_live_values(self) -> None:
        payload = [
            {"index": i, "value": self._live_values.get(i), "color": self._button_colors.get(i, "#1a3a5c")}
            for i in range(6)
        ]
        self._socketio.emit("live_values", payload)

    def _setup_routes(self) -> None:
        app = self._app

        @app.route("/")
        def index():
            return send_from_directory(PUBLIC_DIR, "index.html")

        @app.route("/<path:filename>")
        def static_files(filename):
            return send_from_directory(PUBLIC_DIR, filename)

        @app.route("/api/config", methods=["GET"])
        def get_config():
            if self._config_getter:
                return jsonify(self._config_getter())
            return jsonify({}), 503

        @app.route("/api/config/button/<int:idx>", methods=["GET"])
        def get_button(idx):
            if not 0 <= idx <= 5:
                return jsonify({"error": "Invalid button index"}), 400
            if self._config_getter:
                cfg = self._config_getter()
                return jsonify(cfg["buttons"][idx])
            return jsonify({}), 503

        @app.route("/api/config/button/<int:idx>", methods=["PUT"])
        def save_button(idx):
            if not 0 <= idx <= 5:
                return jsonify({"error": "Invalid button index"}), 400
            data = request.get_json(force=True)
            if self._on_button_save:
                self._on_button_save(idx, data)
            self._socketio.emit("config_updated", {})
            return jsonify({"ok": True})

        @app.route("/api/config/connection", methods=["PUT"])
        def save_connection():
            data = request.get_json(force=True)
            if self._on_connection_save:
                self._on_connection_save(data)
            return jsonify({"ok": True})

        @app.route("/api/status", methods=["GET"])
        def get_status():
            return jsonify(self._status)

        @app.route("/api/buttons/<int:idx>/press", methods=["POST"])
        def simulate_press(idx):
            if not 0 <= idx <= 5:
                return jsonify({"error": "Invalid button index"}), 400
            if self._on_button_press:
                self._on_button_press(idx)
            return jsonify({"ok": True})

    def run(self) -> None:
        logger.info(f"Web UI starting on http://localhost:{self._port}")
        self._socketio.run(self._app, host="0.0.0.0", port=self._port, use_reloader=False)
