import time
import pytest
from src.core.session import (
    generate_session_token,
    verify_session_token,
    create_session_id,
    is_valid_session_id,
)


def test_create_session_id_format():
    sess_id = create_session_id()
    assert sess_id.startswith("sess_")
    assert is_valid_session_id(sess_id) is True
    assert is_valid_session_id("invalid_session") is False
    assert is_valid_session_id("../traversal") is False
    assert is_valid_session_id("") is False


def test_generate_and_verify_valid_token():
    token, sess_id = generate_session_token()
    assert token is not None
    assert sess_id in token

    verified_id = verify_session_token(token)
    assert verified_id == sess_id


def test_tampered_token_rejected():
    token, sess_id = generate_session_token()
    parts = token.split(".")
    assert len(parts) == 3

    # 1. Tamper with session_id
    tampered_id = f"sess_00000000000000000000000000000000.{parts[1]}.{parts[2]}"
    assert verify_session_token(tampered_id) is None

    # 2. Tamper with timestamp
    tampered_ts = f"{parts[0]}.9999999999.{parts[2]}"
    assert verify_session_token(tampered_ts) is None

    # 3. Tamper with signature
    tampered_sig = f"{parts[0]}.{parts[1]}.deadbeefdeadbeef"
    assert verify_session_token(tampered_sig) is None

    # 4. Malformed tokens
    assert verify_session_token("not-a-token") is None
    assert verify_session_token("") is None
    assert verify_session_token("a.b") is None


def test_expired_token_rejected():
    # Token generated with timestamp in the past
    past_ts = int(time.time()) - 1000
    token, sess_id = generate_session_token(timestamp=past_ts)

    # If max_age is 100s, this past token must be rejected
    assert verify_session_token(token, max_age_seconds=100) is None
    # If max_age is 2000s, this past token is still valid
    assert verify_session_token(token, max_age_seconds=2000) == sess_id


def test_future_timestamp_skew_rejected():
    # Token from 10 minutes in the future (clock skew anomaly)
    future_ts = int(time.time()) + 600
    token, _ = generate_session_token(timestamp=future_ts)
    assert verify_session_token(token) is None
