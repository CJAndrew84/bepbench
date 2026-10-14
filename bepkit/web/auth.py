"""Optional HTTP basic authentication.

Off by default: run it on your own machine and there is nobody to authenticate
against. It exists because a BEP routinely carries information an appointing
party has classified as sensitive under ISO 19650-5, and any remote deployment
puts that behind a URL somebody could guess or share.

Enabled by setting BEP_AUTH_USER and BEP_AUTH_PASSWORD, or `auth.enabled` in
the settings file. Health checks stay open so a platform can probe the service.
"""

from __future__ import annotations

import hmac
import os

from flask import Flask, Response, request

from ..settings import get as setting

OPEN_PATHS = ("/healthz",)


def credentials() -> tuple[str, str] | None:
    """The configured user and password, or None when auth is off."""
    user = os.environ.get("BEP_AUTH_USER") or setting("auth.user", "")
    password = os.environ.get("BEP_AUTH_PASSWORD") or setting("auth.password", "")
    if not user or not password:
        return None
    return str(user), str(password)


def _matches(given: str, expected: str) -> bool:
    # Constant time, so a wrong password cannot be found a character at a time.
    return hmac.compare_digest(given.encode(), expected.encode())


def init_app(app: Flask) -> None:
    pair = credentials()
    if pair is None:
        app.logger.info("auth: disabled (set BEP_AUTH_USER and BEP_AUTH_PASSWORD to enable)")
        return
    user, password = pair
    app.logger.info("auth: basic authentication enabled for user %r", user)

    @app.before_request
    def require_login():
        if request.path in OPEN_PATHS:
            return None
        sent = request.authorization
        if sent and sent.username and sent.password \
                and _matches(sent.username, user) and _matches(sent.password, password):
            return None
        return Response(
            "Authentication required.", 401,
            {"WWW-Authenticate": 'Basic realm="BEP Bench", charset="UTF-8"'},
        )
