import base64
import hashlib
import hmac
import os
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import User

bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return base64.b64encode(salt + digest).decode()


def check_password(password: str, stored: str) -> bool:
    try:
        raw = base64.b64decode(stored)
        digest = hashlib.scrypt(password.encode(), salt=raw[:16], n=2**14, r=8, p=1)
        return hmac.compare_digest(digest, raw[16:])
    except (ValueError, TypeError):
        return False


def token_for(user: User) -> str:
    return jwt.encode(
        {"sub": str(user.id), "exp": datetime.now(UTC) + timedelta(hours=12)},
        get_settings().jwt_secret,
        algorithm="HS256",
    )


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User:
    if not credentials:
        raise HTTPException(401, "Authentication required", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(credentials.credentials, get_settings().jwt_secret, algorithms=["HS256"])
        user = db.get(User, int(payload["sub"]))
        if user is None:
            raise ValueError("Unknown user")
        return user
    except (jwt.PyJWTError, ValueError, KeyError, TypeError):
        raise HTTPException(401, "Invalid or expired token", headers={"WWW-Authenticate": "Bearer"}) from None
