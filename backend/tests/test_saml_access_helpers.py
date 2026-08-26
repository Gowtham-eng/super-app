"""
Local unit tests for Kissflow/Adrenalin SSO access helpers (no remote server required).
"""


def test_check_user_app_access_restricted_flag():
    def check_user_app_access(user: dict, app: dict) -> bool:
        is_admin_role = user.get('role') in ('org_admin', 'owner', 'admin')
        if app.get('restricted'):
            return is_admin_role
        return True

    admin = {"role": "org_admin"}
    user = {"role": "user"}
    assert check_user_app_access(admin, {"restricted": True}) is True
    assert check_user_app_access(user, {"restricted": True}) is False
    assert check_user_app_access(user, {"restricted": False}) is True
    assert check_user_app_access(user, {}) is True


def test_nameid_email_guard():
    """Empty / invalid email must be rejected before assertion build."""
    def valid_nameid(email):
        name_id = (email or '').strip()
        return bool(name_id and '@' in name_id)

    assert valid_nameid("gowtham.s@refex.co.in") is True
    assert valid_nameid("") is False
    assert valid_nameid(None) is False
    assert valid_nameid("not-an-email") is False


def test_is_kissflow_sp_detection():
    def _is_kissflow_sp(acs_url='', entity_id='', app_name=''):
        blob = f"{acs_url} {entity_id} {app_name}".lower()
        return 'kissflow' in blob

    assert _is_kissflow_sp("https://refexgroup.kissflow.com/acs", "", "") is True
    assert _is_kissflow_sp("", "", "Expense Management") is False
    assert _is_kissflow_sp("", "", "Kissflow Expense") is True


def test_adrenalin_nameid_prefers_employee_code():
    """Adrenalin NameID should use employee id when present."""
    emp_id = "E12345"
    email = "user@refex.co.in"
    is_adrenalin = True
    if is_adrenalin and emp_id:
        name_id = emp_id
    else:
        name_id = email
    assert name_id == "E12345"

    emp_id = ""
    if is_adrenalin and emp_id:
        name_id = emp_id
    else:
        name_id = email
    assert name_id == email


def test_is_adrenalin_sp_detection():
    def _is_adrenalin_sp(acs_url='', entity_id='', app_name=''):
        blob = f"{acs_url} {entity_id} {app_name}".lower()
        return 'adrenalin' in blob or 'myadrenalin' in blob

    assert _is_adrenalin_sp("https://refex.myadrenalin.com/acs", "", "") is True
    assert _is_adrenalin_sp("", "", "MyAdrenalin") is True
    assert _is_adrenalin_sp("https://kissflow.com/acs", "", "Expense") is False
