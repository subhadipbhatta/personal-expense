import os
import logging
import pytest
import httpx


def _env_choice(*names, default=None):
    for n in names:
        v = os.getenv(n)
        if v:
            return v
    return default


# Support both standard env names and Postman-style collection variable names
BASE_URL = _env_choice("PAYPAL_BASE_URL", "paypal.base_url", default="https://api-m.sandbox.paypal.com")
CLIENT_ID = _env_choice("PAYPAL_CLIENT_ID", "paypal.client_id")
CLIENT_SECRET = _env_choice("PAYPAL_CLIENT_SECRET", "paypal.client_secret")

logging.getLogger(__name__).debug("Using PayPal base url: %s", BASE_URL)


def _creds_available():
    return bool(CLIENT_ID and CLIENT_SECRET)


@pytest.fixture(scope="session")
def access_token():
    # Allow injecting a pre-obtained access token via env to simplify runs
    provided = os.getenv("PAYPAL_ACCESS_TOKEN")
    if provided:
        return provided

    if not _creds_available():
        pytest.skip("PayPal credentials not provided in environment and no PAYPAL_ACCESS_TOKEN")

    auth = httpx.BasicAuth(CLIENT_ID, CLIENT_SECRET)
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        r = client.post(
            "/v1/oauth2/token",
            data={"grant_type": "client_credentials"},
            auth=auth,
            headers={"Accept": "application/json"},
        )
        r.raise_for_status()
        js = r.json()
        token = js.get("access_token")
        assert token, "access_token missing from OAuth response"
        return token


@pytest.fixture
def auth_headers(access_token):
    return {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}


def test_generate_access_token():
    """Test OAuth token generation using client credentials flow."""
    if not _creds_available():
        pytest.skip("PayPal credentials not provided")
    
    auth = httpx.BasicAuth(CLIENT_ID, CLIENT_SECRET)
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        r = client.post(
            "/v1/oauth2/token",
            data={"grant_type": "client_credentials"},
            auth=auth,
            headers={"Accept": "application/json"},
        )
        assert r.status_code == 200, f"unexpected token generation status: {r.status_code} {r.text}"
        js = r.json()
        
        # Validate token response structure
        assert "access_token" in js, "access_token missing from response"
        assert "token_type" in js, "token_type missing from response"
        assert "expires_in" in js, "expires_in missing from response"
        assert js.get("token_type") == "Bearer", "unexpected token type"
        assert isinstance(js.get("expires_in"), int), "expires_in should be an integer"
        assert js.get("expires_in") > 0, "expires_in should be positive"
        
        # Validate token format (should be a non-empty string)
        token = js.get("access_token")
        assert isinstance(token, str), "access_token should be a string"
        assert len(token) > 20, "access_token seems too short"
        
        # Store the token for other tests
        pytest.generated_access_token = js["access_token"]
        pytest.token_expires_in = js["expires_in"]


def test_generate_access_token_with_additional_params():
    """Test OAuth token generation with additional parameters."""
    if not _creds_available():
        pytest.skip("PayPal credentials not provided")
    
    auth = httpx.BasicAuth(CLIENT_ID, CLIENT_SECRET)
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        r = client.post(
            "/v1/oauth2/token",
            data={
                "grant_type": "client_credentials",
                "return_client_metadata": "true",
                "return_authn_schemes": "true"
            },
            auth=auth,
            headers={"Accept": "application/json"},
        )
        assert r.status_code == 200, f"unexpected token generation status: {r.status_code} {r.text}"
        js = r.json()
        
        # Basic validation
        assert "access_token" in js, "access_token missing from response"
        assert "token_type" in js, "token_type missing from response"
        
        # Additional metadata may be present depending on PayPal configuration
        if "client_metadata" in js:
            assert isinstance(js["client_metadata"], dict), "client_metadata should be an object"


def test_get_user_info(auth_headers):
    """Test getting user profile information."""
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        r = client.get("/v1/identity/oauth2/userinfo", params={"schema": "paypalv1.1"}, headers=auth_headers)
        
        if r.status_code == 200:
            js = r.json()
            # Validate user info structure if successful
            # Note: User info may not be available for client credentials flow
            assert isinstance(js, dict), "user info should be an object"
            if "user_id" in js:
                assert isinstance(js["user_id"], str), "user_id should be a string"
            if "payer_id" in js:
                assert isinstance(js["payer_id"], str), "payer_id should be a string"
        elif r.status_code == 401:
            pytest.skip("User info requires authorization code flow; skipping with client credentials")
        elif r.status_code == 403:
            pytest.skip("User info access forbidden; may require additional scopes")
        else:
            pytest.fail(f"unexpected user info status: {r.status_code} {r.text}")


