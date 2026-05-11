import json
import os
import shutil
import copy
from typing import Any

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "buttons.json")

DEFAULT_CONFIG: dict = {
    "opcua": {
        "endpoint": "opc.tcp://localhost:4840",
        "username": "",
        "password": ""
    },
    "modbus": {
        "host": "192.168.1.50",
        "port": 502,
        "unit_id": 1,
        "poll_interval_ms": 1000
    },
    "buttons": [
        {
            "index": i,
            "enabled": False,
            "label": f"Taste {i + 1}",
            "color": "#1a3a5c",
            "display": None,
            "action": None
        }
        for i in range(6)
    ]
}


class ConfigManager:
    def __init__(self) -> None:
        self._config: dict = {}
        self._load()

    def _load(self) -> None:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                self._config = json.load(f)
            # Ensure all 6 button slots exist
            existing = {b["index"]: b for b in self._config.get("buttons", [])}
            buttons = []
            for i in range(6):
                buttons.append(existing.get(i, copy.deepcopy(DEFAULT_CONFIG["buttons"][i])))
            self._config["buttons"] = buttons
        else:
            self._config = copy.deepcopy(DEFAULT_CONFIG)
            self._save()

    def _save(self) -> None:
        os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
        tmp_path = CONFIG_PATH + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(self._config, f, indent=2, ensure_ascii=False)
        shutil.move(tmp_path, CONFIG_PATH)

    def get_config(self) -> dict:
        return copy.deepcopy(self._config)

    def get_button(self, index: int) -> dict:
        return copy.deepcopy(self._config["buttons"][index])

    def update_button(self, index: int, data: dict) -> None:
        self._config["buttons"][index] = data
        self._save()

    def update_connection(self, data: dict) -> None:
        if "opcua" in data:
            self._config["opcua"].update(data["opcua"])
        if "modbus" in data:
            self._config["modbus"].update(data["modbus"])
        self._save()

    def get_opcua_config(self) -> dict:
        return self._config["opcua"]

    def get_modbus_config(self) -> dict:
        return self._config["modbus"]
