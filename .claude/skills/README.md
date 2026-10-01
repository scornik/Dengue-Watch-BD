# Project skills

Third-party Claude Code skills used to review this app's design and game experience, and to build its launch videos. They are vendored as-is (each folder keeps its upstream license) so every Claude Code session on this repo has them.

| Skill | Source | License |
| --- | --- | --- |
| `game-ui-ux`, `game-feel` | [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) | Apache-2.0 (see `LICENSE`, `NOTICE`) |
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | MIT |
| `no-ai-design-slop`, `audit-ai-design-slop`, `design-first-ui-prompting` | [MengTo/skills](https://github.com/MengTo/skills) | MIT |
| `remotion-*` (12 skills, used for the launch videos in `media/video`) | [remotion-dev/skills](https://github.com/remotion-dev/skills), installed with `npx skills add remotion-dev/skills` (pinned in `skills-lock.json`) | Remotion's terms, see [remotion.dev/license](https://www.remotion.dev/license) |

Not vendored: [ruvnet/ruflo](https://github.com/ruvnet/ruflo). It is a multi-agent orchestration platform (`npx ruflo init` adds MCP servers and hooks to the repo) and its security skills run `npx @claude-flow/cli@latest` (unpinned remote code, with `--fix` editing files). The security review used the standard auditors those skills wrap (`pnpm audit`, `pip-audit`) instead.

These skills are tools for contributors; they are not part of the shipped app.