def test_get_user_info_without_schema(auth_headers):
    """Test getting user info without schema parameter."""
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        r = client.get("/v1/identity/oauth2/userinfo", headers=auth_headers)
        
        if r.status_code == 200:
            js = r.json()
            assert isinstance(js, dict), "user info should be an object"
        elif r.status_code in (401, 403):
            pytest.skip("User info requires authorization code flow or additional permissions")
        else:
            pytest.fail(f"unexpected user info status: {r.status_code} {r.text}")


def test_generate_client_token(auth_headers):
    """Test generating client token for client-side SDK."""
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        r = client.post("/v1/identity/generate-token", headers=auth_headers)
        
        if r.status_code == 200:
            js = r.json()
            assert "client_token" in js, "client_token missing from response"
            client_token = js["client_token"]
            assert isinstance(client_token, str), "client_token should be a string"
            assert len(client_token) > 10, "client_token seems too short"
        elif r.status_code in (400, 401, 403):
            pytest.skip(f"Client token generation not available (status={r.status_code}); may require specific permissions or merchant account setup")
        else:
            pytest.fail(f"unexpected client token status: {r.status_code} {r.text}")


def test_generate_client_token_with_customer_id(auth_headers):
    """Test generating client token with customer ID."""
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        # Test with a sample customer ID
        payload = {"customer_id": "TEST_CUSTOMER_123"}
        r = client.post("/v1/identity/generate-token", json=payload, headers=auth_headers)
        
        if r.status_code == 200:
            js = r.json()
            assert "client_token" in js, "client_token missing from response"
        elif r.status_code in (400, 401, 403, 422):
            pytest.skip(f"Client token with customer ID not available (status={r.status_code})")
        else:
            pytest.fail(f"unexpected client token status: {r.status_code} {r.text}")


def test_terminate_access_token():
    """Test revoking access token."""
    # Use a fresh token for this test
    token = getattr(pytest, "generated_access_token", None)
    if not token:
        if not _creds_available():
            pytest.skip("No token available and no credentials for token termination test")
        
        # Generate a token specifically for termination
        auth = httpx.BasicAuth(CLIENT_ID, CLIENT_SECRET)
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
            r = client.post(
                "/v1/oauth2/token",
                data={"grant_type": "client_credentials"},
                auth=auth,
                headers={"Accept": "application/json"},
            )
            if r.status_code != 200:
                pytest.skip("Could not generate token for termination test")
            token = r.json().get("access_token")
    
    if token:
        auth = httpx.BasicAuth(CLIENT_ID, CLIENT_SECRET)
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
            r = client.post(
                "/v1/oauth2/token/revoke",
                data={"token": token},
                auth=auth,
                headers={"Accept": "application/json"},
            )
            # Token revocation typically returns 200 or 204
            assert r.status_code in (200, 204), f"unexpected revoke status: {r.status_code} {r.text}"
            
            # Verify the token is actually revoked by trying to use it
            revoked_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            r_verify = client.get("/v1/identity/oauth2/userinfo", headers=revoked_headers)
            # Should get 401 for revoked token (may also get 403 depending on endpoint)
            assert r_verify.status_code in (401, 403), f"revoked token should not work, got: {r_verify.status_code}"


def test_invalid_credentials():
    """Test authentication with invalid credentials."""
    auth = httpx.BasicAuth("invalid_client_id", "invalid_secret")
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        r = client.post(
            "/v1/oauth2/token",
            data={"grant_type": "client_credentials"},
            auth=auth,
            headers={"Accept": "application/json"},
        )
        # Should return 401 Unauthorized for invalid credentials
        assert r.status_code == 401, f"expected 401 for invalid credentials, got: {r.status_code}"
        
        # Validate error response structure
        if r.headers.get("content-type", "").startswith("application/json"):
            js = r.json()
            assert "error" in js, "error field missing from error response"


def test_invalid_grant_type():
    """Test OAuth with invalid grant type."""
    if not _creds_available():
        pytest.skip("PayPal credentials not provided")
    
    auth = httpx.BasicAuth(CLIENT_ID, CLIENT_SECRET)
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        r = client.post(
            "/v1/oauth2/token",
            data={"grant_type": "invalid_grant_type"},
            auth=auth,
            headers={"Accept": "application/json"},
        )
        # Should return 400 Bad Request for invalid grant type
        assert r.status_code == 400, f"expected 400 for invalid grant type, got: {r.status_code}"
        
        # Validate error response
        if r.headers.get("content-type", "").startswith("application/json"):
            js = r.json()
            assert "error" in js, "error field missing from error response"
            assert js.get("error") in ["unsupported_grant_type", "invalid_request"], f"unexpected error type: {js.get('error')}"


