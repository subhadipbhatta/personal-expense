# Agent Orchestrator (skeleton)

import time

from Automation_Framework.agents.web_agent import WebAutomationAgent
from Automation_Framework.agents.api_agent import APIAutomationAgent
from Automation_Framework.agents.salesforce_agent import SalesforceAgent
from Automation_Framework.agents.data_agent import TestDataAgent
from Automation_Framework.agents.mcp_client import PlaywrightMCPClient
from Automation_Framework.self_healing.element_repository import ElementRepository
from Automation_Framework.self_healing.healing_engine import SelfHealingEngine
from Automation_Framework.data_management.generators import DataGenerator
from Automation_Framework.agents.registry import (
    AgentRegistry,
    SimpleAdapter,
    SelfHealerAdapter,
    PlannerAdapter,
)


class AgentOrchestrator:
    """Orchestrator that uses an AgentRegistry to manage agents.

    This version registers the traditional agents and exposes the
    three Playwright-installed logical agents as first-class names:
    - 'runner' (maps to the web runner)
    - 'self_healer' (maps to the healing engine)
    - 'planner' (maps to the data/plan generator)
    """

    def __init__(self, mcp_client=None):
        self.mcp_client = mcp_client or PlaywrightMCPClient()
        # Concrete agents / implementations
        self.web_agent = WebAutomationAgent()
        self.api_agent = APIAutomationAgent()
        self.salesforce_agent = SalesforceAgent()
        self.data_agent = TestDataAgent()
        self.element_repository = ElementRepository()
        self.healing_engine = SelfHealingEngine(self.mcp_client, self.element_repository)
        self.data_generator = DataGenerator()

        # Registry and adapters
        self.registry = AgentRegistry()
        # register canonical names
        self.registry.register("web", SimpleAdapter(self.web_agent))
        self.registry.register("api", SimpleAdapter(self.api_agent))
        self.registry.register("salesforce", SimpleAdapter(self.salesforce_agent))
        self.registry.register("data", SimpleAdapter(self.data_agent))
        # expose the logical Playwright agents
        self.registry.register("runner", SimpleAdapter(self.web_agent))
        self.registry.register("self_healer", SelfHealerAdapter(self.healing_engine, self.element_repository))
        self.registry.register("planner", PlannerAdapter(self.data_generator))

    async def execute_test_scenario(self, scenario: dict):
        # Ensure MCP client is connected
        await self.mcp_client.connect()

        # Step 1: Generate test data using data agent
        test_data = await self.data_agent.generate_data(scenario.get("data_requirements", {}))

        results = []
        for step in scenario.get("steps", []):
            # step may explicitly declare agent; otherwise infer from action
            agent_name = step.get("agent") or self._get_agent_for_step(step)
            agent_instance = self.registry.get(agent_name)
            result = None
            step_start = None
            try:
                # record step start time
                step_start = time.perf_counter()

                if agent_instance is None:
                    result = {"status": "failure", "error": f"No agent registered for '{agent_name}'", "step": step}
                else:
                    # All adapters implement an async execute_step contract
                    result = await agent_instance.execute_step(step, test_data, self.mcp_client)
                    # If this was a web/runner step and stored a selector, persist it
                    if agent_name in ("web", "runner") and "selector_value" in step:
                        try:
                            self.element_repository.store(step["selector_value"], step.get("description", ""), context={"locator_type": step.get("selector")})
                        except Exception:
                            pass
            except Exception as e:
                result = {"status": "failure", "error": str(e), "step": step}
            finally:
                # record step end time and duration (ms)
                try:
                    if step_start is not None:
                        step_end = time.perf_counter()
                        duration_ms = int((step_end - step_start) * 1000)
                        if isinstance(result, dict):
                            result.setdefault("duration_ms", duration_ms)
                        else:
                            result = {"status": "unknown", "duration_ms": duration_ms}
                except Exception:
                    pass

            results.append({"step": step, "result": result})

        # Step 3: Cleanup test data
        await self.data_agent.cleanup_data(test_data.get("tracking_ids", []))

        await self.mcp_client.close()
        return {"scenario": scenario.get("description", ""), "results": results}

    def _get_agent_for_step(self, step: dict) -> Optional[str]:
        action = step.get("action", "").lower()
        if action in ["navigate", "click", "fill", "verify_text", "screenshot"]:
            return "runner"
        if action in ["get", "post", "put", "delete"]:
            return "api"
        if action.startswith("sf_") or action.startswith("salesforce_"):
            return "salesforce"
        if action in ["plan_data", "plan_steps"]:
            return "planner"
        if action in ["heal", "self_heal"]:
            return "self_healer"
        return None
