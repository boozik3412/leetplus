"""Pure native-plan signing window; no key access or signing side effect."""
import re
from datetime import datetime, timedelta, timezone


def plan_expiration(plan, now):
    end = now + timedelta(hours=4)
    if 'preparationGuard' not in plan and 'preparationEvidenceExpiresAt' not in plan:
        return end
    guard = plan.get('preparationGuard')
    if not isinstance(guard, dict) or guard.get('contract') != 'LEETPLUS_PREPARATION_GUARD_V1':
        raise ValueError('Preparation evidence requires its bound guard')
    value = plan.get('preparationEvidenceExpiresAt')
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z', value):
        raise ValueError('Preparation evidence requires an immutable UTC expiry')
    expiry = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if expiry <= now.astimezone(timezone.utc):
        raise ValueError('Preparation evidence expired; a new approval cannot refresh it')
    return min(end, expiry)