def test_missing_grant_type():
    """Test OAuth without grant_type parameter."""
    if not _creds_available():
        pytest.skip("PayPal credentials not provided")
    
    auth = httpx.BasicAuth(CLIENT_ID, CLIENT_SECRET)
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        r = client.post(
            "/v1/oauth2/token",
            data={},  # Missing grant_type
            auth=auth,
            headers={"Accept": "application/json"},
        )
        # Should return 400 Bad Request for missing grant type
        assert r.status_code == 400, f"expected 400 for missing grant type, got: {r.status_code}"


def test_expired_token_handling():
    """Test behavior with token expiration validation."""
    # This test validates token expiry information rather than actual expiration
    # since we can't easily wait for token expiration in tests
    
    if not _creds_available():
        pytest.skip("PayPal credentials not provided")
    
    auth = httpx.BasicAuth(CLIENT_ID, CLIENT_SECRET)
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        r = client.post(
            "/v1/oauth2/token",
            data={"grant_type": "client_credentials"},
            auth=auth,
            headers={"Accept": "application/json"},
        )
        assert r.status_code == 200, f"token generation failed: {r.status_code} {r.text}"
        js = r.json()
        
        expires_in = js.get("expires_in")
        assert expires_in is not None, "expires_in missing from token response"
        assert isinstance(expires_in, int), "expires_in should be an integer"
        assert expires_in > 0, "expires_in should be positive"
        
        # Typical PayPal access tokens expire in 32400 seconds (9 hours)
        assert expires_in > 1000, "expires_in seems too short for PayPal tokens"
        assert expires_in < 50000, "expires_in seems too long for PayPal tokens"


def test_invalid_token_format():
    """Test API calls with malformed authorization tokens."""
    invalid_tokens = [
        "",                          # Empty token
        "invalid_token_format",      # Invalid format
        "Bearer invalid_token",      # Wrong prefix included
        "A" * 1000,                 # Extremely long token
        "A21AAI..short",            # Too short
    ]
    
    for invalid_token in invalid_tokens:
        headers = {"Authorization": f"Bearer {invalid_token}", "Content-Type": "application/json"}
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
            try:
                r = client.get("/v1/identity/oauth2/userinfo", headers=headers)
                # Should return 401/403 for invalid token format
                assert r.status_code in (401, 403), f"expected 401/403 for invalid token '{invalid_token[:20]}...', got: {r.status_code}"
            except httpx.LocalProtocolError:
                # httpx may raise for illegal header values (for example empty token produces 'Bearer ')
                # Treat this as an acceptable outcome for malformed tokens.
                continue


def test_missing_authorization_header():
    """Test API calls without Authorization header."""
    headers = {"Content-Type": "application/json"}  # Missing Authorization
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        r = client.get("/v1/identity/oauth2/userinfo", headers=headers)
        # Should return 401 for missing authorization
        assert r.status_code == 401, f"expected 401 for missing authorization, got: {r.status_code}"


def test_refresh_token_flow():
    """Test refresh token functionality if available."""
    # Note: Refresh tokens are typically only available with authorization_code grant type
    # This test will skip for client_credentials but demonstrates the pattern
    
    if not _creds_available():
        pytest.skip("PayPal credentials not provided")
    
    # For client_credentials flow, refresh tokens are not typically issued
    # This test documents the expected behavior for authorization_code flow
    auth = httpx.BasicAuth(CLIENT_ID, CLIENT_SECRET)
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        r = client.post(
            "/v1/oauth2/token",
            data={"grant_type": "client_credentials"},
            auth=auth,
            headers={"Accept": "application/json"},
        )
        assert r.status_code == 200
        js = r.json()
        
        # Client credentials flow typically doesn't include refresh_token
        if "refresh_token" not in js:
            pytest.skip("Refresh token not available in client credentials flow")
        else:
            # If refresh token is present, test refresh flow
            refresh_token = js["refresh_token"]
            r_refresh = client.post(
                "/v1/oauth2/token",
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token
                },
                auth=auth,
                headers={"Accept": "application/json"},
            )
            assert r_refresh.status_code == 200, f"refresh token flow failed: {r_refresh.status_code} {r_refresh.text}"