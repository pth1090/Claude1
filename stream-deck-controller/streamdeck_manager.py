from __future__ import annotations
import asyncio
import logging
from typing import Callable, Optional, Union
from PIL import Image
import button_renderer

logger = logging.getLogger(__name__)

try:
    import StreamDeck.DeviceManager as DM
    from StreamDeck.ImageHelpers import PILHelper
    STREAMDECK_AVAILABLE = True
except ImportError:
    STREAMDECK_AVAILABLE = False
    logger.warning("streamdeck library not available — hardware disabled")


class StreamDeckManager:
    def __init__(self) -> None:
        self._deck = None
        self._connected = False
        self._on_press: Optional[Callable[[int], None]] = None
        self._config: dict = {}
        self._live_values: dict[int, Optional[Union[float, bool, str]]] = {}

    def set_press_callback(self, callback: Callable[[int], None]) -> None:
        self._on_press = callback

    def set_button_configs(self, buttons: list[dict]) -> None:
        self._config = {b["index"]: b for b in buttons}

    async def connect(self) -> None:
        while True:
            if not STREAMDECK_AVAILABLE:
                logger.info("Stream Deck support disabled (library missing)")
                return
            try:
                devices = DM.DeviceManager().enumerate()
                if devices:
                    self._deck = devices[0]
                    self._deck.open()
                    self._deck.reset()
                    self._deck.set_brightness(80)
                    self._deck.set_key_callback(self._key_callback)
                    self._connected = True
                    logger.info(f"Stream Deck connected: {self._deck.deck_type()}")
                    await self._render_all()
                    return
                else:
                    logger.warning("No Stream Deck found, retrying in 5s...")
            except Exception as e:
                logger.error(f"Stream Deck open error: {e}")
            await asyncio.sleep(5)

    def _key_callback(self, deck, key: int, state: bool) -> None:
        if state and self._on_press:
            self._on_press(key)

    async def update_button(self, index: int, live_value: Optional[Union[float, bool, str]] = None) -> None:
        self._live_values[index] = live_value
        config = self._config.get(index)
        if config is None:
            return
        if self._deck and self._connected:
            try:
                img = button_renderer.render(config, live_value)
                native_img = PILHelper.to_native_format(self._deck, img)
                self._deck.set_key_image(index, native_img)
            except Exception as e:
                logger.error(f"Button render error (index {index}): {e}")
                await self._reconnect()

    async def _render_all(self) -> None:
        for index, config in self._config.items():
            await self.update_button(index, self._live_values.get(index))

    async def _reconnect(self) -> None:
        self._connected = False
        if self._deck:
            try:
                self._deck.close()
            except Exception:
                pass
        self._deck = None
        logger.info("Stream Deck disconnected, attempting reconnect...")
        await self.connect()

    def is_connected(self) -> bool:
        return self._connected

    def close(self) -> None:
        if self._deck:
            try:
                self._deck.reset()
                self._deck.close()
            except Exception:
                pass
        self._connected = False
