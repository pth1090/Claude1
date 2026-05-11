"""
LabVision Stream Deck Controller
Steuert einen Elgato Stream Deck Mini (6 Tasten) über OPC UA und Modbus TCP.
Start: python main.py
Web-UI: http://localhost:8080
"""
from __future__ import annotations
import asyncio
import logging
import signal
import threading
from typing import Any, Optional

from dotenv import load_dotenv
load_dotenv()

from config_manager import ConfigManager
from opcua_client import OpcuaClient
from modbus_client import ModbusClient
from streamdeck_manager import StreamDeckManager
from web_server import WebServer
import button_renderer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")

# --- Globals ---
config_mgr = ConfigManager()
opcua = OpcuaClient()
modbus = ModbusClient()
deck = StreamDeckManager()
web = WebServer(port=8080)

# Current live values per button index
live_values: dict[int, Any] = {}


def _collect_subscriptions(buttons: list[dict]) -> tuple[list[str], list[dict]]:
    """Extract OPC UA node IDs and Modbus items from button configs."""
    opcua_nodes: set[str] = set()
    modbus_items: list[dict] = []
    seen_modbus: set[str] = set()

    for btn in buttons:
        display = btn.get("display") or {}
        if display.get("protocol") == "opcua" and display.get("node_id"):
            opcua_nodes.add(display["node_id"])
        elif display.get("protocol") == "modbus" and display.get("address") is not None:
            key = f"{display.get('register_type','holding')}:{display['address']}"
            if key not in seen_modbus:
                seen_modbus.add(key)
                modbus_items.append({
                    "address": display["address"],
                    "register_type": display.get("register_type", "holding"),
                    "scale": display.get("scale", 1.0),
                    "offset": display.get("offset", 0.0),
                })
    return list(opcua_nodes), modbus_items


def _find_buttons_for_source(buttons: list[dict], protocol: str, key: str) -> list[int]:
    """Return button indices whose display source matches protocol+key."""
    result = []
    for btn in buttons:
        display = btn.get("display") or {}
        if display.get("protocol") != protocol:
            continue
        if protocol == "opcua" and display.get("node_id") == key:
            result.append(btn["index"])
        elif protocol == "modbus":
            modbus_key = f"{display.get('register_type','holding')}:{display.get('address')}"
            if modbus_key == key:
                result.append(btn["index"])
    return result


async def _on_value_change(protocol: str, key: str, value: Any) -> None:
    """Called when OPC UA or Modbus reports a new value."""
    cfg = config_mgr.get_config()
    buttons = cfg["buttons"]
    indices = _find_buttons_for_source(buttons, protocol, key)
    for idx in indices:
        live_values[idx] = value
        btn_cfg = next((b for b in buttons if b["index"] == idx), None)
        if btn_cfg:
            color = _compute_color(btn_cfg, value)
            web.update_live_value(idx, value, color)
        await deck.update_button(idx, value)


def _compute_color(btn_cfg: dict, value: Any) -> str:
    display = btn_cfg.get("display") or {}
    thresholds = display.get("thresholds", [])
    if isinstance(value, (int, float)) and thresholds:
        ops = {
            "gt":  lambda v, t: v > t,
            "gte": lambda v, t: v >= t,
            "lt":  lambda v, t: v < t,
            "lte": lambda v, t: v <= t,
        }
        for rule in thresholds:
            op = ops.get(rule.get("operator", "gt"))
            if op and op(float(value), rule["value"]):
                return rule["color"]
    return btn_cfg.get("color", "#1a3a5c")


async def _on_button_press(index: int) -> None:
    """Execute the action configured for a button."""
    cfg = config_mgr.get_config()
    buttons = cfg["buttons"]
    btn = next((b for b in buttons if b["index"] == index), None)
    if not btn or not btn.get("enabled") or not btn.get("action"):
        return

    action = btn["action"]
    protocol = action.get("protocol", "opcua")
    action_type = action.get("type", "write")

    if action_type == "toggle":
        current = live_values.get(index)
        value = not bool(current) if isinstance(current, bool) else True
    else:
        value = action.get("value", True)

    if protocol == "opcua":
        node_id = action.get("node_id", "")
        if node_id:
            await opcua.write(node_id, value)
    elif protocol == "modbus":
        address = action.get("address")
        reg_type = action.get("register_type", "holding")
        if address is not None:
            await modbus.write(address, reg_type, value)

    logger.info(f"Button {index} pressed → {protocol} write: {value}")


