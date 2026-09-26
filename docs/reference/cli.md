# CLI Reference

After installation, run `sideaudio` from any directory. In a source checkout, run `npm run cli -- <command>` from the repository root.

## Configuration and Diagnostics

| Command | Purpose |
| --- | --- |
| `sideaudio --version` | Show the CLI version |
| `sideaudio config` | Show the config path; create a template if missing |
| `sideaudio config show` | Show the configured voice provider, model, and available models without credentials |
| `sideaudio config set --realtime-model ID` | Change the current provider's model setting |
| `sideaudio doctor` | Read-only configuration, connection, and state checks |
| `sideaudio doctor --json` | Print diagnostic JSON |
| `sideaudio doctor --turn ID` | Build a turn timeline from local logs |
| `sideaudio setup` | Check integration readiness for all backends |
| `sideaudio setup --backend qwen --json` | Check one backend and print JSON |

`config show` reads configuration, not live model availability. `setup` does not verify backend accounts or quota. [Apply configuration changes](../operations/gateway.md#applying-configuration-changes) after changing models.

## Gateway

| Command | Purpose |
| --- | --- |
| `sideaudio` / `sideaudio gateway` | Run in the current terminal |
| `sideaudio gateway --backend qwen` | Use Qwen Code for this run |
| `sideaudio gateway --backend none` | Run frontend-only |
| `sideaudio gateway install` | Install and start a user background service |
| `sideaudio gateway start` / `stop` / `restart` | Manage the installed background service |
| `sideaudio gateway status` | Check reachability and local service status |
| `sideaudio gateway uninstall` | Remove the user service without deleting user data |
| `sideaudio gateway --lan` | Expose an endpoint on a trusted LAN |
| `sideaudio gateway --tailnet` | Publish a private endpoint through system Tailscale Serve |
| `sideaudio gateway --webrtc` | Enable the installed optional WebRTC extension |

`gateway stop/restart` does not manage a foreground process in another terminal. Stop that process with `Ctrl-C` in its terminal. Background services read backend settings from `config.env` and reject `--backend` overrides.

`--lan` and `--tailnet` are mutually exclusive and also work with `gateway install`. Normal remote access does not require WebRTC.

## Clients and Pairing

| Command | Purpose |
| --- | --- |
| `sideaudio tui` | Connect to the Gateway with a voice terminal |
| `sideaudio tui --audio-mode half` | Linux / Windows half-duplex |
| `sideaudio tui --audio-mode full` | Linux / Windows full-duplex without AEC; use headphones |
| `sideaudio tui --takeover` | Explicitly take over the user's active connection |
| `sideaudio webui` | Open the Gateway page in a browser |
| `sideaudio webui --no-open` | Print the page URL only |
| `sideaudio gateway pair --name "My phone"` | Issue a connection link and QR code on the Gateway host |
| `sideaudio gateway pair --endpoint https://voice.example.com` | Issue a link using a specified remote endpoint |
| `sideaudio gateway devices` | List paired devices |
| `sideaudio gateway revoke DEVICE_ID` | Revoke device credentials |
| `sideaudio connect 'full-connection-link'` | Save the endpoint and credentials for TUI |
| `sideaudio disconnect` | Forget TUI's saved connection without revoking the server-side device |

Use `--url URL` to specify a Gateway and `--session ID` to select a frontend session in TUI / WebUI. Client commands do not launch backend Agents or change Gateway models. For WebUI, open the connection link directly or use `--url`; it does not read TUI's saved connection profile.

Connection links contain credentials. Do not commit them to scripts or share screenshots publicly. See [Remote Connections](../operations/remote-access.md).

## Backends and Skills

```bash
sideaudio install qwen
sideaudio skill install owner/repo --list
sideaudio skill install owner/repo --skill skill-name
sideaudio skill list
sideaudio skill remove skill-name
sideaudio skill update
```

`install` installs components; you still complete backend authentication and model setup. `skill` installs only for backends. See [Backend Settings](../configuration/backend.md) and [Skills](../guides/skills.md).

Use `sideaudio --help` for the current version's complete options. Inside TUI, use `/help` rather than sending CLI commands as chat.
