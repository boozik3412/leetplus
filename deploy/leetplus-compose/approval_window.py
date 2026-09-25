"""Pure native-plan signing window; no key access or signing side effect."""
import re
from datetime import datetime, timedelta, timezone


def plan_expiration(plan, now):
    end = now + timedelta(hours=4)
    if plan.get('contract') == 'LEETPLUS_COMPOSE_BLUE_GREEN_V2_PLAN':
        baseline_value = plan.get('dataBaselineExpiresAt')
        if not isinstance(baseline_value, str) or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z', baseline_value):
            raise ValueError('V2 app-only plan requires an exact certified-baseline expiry')
        baseline_expiry = datetime.fromisoformat(baseline_value.replace('Z', '+00:00'))
        if baseline_expiry <= now.astimezone(timezone.utc):
            raise ValueError('Certified data baseline expired; a new approval cannot refresh it')
        end = min(end, baseline_expiry)
    if 'preparationGuard' not in plan and 'preparationEvidenceExpiresAt' not in plan:
        if plan.get('contract') == 'LEETPLUS_COMPOSE_BLUE_GREEN_V2_PLAN':
            raise ValueError('V2 app-only plan requires bounded preparation evidence')
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
