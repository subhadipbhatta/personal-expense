**Overview**
- **Purpose**: This repository provides a lightweight automation framework built on Playwright (Python) with three cooperating capabilities: a resilient test runner, a self-healing layer, and an agent-driven planner.

**Out-of-the-box Features**
- **Playwright Test Runner**: `playwright-test-runner` — runs UI flows using Playwright (directly) or via the local Playwright HTTP control server (MCP server). Runners live under `Automation_Framework/scripts/` and produce structured artifacts.
- **Playwright Test Healer**: `playwright-test-healer` — a self-healing wrapper that intercepts locator failures and attempts recovery strategies (alternative locators, retries, contextual heuristics). The self-healing flows are exercised by scripts like `run_selfhealing_tests.py` and `run_selfhealing_via_mcp.py`.
- **Playwright Test Planner**: `playwright-test-planner` — an agent-driven planner that can explore pages (via the MCP server), generate step-by-step Markdown test plans, and persist them to the `specs/` directory using the server `save_plan` endpoint.

**Agents & Their Roles**
- **Web Agent**: Orchestrates browser interactions (navigate, click, fill, press, evaluate, screenshot). It can execute steps directly with Playwright or issue commands to the MCP server via `Automation_Framework/agents/mcp_client.py`.
- **API Agent**: Issues REST calls and validates API responses; used for API testcases (see `scripts/run_api_booking.py`).
- **TDM Agent**: Test Data Management agent for provisioning, masking, or selecting test data prior to runs (used by data-driven scripts).
- **Salesforce Agent**: Domain-specific helper for Salesforce flows (login helpers, Lightning navigation); typically works in tandem with the Web Agent for SFHC scenarios.

These agents are thin, pluggable modules that the orchestrator and runners call to separate concerns (page operations vs business logic vs test data setup).

**Where Artifacts Land**
- **JSON / HTML / Markdown reports**: `Automation_Framework/tests/reports/`
- **JSON reports**: `Automation_Framework/tests/reports/json_reports/`
- **HTML dashboard**: `Automation_Framework/tests/reports/html_reports/index.html`
- **Screenshots**: `Automation_Framework/tests/screenshots/`
- **Generated test plans (planner output)**: `specs/`

**How the Pieces Work Together**
- The `playwright-test-runner` executes a scenario either directly (Playwright script) or by instructing the local MCP (Playwright HTTP control server) using the `PlaywrightMCPClient`.
- When a UI step fails, the `playwright-test-healer` wraps step execution and invokes recovery strategies before deciding to fail the test. Healer decisions and attempted fixes are recorded in the produced report for traceability.
- The `playwright-test-planner` is used to produce human-readable plans. A planner agent drives the page (via the MCP server), inspects elements, and can call the `save_plan` control endpoint to write a Markdown plan to `specs/`.

**Quickstart (examples)**
- Activate virtualenv from the repo root:
  ```bash
  cd /Users/Shub_Bhattacharyya/Library/CloudStorage/OneDrive-EPAM/AI/PlaywrightMCP
  source .venv/bin/activate
  ```
- Run a Playwright script directly (from repo root):
  ```bash
  .venv/bin/python Automation_Framework/scripts/run_parabank_test.py
  ```
- Or run with explicit `PYTHONPATH` so imports resolve:
  ```bash
  PYTHONPATH=. .venv/bin/python Automation_Framework/scripts/run_selfhealing_via_mcp.py
  ```
- Generate the consolidated dashboard (aggregates JSON reports):
  ```bash
  .venv/bin/python Automation_Framework/scripts/generate_dashboard.py
  ```

**Developer Notes**
- MCP server implementation: `Automation_Framework/mcp_server/playwright_server.py` — exposes endpoints for `navigate`, `click`, `fill`, `press`, `evaluate`, `wait_for_selector`, `screenshot`, and `save_plan`.
- MCP client: `Automation_Framework/agents/mcp_client.py` — normalizes agent tool names and maps them to server endpoints for stable agent integration.
- Reporting helper: `Automation_Framework/scripts/reporting.py` — centralizes JSON/HTML/MD writer logic used by runners.

