"""Broadlink Code Manager - an experimental admin-only HA sidebar panel.

Native remote services handle learn/send/delete. Renaming and Base64 editing
require guarded access to Broadlink's *live* code dictionary and Store.
These are private HA APIs, deliberately feature-detected for compatibility.
"""

from __future__ import annotations

import base64
import binascii
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import probatio as vol
except ImportError:  # Home Assistant releases before the probatio migration
    import voluptuous as vol

from homeassistant.components import panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_component import DATA_INSTANCES
from homeassistant.helpers.storage import Store

DOMAIN = "rm4_code_manager"
BACKUPS = "rm4_code_manager_backups"
MANAGER_VERSION = "0.1.1"

# Continue supporting the optional legacy `rm4_code_manager:` YAML entry
# while allowing the preferred UI-based config flow.
CONFIG_SCHEMA = vol.Schema(
    {vol.Optional(DOMAIN): vol.Any(None, vol.Schema({}))},
    extra=vol.ALLOW_EXTRA,
)


def _remote_entities(hass: HomeAssistant) -> dict[str, Any]:
    component = hass.data.get(DATA_INSTANCES, {}).get("remote")
    if component is None:
        return {}
    result = {}
    for entity in list(component.entities):
        if not entity.entity_id:
            continue
        if entity.__class__.__module__.startswith("homeassistant.components.broadlink."):
            result[entity.entity_id] = entity
    return result


def _get_remote(hass: HomeAssistant, entity_id: str) -> Any:
    entity = _remote_entities(hass).get(entity_id)
    if entity is None:
        raise ValueError("Broadlink remote is not available. Check your selected transmitter.")
    required = ("_codes", "_lock", "_storage_loaded", "_async_load_storage", "_code_storage")
    if not all(hasattr(entity, attr) for attr in required):
        raise RuntimeError("This Home Assistant Broadlink release has a different storage API. Editing is disabled.")
    return entity


async def _loaded(entity: Any) -> None:
    if not entity._storage_loaded:
        await entity._async_load_storage()


def _validate_name(value: str, label: str) -> str:
    value = value.strip()
    if not 1 <= len(value) <= 96 or any(ord(c) < 32 for c in value):
        raise ValueError(f"{label} must be 1–96 characters and contain no control characters.")
    return value


