"""Agent registry and small adapters to present a consistent agent interface.

This module provides a lightweight registry to register named agents
and adapters to wrap existing agent implementations so the core
orchestrator can treat them uniformly.
"""
from typing import Any, Dict, Optional

class AgentInterface:
    async def execute_step(self, step: Dict[str, Any], test_data: Dict[str, Any], mcp_client: Any):
        """Execute a single step. Concrete adapters should implement this."""
        raise NotImplementedError()


class SimpleAdapter(AgentInterface):
    def __init__(self, delegate: Any):
        self.delegate = delegate

    async def execute_step(self, step: Dict[str, Any], test_data: Dict[str, Any], mcp_client: Any):
        # Delegate to the underlying agent if it provides the async execute_step
        fn = getattr(self.delegate, "execute_step", None)
        if fn is None:
            raise RuntimeError("Delegate agent has no execute_step")
        return await fn(step, test_data, mcp_client)


class SelfHealerAdapter(AgentInterface):
    def __init__(self, healing_engine: Any, element_repository: Any):
        self.healing_engine = healing_engine
        self.element_repository = element_repository

    async def execute_step(self, step: Dict[str, Any], test_data: Dict[str, Any], mcp_client: Any):
        # The self-healer is generally triggered when a web step fails.
        # Support explicit 'heal' action or accept a healing request with a failed_locator.
        failed_locator = step.get("failed_locator") or step.get("selector_value")
        from Automation_Framework.self_healing.healing_engine import HealingContext

        healing_context = HealingContext(
            failed_locator=failed_locator or "",
            error_message=step.get("error_message", ""),
            screenshot_base64=step.get("screenshot_base64", ""),
            page_html=step.get("page_html", ""),
            step_description=step.get("description", ""),
            previous_successful_locators=step.get("previous_locators", []),
        )

        healed = await self.healing_engine.heal_element(healing_context)
        if healed:
            # Store healed locator in repository if engine returned one
            try:
                self.element_repository.store(healed, step.get("description", ""), context={})
            except Exception:
                pass
        return {"status": "healed" if healed else "not_healed", "healed_locator": healed}


class PlannerAdapter(AgentInterface):
    def __init__(self, planner: Any):
        self.planner = planner

    async def execute_step(self, step: Dict[str, Any], test_data: Dict[str, Any], mcp_client: Any):
        # Planner may enrich or generate steps/data. Support a simple contract:
        # - if step.action == 'plan_data' -> call planner.generate_plan
        if step.get("action") == "plan_data":
            # planner may expose `generate` (DataGenerator), `generate_plan`, or `plan`.
            fn = (
                getattr(self.planner, "generate", None)
                or getattr(self.planner, "generate_plan", None)
                or getattr(self.planner, "plan", None)
            )
            if fn is None:
                return {"status": "failure", "error": "planner has no generate/generate_plan/plan"}
            # allow both sync and async
            result = fn(step.get("params", {}))
            if hasattr(result, "__await__"):
                result = await result
            return {"status": "ok", "plan": result}
        return {"status": "noop", "message": "planner did not run"}


class AgentRegistry:
    def __init__(self):
        self._agents: Dict[str, AgentInterface] = {}

    def register(self, name: str, agent: AgentInterface):
        self._agents[name.lower()] = agent

    def get(self, name: Optional[str]) -> Optional[AgentInterface]:
        if not name:
            return None
        return self._agents.get(name.lower())