def _on_button_save(idx: int, data: dict) -> None:
    config_mgr.update_button(idx, data)
    _apply_config()


def _on_connection_save(data: dict) -> None:
    config_mgr.update_connection(data)
    logger.info("Connection config updated — restart to reconnect")


def _apply_config() -> None:
    cfg = config_mgr.get_config()
    buttons = cfg["buttons"]
    deck.set_button_configs(buttons)

    # Update subscriptions
    opcua_nodes, modbus_items = _collect_subscriptions(buttons)
    asyncio.ensure_future(opcua.subscribe(opcua_nodes))
    modbus.subscribe(modbus_items)

    # Re-render all buttons
    for btn in buttons:
        asyncio.ensure_future(deck.update_button(btn["index"], live_values.get(btn["index"])))


async def _broadcast_loop() -> None:
    """Send live values to the browser every second."""
    while True:
        await asyncio.sleep(1)
        web.broadcast_live_values()


async def _status_loop() -> None:
    """Update connection status in the web UI."""
    while True:
        await asyncio.sleep(3)
        web.update_status("opcua", "connected" if opcua.is_connected() else "disconnected")
        web.update_status("modbus", "connected" if modbus.is_connected() else "disconnected")
        web.update_status("streamdeck", "connected" if deck.is_connected() else "disconnected")


async def main_async() -> None:
    cfg = config_mgr.get_config()

    # Wire up callbacks
    opcua.set_value_callback(lambda nid, val: asyncio.ensure_future(_on_value_change("opcua", nid, val)))
    modbus.set_value_callback(lambda key, val: asyncio.ensure_future(_on_value_change("modbus", key, val)))
    deck.set_press_callback(lambda idx: asyncio.ensure_future(_on_button_press(idx)))

    # Wire up web server callbacks
    web.set_config_getter(config_mgr.get_config)
    web.set_button_save_callback(_on_button_save)
    web.set_connection_save_callback(_on_connection_save)
    web.set_button_press_callback(lambda idx: asyncio.ensure_future(_on_button_press(idx)))

    # Apply initial button config
    buttons = cfg["buttons"]
    deck.set_button_configs(buttons)

    # Configure protocol clients
    oc = cfg["opcua"]
    mc = cfg["modbus"]
    opcua.configure(oc["endpoint"], oc.get("username", ""), oc.get("password", ""))
    modbus.configure(mc["host"], mc.get("port", 502), mc.get("unit_id", 1), mc.get("poll_interval_ms", 1000))

    # Subscribe to display sources
    opcua_nodes, modbus_items = _collect_subscriptions(buttons)
    modbus.subscribe(modbus_items)

    # Start all connections concurrently
    connect_tasks = [
        asyncio.ensure_future(opcua.connect()),
        asyncio.ensure_future(modbus.connect()),
        asyncio.ensure_future(deck.connect()),
    ]

    # Subscribe OPC UA nodes after connection (handled internally on connect)
    await opcua.subscribe(opcua_nodes)

    # Background tasks
    asyncio.ensure_future(_broadcast_loop())
    asyncio.ensure_future(_status_loop())

    # Run Flask in a separate thread (eventlet handles async internally)
    flask_thread = threading.Thread(target=web.run, daemon=True)
    flask_thread.start()

    logger.info("LabVision Stream Deck Controller running.")
    logger.info("Web-UI: http://localhost:8080")

    # Keep running until cancelled
    stop_event = asyncio.Event()

    def _shutdown(sig, frame):
        logger.info("Shutting down...")
        stop_event.set()

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    await stop_event.wait()

    # Cleanup
    for task in connect_tasks:
        task.cancel()
    await opcua.disconnect()
    await modbus.disconnect()
    deck.close()
    logger.info("Shutdown complete.")


if __name__ == "__main__":
    asyncio.run(main_async())
