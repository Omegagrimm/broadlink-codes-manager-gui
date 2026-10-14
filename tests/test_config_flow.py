"""Standalone sanity test for the optional setup flow with fake HA imports."""
import asyncio
import importlib.util
import sys
import types
from pathlib import Path


def fake(name):
    obj = types.ModuleType(name)
    sys.modules[name] = obj
    return obj


ha = fake("homeassistant")
ha.config_entries = fake("homeassistant.config_entries")
ha.data_entry_flow = fake("homeassistant.data_entry_flow")
ha.data_entry_flow.FlowResult = dict
vol = fake("probatio")
vol.Schema = lambda v: v
mod = fake("custom_components")
mod.__path__ = []
module = fake("custom_components.rm4_code_manager")
module.__path__ = []
module.DOMAIN = "rm4_code_manager"


class ConfigFlow:
    def __init_subclass__(cls, domain=None, **kwargs):
        super().__init_subclass__(**kwargs)
        cls.domain = domain

    def _async_current_entries(self):
        return getattr(self, "entries", [])

    def async_abort(self, reason):
        return {"type": "abort", "reason": reason}

    def async_create_entry(self, title, data):
        return {"type": "create_entry", "title": title, "data": data}

    def async_show_form(self, step_id, data_schema):
        return {"type": "form", "step_id": step_id, "schema": data_schema}


ha.config_entries.ConfigFlow = ConfigFlow
p = Path(__file__).parents[1] / "custom_components" / "rm4_code_manager" / "config_flow.py"
spec = importlib.util.spec_from_file_location("custom_components.rm4_code_manager.config_flow", p)
flow_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flow_module)


async def main():
    flow = flow_module.BroadlinkCodeManagerConfigFlow()
    assert (await flow.async_step_user())["type"] == "form"
    assert (await flow.async_step_user({}))["type"] == "create_entry"
    flow.entries = [object()]
    assert (await flow.async_step_user())["reason"] == "single_instance_allowed"
    print("PASS: HACS-era no-YAML UI config flow form, create, duplicate guard")


if __name__ == "__main__":
    asyncio.run(main())
