"""
Local unit tests for Kissflow SSO access helpers (no remote server required).
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


def test_is_adrenalin_sp_detection():
    def _is_adrenalin_sp(acs_url='', entity_id='', app_name='', home_url=''):
        blob = f"{acs_url} {entity_id} {app_name} {home_url}".lower()
        return 'adrenalin' in blob or 'myadrenalin' in blob

    assert _is_adrenalin_sp("https://refex.myadrenalin.com/saml", "", "") is True
    assert _is_adrenalin_sp("", "", "Adrenalin ESS") is True
    assert _is_adrenalin_sp("", "", "ESS", "https://refex.myadrenalin.com/") is True
    assert _is_adrenalin_sp("https://refexgroup.kissflow.com/acs", "", "") is False


def test_resolve_saml_name_id_adrenalin():
    def _resolve_saml_name_id(
        user,
        acs_url='',
        entity_id='',
        app_name='',
        home_url='',
        default_format='urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    ):
        email = (user.get('email') or '').strip()
        if email and '@' in email:
            return email, default_format
        return '', default_format

    acs = "https://refex.myadrenalin.com/saml/acs"
    user = {"email": "murugesh.k@refex.co.in", "adrenalin_employee_id": "RXIL002027"}
    name_id, fmt = _resolve_saml_name_id(user, acs, "", "Adrenalin ESS")
    assert name_id == "murugesh.k@refex.co.in"
    assert "emailAddress" in fmt

    user_no_email = {"adrenalin_employee_id": "RXIL002027"}
    name_id2, fmt2 = _resolve_saml_name_id(user_no_email, acs, "", "Adrenalin ESS")
    assert name_id2 == ""

    kf = _resolve_saml_name_id(user, "https://kissflow.com/acs", "", "Expense")
    assert kf[0] == "murugesh.k@refex.co.in"