**Canonical Modules & Migration Notes**
- **Canonical locations**: the framework's primary implementations live under `Automation_Framework` in these packages:
  - `Automation_Framework/self_healing/element_repository.py` — SQL-backed element locator repository (canonical ElementRepository).
  - `Automation_Framework/self_healing/healing_engine.py` — HealingContext and SelfHealingEngine (canonical self-healing logic).
  - `Automation_Framework/agents/` — agent implementations (`web_agent.py`, `api_agent.py`, `salesforce_agent.py`, `data_agent.py`, `mcp_client.py`).
  - `Automation_Framework/mcp_server/playwright_server.py` — MCP (Playwright HTTP control server) exposing page-control endpoints.
  - `Automation_Framework/scripts/reporting.py` — centralized reporting helpers and `generate_dashboard.py` for HTML aggregation.

- **Legacy/skeleton wrappers**: for backward compatibility the repository retains small compatibility wrappers under `Automation_Framework/utils/` that forward to the canonical implementations. These wrappers preserve historical import paths (e.g. `from Automation_Framework.utils.element_repository import ElementRepository`) while the real logic is centralized under `self_healing/`.

- **Recommended migration**:
  - Update imports to use the canonical modules. Examples:
    - Before: `from Automation_Framework.utils.element_repository import ElementRepository`
    - After:  `from Automation_Framework.self_healing.element_repository import ElementRepository`

  - After updating imports across your codebase and CI, you can safely remove the compatibility wrappers in `Automation_Framework/utils/`.

- **Why migrate**: centralizing code avoids duplication, reduces maintenance overhead, and ensures healing logic and locator storage are fully-featured (SQL persistence, history, scoring).

- **Quick verification steps after migrating imports**:
  1. From repo root, activate the venv: `source .venv/bin/activate`.
 2. Run a smoke script, for example:
     ```bash
     PYTHONPATH=. .venv/bin/python Automation_Framework/scripts/run_parabank_test.py
     ```
  3. Regenerate the dashboard:
     ```bash
     PYTHONPATH=. .venv/bin/python Automation_Framework/scripts/generate_dashboard.py
     ```

  If everything passes, remove the wrappers and update the README to state the wrappers were removed.

**Extending the Framework**
- To add a new agent, implement a small client exposing a consistent set of methods (e.g., `navigate`, `click`, `fill`, `screenshot`) and register/invoke it from the orchestrator or a runner script.
- To add a new runner, place a script under `Automation_Framework/scripts/` that imports the reporting helper and writes standardized JSON reports into `Automation_Framework/tests/reports/json_reports/`.

**Integration: Registered Playwright Agents**

- The orchestrator now uses an `AgentRegistry` to expose logical agent names for easier wiring and editor/agent integration.
- Three Playwright agents are registered as first-class names in the core:
  - `runner`: the Playwright test runner (maps to the `web` agent implementation).
  - `self_healer`: the self-healing agent (wraps `SelfHealingEngine` and `ElementRepository`).
  - `planner`: the planner agent (wraps the data/plan generator).

- Usage: steps within a scenario can explicitly declare an `agent` field (e.g. `"agent": "runner"`) or an `action` will be inferred to choose the appropriate agent. This lets tooling (VS Code agents, Playwright agent extensions) call these logical agents directly.


**Troubleshooting**
- If `ModuleNotFoundError: No module named 'Automation_Framework'` occurs, run from the repo root with `PYTHONPATH=.` or activate the venv before executing scripts (examples above).
- If the MCP server cannot bind the configured port, ensure any prior server instances are stopped and retry.

**Contact / Next Steps**
- If you want, I can:
  - Add a top-level `Automation_Framework/README.md` with per-runner invocation examples.
  - Sweep scripts to ensure every runner writes JSON to `Automation_Framework/tests/reports/json_reports/`.
  - Improve the dashboard to include thumbnails and sorting.
