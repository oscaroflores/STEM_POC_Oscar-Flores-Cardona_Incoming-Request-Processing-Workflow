"""
Central configuration for Conductor.

Everything that controls behavior in a demo vs. a real deployment lives here so
that the rest of the codebase has no magic numbers. Classification requires
Bedrock model access; there is no deterministic classifier fallback.
"""

import os


# --- Bedrock / LLM integration ---------------------------------------------
# AI classification is required by design. Bedrock failures surface to the API
# and should be fixed or handled by a human operator; they are not masked by a
# keyword classifier.
AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")

# Model id is swappable. Cheap, fast, JSON-reliable models are preferred for the
# classification task (the model's only job). Examples that work well on Bedrock:
#   amazon.nova-lite-v1:0   (fast, cheap, steady JSON)
#   anthropic.claude-3-5-haiku-20241022-v1:0
#   us.deepseek.r1-v1:0
BEDROCK_MODEL_ID: str = os.getenv(
    "CONDUCTOR_MODEL_ID", "amazon.nova-lite-v1:0"
)

BEDROCK_TIMEOUT_SECONDS: float = float(os.getenv("CONDUCTOR_LLM_TIMEOUT", "12"))


# --- PHI masking gateway -----------------------------------------------------
# The workflow API talks to this internal service before classification or
# persistence. Docker Compose points it at http://phi-masker:8100; local dev can
# run the masking service on localhost:8100.
PHI_MASKING_SERVICE_URL: str = os.getenv(
    "PHI_MASKING_SERVICE_URL", "http://localhost:8100"
).rstrip("/")
MASKING_TIMEOUT_SECONDS: float = float(os.getenv("CONDUCTOR_MASKING_TIMEOUT", "12"))
MASK_MIN_SCORE: float = float(os.getenv("CONDUCTOR_MASK_MIN_SCORE", "0.5"))


# --- Safety gates -----------------------------------------------------------
# Any request the AI manager is less than this confident about is force-routed
# to human review, regardless of its predicted type. Uncertainty is made visible
# rather than hidden behind a confident-looking action.
CONFIDENCE_THRESHOLD: float = float(os.getenv("CONDUCTOR_CONF_THRESHOLD", "0.70"))

# Demo pacing: seconds the orchestrator pauses between requests so a viewer can
# watch the queue drain. Set to 0 for instant batch processing.
PROCESS_DELAY_SECONDS: float = float(os.getenv("CONDUCTOR_PROCESS_DELAY", "1.1"))


# --- Storage ----------------------------------------------------------------
DB_PATH: str = os.getenv(
    "CONDUCTOR_DB_PATH",
    os.path.join(os.path.dirname(__file__), "conductor_audit.db"),
)
SAMPLE_DATA_PATH: str = os.path.join(
    os.path.dirname(__file__), "data", "sample_requests.json"
)
