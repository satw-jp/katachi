from __future__ import annotations

from dataclasses import dataclass


SCHEMA_VERSION = "authored-support-v1"
EXIT_OK = 0
EXIT_ERROR = 1
EXIT_HOLD = 2


@dataclass(frozen=True)
class Hold:
    code: str
    message: str
    subject: str | None = None

    def as_dict(self) -> dict[str, str]:
        result = {"code": self.code, "message": self.message}
        if self.subject is not None:
            result["subject"] = self.subject
        return result


class ContractError(ValueError):
    """A malformed or unsafe execution contract."""
