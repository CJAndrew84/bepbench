"""Optional basic authentication.

Off by default, because running on your own machine leaves nobody to
authenticate against. On for any deployment reachable from elsewhere.
"""

import pytest

from bepkit.app import create_app


@pytest.fixture()
def guarded(monkeypatch, tmp_path):
    monkeypatch.setenv("BEP_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("BEP_AUTH_USER", "manager")
    monkeypatch.setenv("BEP_AUTH_PASSWORD", "correct horse battery staple")
    app = create_app(testing=True)
    with app.app_context():
        yield app.test_client()


def _auth(user, password):
    import base64

    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def test_off_by_default(client):
    assert client.get("/").status_code == 200


def test_locked_without_credentials(guarded):
    response = guarded.get("/")
    assert response.status_code == 401
    assert "Basic" in response.headers["WWW-Authenticate"]


def test_opens_with_the_right_credentials(guarded):
    response = guarded.get("/", headers=_auth("manager", "correct horse battery staple"))
    assert response.status_code == 200


@pytest.mark.parametrize("user, password", [
    ("manager", "wrong"), ("wrong", "correct horse battery staple"),
    ("manager", ""), ("", "correct horse battery staple"),
    ("manager", "correct horse battery stapl"),      # a prefix must not pass
])
def test_rejects_wrong_credentials(guarded, user, password):
    assert guarded.get("/", headers=_auth(user, password)).status_code == 401


def test_the_api_is_guarded_too(guarded):
    """An unguarded API would make the login on the pages pointless."""
    assert guarded.get("/api/projects").status_code == 401
    assert guarded.put("/api/projects/x/values", json={"values": {}}).status_code == 401


def test_health_check_stays_open(guarded):
    """A platform must be able to probe the service without credentials."""
    response = guarded.get("/healthz")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_half_configured_credentials_do_not_enable_auth(monkeypatch, tmp_path):
    """A password with no user must not lock everyone out of their own data."""
    monkeypatch.setenv("BEP_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("BEP_AUTH_PASSWORD", "secret")
    monkeypatch.delenv("BEP_AUTH_USER", raising=False)
    app = create_app(testing=True)
    with app.app_context():
        assert app.test_client().get("/").status_code == 200
