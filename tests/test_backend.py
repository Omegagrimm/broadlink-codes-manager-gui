"""Isolated smoke tests for the code manager. Uses fake HA modules and storage.
Run: python tests/test_backend.py (does not require Home Assistant).
"""

import asyncio
import base64
import importlib.util
import sys
import types
from pathlib import Path


def module(name):
    obj = types.ModuleType(name)
    sys.modules[name] = obj
    return obj


ha = module("homeassistant")
ha.components = module("homeassistant.components")
ha.components.http = module("homeassistant.components.http")
ha.core = module("homeassistant.core")
ha.helpers = module("homeassistant.helpers")
ha.helpers.entity_component = module("homeassistant.helpers.entity_component")
ha.helpers.storage = module("homeassistant.helpers.storage")
ha.components.frontend = module("homeassistant.components.frontend")
ha.components.panel_custom = module("homeassistant.components.panel_custom")
ha.components.websocket_api = module("homeassistant.components.websocket_api")
vol = module("probatio")
vol.Required = lambda x: x
vol.Optional = lambda x: x
vol.In = lambda x: x
ha.core.HomeAssistant = object
ha.helpers.entity_component.DATA_INSTANCES = "entity_components"
ha.components.http.StaticPathConfig = lambda *args: args
ha.components.websocket_api.websocket_command = lambda schema: lambda f: f
ha.components.websocket_api.require_admin = lambda f: f
ha.components.websocket_api.async_response = lambda f: f


class Store:
    disk = {}

    def __init__(self, hass, version, key):
        self.key = key

    async def async_load(self):
        return self.disk.get(self.key)

    async def async_save(self, data):
        from copy import deepcopy
        self.disk[self.key] = deepcopy(data)


ha.helpers.storage.Store = Store
spec = importlib.util.spec_from_file_location("rm4_backend", Path(__file__).parents[1] / "custom_components" / "rm4_code_manager" / "__init__.py")
backend = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend)


class Entity:
    entity_id = "remote.rm4_pro"
    is_on = True

    def __init__(self, codes):
        self._codes = codes
        self._lock = asyncio.Lock()
        self._storage_loaded = True
        self._code_storage = Store(None, 1, "codes")


class Hass:
    pass


def code(first=0x26):
    return base64.b64encode(bytes([first, 1, 2, 3, 4, 5, 6, 7])).decode()


async def main():
    hass=Hass()
    a=Entity({"TV": {"power": code()}})
    assert backend._code_type(a._codes["TV"]["power"]) == "ir"
    assert backend._code_type(code(0xB2)) == "rf"
    assert backend._validate_code("b64:" + code()) == code()
    for invalid in ("not base64", code(0x10), ""):
        try:
            backend._validate_code(invalid)
            raise AssertionError("Invalid code accepted")
        except ValueError:
            pass
    await backend._save_direct(hass,a,{"original_device":"TV", "original_command":"power", "device":"Living TV", "command":"on", "code1":code()})
    assert "TV" not in a._codes and a._codes["Living TV"]["on"] == code()
    assert Store.disk["codes"] == a._codes
    assert len(Store.disk[backend.BACKUPS][a.entity_id]) == 1
    await backend._save_direct(hass,a,{"device":"Living TV", "command":"off", "code1":code(0xB2), "code2":code(0xB2)})
    assert a._codes["Living TV"]["off"] == [code(0xB2),code(0xB2)]
    try:
        await backend._save_direct(hass,a,{"device":"Living TV", "command":"off", "code1":code()})
        raise AssertionError("Collision overwrote existing code")
    except ValueError:
        pass
    assert a._codes["Living TV"]["off"] == [code(0xB2),code(0xB2)]
    try:
        await backend._save_direct(hass,a,{"original_device":"Living TV", "original_command":"on", "device":"Living TV", "command":"off", "code1":code()})
        raise AssertionError("Rename collision overwrote existing code")
    except ValueError:
        pass
    assert a._codes["Living TV"]["on"] == code()
    assert len(Store.disk[backend.BACKUPS][a.entity_id]) == 2
    print("PASS: Base64 validation, IR/RF recognition, rename, import/alternatives, collision guards, persistence, history")


if __name__ == "__main__":
    asyncio.run(main())
