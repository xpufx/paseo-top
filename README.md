# paseo-top

<p align="center">
  <img src="screenshots/pill.png" alt="Paseo Top Composer Pill" />
  <br /><br />
  <img src="screenshots/modal.png" alt="Paseo Top Resource Modal" />
</p>

Live host system resource monitor for [Paseo](https://github.com/getpaseo/paseo).

Displays real-time CPU and memory metrics right in the composer track bar without cluttering the screen, with a full-detail native modal available on click.

Built with [`paseo-plugin-helper`](https://github.com/xpufx/paseo-plugin-helper) for native UI primitives (`Card`, `MetricGauge`, `ProgressBar`, `KeyValueGroup`, `Tabs`), structured logging, and typed RPC contracts.

## Features

- **Alternating Composer Pill**: Cycles between system metrics and workspace info directly in the trackbar above the prompt input.
- **Pill Display Settings**: Dedicated settings tab to customize which info groups alternate (CPU/RAM, Worktree/Branch, Agent/Model, System Load, Uptime) and rotation speed (2s, 3s, 4s, 6s).
- **Workspace & Agent Context**: Tab with active worktree name, Git branch, working directory (copyable), project name, diff stats, and agent model/status.
- **Circular Arc Gauges (`<MetricGauge>`)**: Dual circular gauges in the modal hero section for instant visual inspection of CPU and RAM load.
- **Three-Tier Status Colors**:
  - 🟢 **Green** (`statusSuccess`): Normal load (< 60% CPU, < 70% RAM).
  - 🟠 **Orange** (`statusWarning`): Elevated usage (60%–84% CPU, 70%–84% RAM).
  - 🔴 **Red** (`statusDanger`): Critical usage (≥ 85% CPU or RAM).
- **Smart Lifecycle Polling (`useAutoRefreshQuery`)**: Automatically halts background polling when the modal is closed to conserve mobile battery and device CPU.
- **Pull-to-Refresh & Haptics**: Native pull-to-refresh on mobile via `<ModalBody>` with tactile haptic feedback (`triggerHaptic`).
- **Tabbed Modal Navigation (`<Tabs>`)**:
  - **System**: Gauges, detailed CPU meters, memory stats, load averages (1m, 5m, 15m), and host specs.
  - **Workspace**: Dedicated tab for active workspace, branch, worktree, and agent session details.
  - **Pill Display**: Preference toggles and rotation timer controls.
- **Cross-Platform Clipboard**: 1-tap copy for hostname, directory paths, and metadata with native toast notifications.
- **Ghost Fallback**: Displays a `Ghost` icon if metrics fail or the daemon host is unreachable.

## Installation

Install directly with the Paseo CLI:

```bash
paseo plugin add https://github.com/xpufx/paseo-top
```

Or for local development:

```bash
git clone git@github.com:xpufx/paseo-top.git
paseo plugin add ./paseo-top
```

Once installed, it is listed as `top` in `paseo plugin ls`.

## Development

```bash
npm run typecheck
paseo plugin reload top
paseo plugin logs top
```

## License

MIT
