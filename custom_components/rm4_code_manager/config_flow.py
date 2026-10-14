"""Zero-configuration UI setup for the Broadlink Code Manager panel."""
from __future__ import annotations
from typing import Any

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult

try:
    import probatio as vol
except ImportError:
    import voluptuous as vol

from . import DOMAIN


class BroadlinkCodeManagerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """One manager per Home Assistant instance; manages existing Broadlink remotes."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Enable the standalone admin-only panel without YAML changes."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title="Broadlink Code Manager", data={})
        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))
