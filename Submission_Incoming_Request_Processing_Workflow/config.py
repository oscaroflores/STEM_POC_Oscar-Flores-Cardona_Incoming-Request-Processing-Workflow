"""
Central configuration for Conductor.

Everything that controls behavior in a demo vs. a real deployment lives here so
that the rest of the codebase has no magic numbers. The Bedrock integration is
gated entirely behind environment variables: with no AWS credentials configured,
the system runs on its deterministic classifier and is fully demoable offline.
"""

import os


# --- Bedrock / LLM integration (optional, env-gated) ------------------------
# AI classification is the DEFAULT and intended mode (the brief requires AI to
# classify each request). The deterministic rule layer is a RESILIENCE FALLBACK
# that only fires if the live model errors or times out, so a healthcare queue
# never stalls on a model hiccup. Set CONDUCTOR_USE_BEDROCK=0 only to force the
# offline fallback (e.g. for a no-credentials dry run).
USE_BEDROCK: bool = os.getenv("CONDUCTOR_USE_BEDROCK", "1") == "1"
AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")

# Model id is swappable. Cheap, fast, JSON-reliable models are preferred for the
# classification task (the model's only job). Examples that work well on Bedrock:
#   amazon.nova-lite-v1:0   (fast, cheap, steady JSON)
#   anthropic.claude-3-5-haiku-20241022-v1:0
#   us.deepseek.r1-v1:0
BEDROCK_MODEL_ID: str = os.getenv(
    "CONDUCTOR_MODEL_ID", "amazon.nova-lite-v1:0"
)

# If the live model call fails or times out, fall back to the deterministic
# classifier rather than breaking the run. Healthcare ops cannot stall.
BEDROCK_TIMEOUT_SECONDS: float = float(os.getenv("CONDUCTOR_LLM_TIMEOUT", "12"))


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
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "conductor_audit.db"),
)
SAMPLE_DATA_PATH: str = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "sample_requests.json"
)
