from __future__ import annotations
import asyncio
import logging
from typing import Callable, Optional

logger = logging.getLogger(__name__)

try:
    from asyncua import Client, ua
    from asyncua.common.subscription import SubHandler
    OPCUA_AVAILABLE = True
except ImportError:
    OPCUA_AVAILABLE = False
    logger.warning("asyncua library not available — OPC UA disabled")


class _SubscriptionHandler:
    def __init__(self, callback: Callable[[str, object], None]) -> None:
        self._callback = callback
        self._node_id_map: dict[int, str] = {}

    def register(self, handle: int, node_id: str) -> None:
        self._node_id_map[handle] = node_id

    def datachange_notification(self, node, val, data) -> None:
        node_id = self._node_id_map.get(id(node))
        if node_id is None:
            # Fall back to string representation
            node_id = str(node.nodeid)
        self._callback(node_id, val)


class OpcuaClient:
    def __init__(self) -> None:
        self._client: Optional[object] = None
        self._subscription: Optional[object] = None
        self._handler: Optional[_SubscriptionHandler] = None
        self._connected = False
        self._endpoint = ""
        self._username = ""
        self._password = ""
        self._value_callback: Optional[Callable[[str, object], None]] = None
        self._monitored_node_ids: list[str] = []
        self._reconnect_task: Optional[asyncio.Task] = None

    def set_value_callback(self, callback: Callable[[str, object], None]) -> None:
        self._value_callback = callback

    def configure(self, endpoint: str, username: str = "", password: str = "") -> None:
        self._endpoint = endpoint
        self._username = username
        self._password = password

    async def connect(self) -> None:
        if not OPCUA_AVAILABLE:
            return
        while True:
            try:
                self._client = Client(self._endpoint)
                if self._username:
                    self._client.set_user(self._username)
                    self._client.set_password(self._password)
                await self._client.connect()
                self._connected = True
                logger.info(f"OPC UA connected: {self._endpoint}")
                if self._monitored_node_ids:
                    await self._setup_subscription(self._monitored_node_ids)
                return
            except Exception as e:
                logger.error(f"OPC UA connect failed: {e}. Retrying in 30s...")
                self._connected = False
                await asyncio.sleep(30)

    async def _setup_subscription(self, node_ids: list[str]) -> None:
        if not self._client or not self._connected:
            return
        try:
            self._handler = _SubscriptionHandler(self._on_data_change)
            self._subscription = await self._client.create_subscription(500, self._handler)
            for node_id in node_ids:
                node = self._client.get_node(node_id)
                handle = await self._subscription.subscribe_data_change(node)
                self._handler.register(id(node), node_id)
            logger.info(f"OPC UA subscribed to {len(node_ids)} node(s)")
        except Exception as e:
            logger.error(f"OPC UA subscription setup error: {e}")

    def _on_data_change(self, node_id: str, value: object) -> None:
        if self._value_callback:
            # Convert OPC UA variant value to plain Python type
            if hasattr(value, "Value"):
                value = value.Value
            self._value_callback(node_id, value)

    async def subscribe(self, node_ids: list[str]) -> None:
        self._monitored_node_ids = list(node_ids)
        if self._connected:
            await self._setup_subscription(node_ids)

    async def write(self, node_id: str, value: object, data_type: str = "Variant") -> bool:
        if not OPCUA_AVAILABLE or not self._client or not self._connected:
            logger.warning(f"OPC UA write skipped (not connected): {node_id} = {value}")
            return False
        try:
            node = self._client.get_node(node_id)
            if isinstance(value, bool):
                dv = ua.DataValue(ua.Variant(value, ua.VariantType.Boolean))
            elif isinstance(value, int):
                dv = ua.DataValue(ua.Variant(value, ua.VariantType.Int32))
            elif isinstance(value, float):
                dv = ua.DataValue(ua.Variant(value, ua.VariantType.Float))
            else:
                dv = ua.DataValue(ua.Variant(str(value), ua.VariantType.String))
            await node.write_value(dv)
            logger.info(f"OPC UA write: {node_id} = {value}")
            return True
        except Exception as e:
            logger.error(f"OPC UA write error ({node_id}): {e}")
            asyncio.ensure_future(self._handle_disconnect())
            return False

    async def _handle_disconnect(self) -> None:
        if self._reconnect_task and not self._reconnect_task.done():
            return
        self._connected = False
        logger.info("OPC UA connection lost, reconnecting...")
        self._reconnect_task = asyncio.ensure_future(self.connect())

    def is_connected(self) -> bool:
        return self._connected

    async def disconnect(self) -> None:
        if self._client:
            try:
                await self._client.disconnect()
            except Exception:
                pass
        self._connected = False
