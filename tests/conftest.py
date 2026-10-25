import os
import tempfile

import pytest

os.environ.setdefault("BEP_DATA_DIR", tempfile.mkdtemp(prefix="bep-test-"))

from bepkit.app import create_app  # noqa: E402
from bepkit.extensions import db  # noqa: E402


@pytest.fixture()
def app():
    application = create_app(testing=True)
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def project(app):
    from bepkit import services

    return services.create_project("Test Plan", "iso19650", client="Acme", reference="T-001")


@pytest.fixture(autouse=True)
def _no_leaked_overrides():
    """`bep --set` overrides live for the process; never let one test see another's."""
    from bepkit.settings import clear_overrides

    yield
    clear_overrides()
