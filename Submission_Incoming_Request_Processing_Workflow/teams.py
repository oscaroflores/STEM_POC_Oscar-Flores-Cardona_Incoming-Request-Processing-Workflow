from pydantic import BaseModel


class Team(BaseModel):
    name: str
    queue: str


_TEAMS = {
    "senior_handler": Team(
        name="Senior Resolution Desk",
        queue="tmk-priority-complaints",
    ),
    "benefits_team": Team(
        name="Benefits & Eligibility Team",
        queue="tmk-benefits-eligibility",
    ),
    "scheduling": Team(
        name="Scheduling & Service Coordination",
        queue="tmk-service-scheduling",
    ),
    "billing": Team(
        name="Billing & Claims Review",
        queue="tmk-billing-disputes",
    ),
    "human_review": Team(
        name="Human Review Supervisor Desk",
        queue="tmk-supervisor-review",
    ),
}


def team(key: str) -> Team:
    return _TEAMS[key]
