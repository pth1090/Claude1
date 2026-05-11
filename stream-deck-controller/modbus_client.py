from __future__ import annotations
import asyncio
import logging
from typing import Callable, Optional

logger = logging.getLogger(__name__)

try:
    from pymodbus.client import AsyncModbusTcpClient
    from pymodbus.exceptions import ModbusException
    MODBUS_AVAILABLE = True
except ImportError:
    MODBUS_AVAILABLE = False
    logger.warning("pymodbus library not available — Modbus disabled")


class ModbusClient:
    def __init__(self) -> None:
        self._client: Optional[object] = None
        self._connected = False
        self._host = ""
        self._port = 502
        self._unit_id = 1
        self._poll_interval_ms = 1000
        self._monitored: list[dict] = []  # [{address, register_type, scale, offset, key}]
        self._value_callback: Optional[Callable[[str, object], None]] = None
        self._poll_task: Optional[asyncio.Task] = None

    def set_value_callback(self, callback: Callable[[str, object], None]) -> None:
        self._value_callback = callback

    def configure(self, host: str, port: int = 502, unit_id: int = 1, poll_interval_ms: int = 1000) -> None:
        self._host = host
        self._port = port
        self._unit_id = unit_id
        self._poll_interval_ms = poll_interval_ms

    async def connect(self) -> None:
        if not MODBUS_AVAILABLE:
            return
        delay = 2
        while True:
            try:
                self._client = AsyncModbusTcpClient(self._host, port=self._port)
                await self._client.connect()
                if self._client.connected:
                    self._connected = True
                    logger.info(f"Modbus connected: {self._host}:{self._port}")
                    if self._poll_task is None or self._poll_task.done():
                        self._poll_task = asyncio.ensure_future(self._poll_loop())
                    return
                raise ConnectionError("Client not connected after connect()")
            except Exception as e:
                logger.error(f"Modbus connect failed: {e}. Retrying in {delay}s...")
                self._connected = False
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30)

    async def _poll_loop(self) -> None:
        while True:
            await asyncio.sleep(self._poll_interval_ms / 1000.0)
            if not self._connected or not self._monitored:
                continue
            for item in self._monitored:
                try:
                    value = await self._read_single(item)
                    if value is not None and self._value_callback:
                        key = self._item_key(item)
                        self._value_callback(key, value)
                except Exception as e:
                    logger.error(f"Modbus poll error: {e}")
                    self._connected = False
                    await self.connect()
                    break

    async def _read_single(self, item: dict) -> Optional[float]:
        address = item["address"]
        reg_type = item.get("register_type", "holding")
        scale = item.get("scale", 1.0)
        offset = item.get("offset", 0.0)

        if reg_type == "holding":
            result = await self._client.read_holding_registers(address, count=1, slave=self._unit_id)
        elif reg_type == "input":
            result = await self._client.read_input_registers(address, count=1, slave=self._unit_id)
        elif reg_type == "coil":
            result = await self._client.read_coils(address, count=1, slave=self._unit_id)
        elif reg_type == "discrete":
            result = await self._client.read_discrete_inputs(address, count=1, slave=self._unit_id)
        else:
            return None

        if result.isError():
            raise ModbusException(f"Read error at {address}")

        if reg_type in ("coil", "discrete"):
            return bool(result.bits[0])
        raw = result.registers[0]
        return raw * scale + offset

    def _item_key(self, item: dict) -> str:
        return f"modbus:{item['register_type']}:{item['address']}"

    def subscribe(self, monitored_items: list[dict]) -> None:
        self._monitored = monitored_items

    async def write(self, address: int, register_type: str, value: object) -> bool:
        if not MODBUS_AVAILABLE or not self._client or not self._connected:
            logger.warning(f"Modbus write skipped (not connected): addr={address}")
            return False
        try:
            if register_type == "coil":
                result = await self._client.write_coil(address, bool(value), slave=self._unit_id)
            else:
                result = await self._client.write_register(address, int(value), slave=self._unit_id)
            if result.isError():
                raise ModbusException(f"Write error at {address}")
            logger.info(f"Modbus write: {register_type}[{address}] = {value}")
            return True
        except Exception as e:
            logger.error(f"Modbus write error: {e}")
            return False

    def is_connected(self) -> bool:
        return self._connected

    async def disconnect(self) -> None:
        if self._poll_task:
            self._poll_task.cancel()
        if self._client:
            try:
                self._client.close()
            except Exception:
                pass
        self._connected = False
