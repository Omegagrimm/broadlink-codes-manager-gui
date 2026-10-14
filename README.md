# Broadlink Code Manager — Home Assistant HACS integration (experimental)

A Home Assistant sidebar manager for learned **Broadlink RM4 Pro IR/RF remote commands**. The integration uses Home Assistant's existing Broadlink remote entity; it does **not** replace the official Broadlink integration.

Version **0.1.1**: HACS repository layout and zero-configuration UI setup, plus the code-management functionality from v0.1.0.

> **Prototype safety notice:** This is not yet tested on a real Home Assistant installation or RM4 Pro. Make a full Home Assistant backup before use. Renaming and direct Base64 editing rely on private Broadlink interfaces and may stop working when Home Assistant changes. Only Home Assistant administrators can access the panel and WebSocket actions. Avoid testing with doors, gates, locks, or safety-critical devices.

## Privacy and keeping your codes private

The public GitHub repository contains **source code only**. It does not include any Home Assistant credentials, learned IR/RF commands, network addresses, or an instance configuration. The manager interacts with your own Home Assistant instance and the official Broadlink integration; it does **not** upload command data to GitHub or a third-party service. If you explicitly export commands from the interface, the downloaded file is for your local use.

Home Assistant stores learned codes and the manager's safety snapshots locally under `.storage/`. **Never commit or attach** your Home Assistant `.storage/` files, `configuration.yaml`, `secrets.yaml`, command exports, backups, or debug logs containing codes/credentials to a public issue or repository. The `.gitignore` helps prevent accidental commits but does not replace checking files before sharing. Avoid including private details when filing issues.

## Installation through HACS

Prerequisites: Home Assistant, HACS installed and working, and the **official Broadlink integration** already configured with a `remote.*` entity.

1. In **HACS**, open the menu in the upper-right corner (**⋮**) and choose **Custom repositories**.
2. Enter the GitHub repository URL for this project (for example, `https://github.com/Omegagrimm/broadlink-codes-manager-gui`). Choose category **Integration**, then **Add**.
3. Find **Broadlink Code Manager** in HACS and **Download** it.
4. **Restart Home Assistant** (HACS installs into `/config/custom_components/rm4_code_manager`).
5. Open **Settings → Devices & services → Add Integration**, search for **Broadlink Code Manager**, and confirm **Enable**.
6. Open **Remote Manager** in the Home Assistant sidebar using an administrator account.

**No `configuration.yaml` entry is required for new HACS installations.** Earlier v0.1.0 installations using `rm4_code_manager:` in YAML still work, but should remove that line *after* adopting the UI config entry if they want GUI-managed setup. Do not create two installations of this integration; HACS already writes the same component directory.

## What it can do

| Action | How it works |
| --- | --- |
| Browse IR/RF devices and learned commands | Reads official Broadlink remote entity's loaded codes |
| Learn IR or RF | Standard `remote.learn_command` service with guided interface; follow HA notification prompts for RF |
| Test | Standard `remote.send_command` service |
| Re-learn | Standard `remote.learn_command` with the same device/command |
| Delete | Standard `remote.delete_command` service |
| Rename or paste Base64 codes | Guarded direct changes to the official Broadlink runtime code dictionary/storage **(private HA API)** |
| Export | Download JSON copy of codes for the selected transmitter |
| Safety snapshots | Stores 15 pre-edit/deletion/re-learn snapshots per remote in `.storage/rm4_code_manager_backups` |

**Important:** Export does not currently include an automatic Import/Restore wizard; restoring historical snapshots still requires technical assistance or a Home Assistant backup restore. Renaming a device or command does **not** update automations that refer to the old names.

## Developer: publishing your own HACS repository

This archive is a **GitHub repository starter**, not a HACS-installable URL by itself. HACS downloads integrations from a GitHub repository.

1. Create a **public GitHub repository**, repository name `broadlink-codes-manager-gui`.
2. On your computer, extract this archive and put its contents **at the repository root** (so `hacs.json`, `README.md` and `custom_components/` are root-level).
3. Run `python scripts/prepare_repository.py Omegagrimm/broadlink-codes-manager-gui` **before committing**. This fills in the two repository-specific URLs in the integration's manifest. If Python is unavailable, replace `YOUR_GITHUB_USERNAME` in `custom_components/rm4_code_manager/manifest.json` manually.
4. Commit and push to the default branch (commonly `main`). HACS can install directly from that branch — a release isn't mandatory. You may create an optional GitHub release tagged `v0.1.1` later.
5. On Home Assistant, follow the HACS installation steps above using your real GitHub repository URL.

The `.github/workflows/validate.yml` workflow contains **HACS validation and Hassfest** checks. These run when the repository is pushed to GitHub; their successful completion has *not* been verified for this prototype.

If the repository name differs from the suggested name, use its real `OWNER/REPOSITORY` as the script argument.

## Using the manager

- **Learn IR:** choose the remote, select a device name and command name, select IR, then press the original physical remote button when the Broadlink LED indicates capture mode.
- **Learn RF:** choose RF, hold the original transmitter button for RF frequency scanning, and press again when prompted for capture. Not every radio protocol or rolling code is supported.
- **Edit/Re-learn:** select an existing command and use the associated action. Base64 must contain a recognized Broadlink packet, not text or a generic IR protocol identifier.
- **Delete:** requires confirmation; the native integration handles deleting the code.
- **Back up:** export existing codes and make a full Home Assistant backup before changing the library.

## Limitations and troubleshooting

- The app only discovers entities managed by the **official Home Assistant Broadlink integration**. If your Broadlink remote doesn't appear, check that the official integration is configured and operational.
- The UI and operations require a **Home Assistant administrator** account.
- A successful `send_command` request cannot establish that an appliance actually responded.
- Editing depends on private HA attributes (`_codes`, `_lock`, `_code_storage`); if a future HA version changes them, editing should fail instead of directly changing JSON files.
- After installing, you may need a browser refresh to load the new sidebar. If the panel is absent, inspect **Settings → System → Logs**.
- Removing the integration from Devices & services requires a **Home Assistant restart** to fully remove the panel from the running frontend in this experimental release. HACS removal only uninstalls its files; it does not remove learned codes from the official Broadlink integration.
- **Compatibility not yet established** on Home Assistant 2026 releases, real RM4 Pro devices, or multiple remotes. Test first with a safe appliance.

## Development checks

```shell
python -m py_compile custom_components/rm4_code_manager/*.py
node --check custom_components/rm4_code_manager/www/panel.js
python tests/test_backend.py
python tests/test_config_flow.py
```

Only isolated mock-backed checks have been run; a full Home Assistant integration test and HACS online validation have not.