def _validate_code(value: str) -> str:
    code = value.strip()
    if code.lower().startswith("b64:"):
        code = code[4:].strip()
    if not code or len(code) > 16000:
        raise ValueError("Enter a Base64 code (16,000 characters maximum).")
    try:
        packet = base64.b64decode(code + "=" * (-len(code) % 4), validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("The code is not valid Base64.") from exc
    if len(packet) < 4 or packet[0] not in (0x26, 0xB2, 0xD7):
        raise ValueError("Not a recognized Broadlink IR (26) or RF (B2/D7) packet.")
    # Normalize padding so exports are predictable.
    return base64.b64encode(packet).decode("ascii")


def _code_type(code: Any) -> str:
    value = code[0] if isinstance(code, list) and code else code
    if not isinstance(value, str):
        return "unknown"
    try:
        packet = base64.b64decode(value + "=" * (-len(value) % 4))
    except Exception:
        return "unknown"
    if not packet:
        return "unknown"
    return {0x26: "ir", 0xB2: "rf", 0xD7: "rf"}.get(packet[0], "unknown")


def _snapshot(entity: Any) -> dict[str, Any]:
    return deepcopy(entity._codes)


async def _history(hass: HomeAssistant, entity: Any, reason: str, before: dict) -> None:
    """Keep last 15 full snapshots in *separate* HA storage before a direct edit."""
    storage = Store(hass, 1, BACKUPS)
    all_backups = await storage.async_load() or {}
    key = entity.entity_id
    snapshots = all_backups.get(key, [])
    snapshots.append({"at": datetime.now(timezone.utc).isoformat(), "reason": reason, "codes": before})
    all_backups[key] = snapshots[-15:]
    await storage.async_save(all_backups)


async def _save_direct(hass: HomeAssistant, entity: Any, msg: dict) -> dict:
    old_dev = msg.get("original_device", "").strip()
    old_cmd = msg.get("original_command", "").strip()
    new_dev = _validate_name(msg["device"], "Device")
    new_cmd = _validate_name(msg["command"], "Command")
    code1 = _validate_code(msg["code1"])
    code2 = _validate_code(msg["code2"]) if msg.get("code2", "").strip() else ""
    if code2 and _code_type(code1) != _code_type(code2):
        raise ValueError("Both alternative codes must be the same IR/RF type.")
    value = [code1, code2] if code2 else code1

    await _loaded(entity)
    async with entity._lock:
        codes = entity._codes
        has_old = bool(old_dev and old_cmd)
        if has_old and old_cmd not in codes.get(old_dev, {}):
            raise ValueError("Original command no longer exists. Refresh before editing.")
        if not has_old and (old_dev or old_cmd):
            raise ValueError("Original device and command must both be present.")
        if new_cmd in codes.get(new_dev, {}) and (not has_old or (new_dev, new_cmd) != (old_dev, old_cmd)):
            raise ValueError("A command with that name already exists. No existing code was overwritten.")
        previous = _snapshot(entity)
        await _history(hass, entity, f"Edit {new_dev}/{new_cmd}", previous)
        if has_old:
            del codes[old_dev][old_cmd]
            if not codes[old_dev]:
                del codes[old_dev]
        codes.setdefault(new_dev, {})[new_cmd] = value
        try:
            await entity._code_storage.async_save(codes)
        except Exception:
            codes.clear()
            codes.update(previous)
            raise
    return {"device": new_dev, "command": new_cmd}


def _reply_error(connection: Any, msg: dict, exc: Exception) -> None:
    connection.send_error(msg["id"], "rm4_manager_error", str(exc))


@websocket_api.websocket_command({vol.Required("type"): "rm4_code_manager/list", vol.Optional("entity_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_list(hass: HomeAssistant, connection: Any, msg: dict) -> None:
    try:
        remotes = _remote_entities(hass)
        options = [{"entity_id": eid, "name": (hass.states.get(eid).name if hass.states.get(eid) else eid)} for eid in sorted(remotes)]
        response: dict = {"remotes": options, "devices": {}, "version": MANAGER_VERSION}
        selected = msg.get("entity_id", "")
        if selected:
            entity = _get_remote(hass, selected)
            await _loaded(entity)
            response["devices"] = {
                dev: {name: {"codes": deepcopy(value), "type": _code_type(value), "alternative": isinstance(value, list)}
                      for name, value in sorted(cmds.items())}
                for dev, cmds in sorted(entity._codes.items())
            }
        connection.send_result(msg["id"], response)
    except Exception as exc:
        _reply_error(connection, msg, exc)


@websocket_api.websocket_command({
    vol.Required("type"): "rm4_code_manager/save",
    vol.Required("entity_id"): str,
    vol.Required("device"): str,
    vol.Required("command"): str,
    vol.Required("code1"): str,
    vol.Optional("code2"): str,
    vol.Optional("original_device"): str,
    vol.Optional("original_command"): str,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save(hass: HomeAssistant, connection: Any, msg: dict) -> None:
    try:
        entity = _get_remote(hass, msg["entity_id"])
        result = await _save_direct(hass, entity, msg)
        connection.send_result(msg["id"], result)
    except Exception as exc:
        _reply_error(connection, msg, exc)


@websocket_api.websocket_command({
    vol.Required("type"): "rm4_code_manager/action",
    vol.Required("entity_id"): str,
    vol.Required("device"): str,
    vol.Required("command"): str,
    vol.Required("action"): vol.In(["learn", "send", "delete"]),
    vol.Optional("command_type"): vol.In(["ir", "rf"]),
    vol.Optional("alternative"): bool,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_action(hass: HomeAssistant, connection: Any, msg: dict) -> None:
    try:
        entity = _get_remote(hass, msg["entity_id"])
        await _loaded(entity)
        device = _validate_name(msg["device"], "Device")
        command = _validate_name(msg["command"], "Command")
        action = msg["action"]
        if not entity.is_on:
            raise ValueError("The Broadlink remote entity is off. Turn it on before learning, sending, or deleting.")
        before = deepcopy(entity._codes.get(device, {}).get(command))
        if action in ("learn", "delete") and before is not None:
            await _history(hass, entity, f"Before {action} {device}/{command}", _snapshot(entity))
        if action == "learn":
            params = {
                "entity_id": entity.entity_id,
                "device": device, "command": command,
                "command_type": msg.get("command_type", "ir"),
                "alternative": msg.get("alternative", False),
            }
        else:
            if before is None:
                raise ValueError("Command no longer exists. Refresh the list.")
            params = {"entity_id": entity.entity_id, "device": device, "command": command}
        await hass.services.async_call("remote", {"learn": "learn_command", "send": "send_command", "delete": "delete_command"}[action], params, blocking=True)
        after = entity._codes.get(device, {}).get(command)
        if action == "learn" and after is None:
            raise ValueError("No learned code was saved. Try again and watch HA notifications.")
        if action == "delete" and after is not None:
            raise ValueError("Deletion did not complete. Check Home Assistant logs.")
        connection.send_result(msg["id"], {"ok": True, "changed": before != after, "action": action})
    except Exception as exc:
        _reply_error(connection, msg, exc)


async def _async_register_manager(hass: HomeAssistant) -> bool:
    """Register the admin panel and websocket endpoints once, for YAML or UI setup."""
    manager_data = hass.data.setdefault(DOMAIN, {})
    if manager_data.get("registered"):
        return True
    for handler in (ws_list, ws_save, ws_action):
        websocket_api.async_register_command(hass, handler)
    assets = Path(__file__).parent / "www"
    await hass.http.async_register_static_paths(
        [StaticPathConfig("/rm4-code-manager", str(assets), False)]
    )
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path="rm4-code-manager",
        webcomponent_name="rm4-code-manager-panel",
        sidebar_title="Remote Manager",
        sidebar_icon="mdi:remote",
        module_url=f"/rm4-code-manager/panel.js?v={MANAGER_VERSION}",
        require_admin=True,
        config_panel_domain=DOMAIN,
    )
    manager_data["registered"] = True
    return True


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Initialize integration; preserve legacy configuration.yaml installations."""
    if DOMAIN in config:
        return await _async_register_manager(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: Any) -> bool:
    """Initialize Remote Manager when configured from Devices & services."""
    return await _async_register_manager(hass)
