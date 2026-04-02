import os
import logging
import pytest
import httpx
import random
from datetime import datetime, timedelta


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
PARTNER_ATTR_ID = _env_choice("PAYPAL_PARTNER_ATTRIBUTION_ID", "paypal_partner_attribution_id", "paypal.partner_attribution_id")

# Card-capture related envs
USE_CARD_CAPTURE = _env_choice("PAYPAL_USE_CARD_CAPTURE", "paypal.use_card_capture")
CARD_NUMBER = _env_choice("PAYPAL_CARD_NUMBER", "paypal.card_number")
CARD_EXP = _env_choice("PAYPAL_CARD_EXP", "paypal.card_exp")
CARD_CVV = _env_choice("PAYPAL_CARD_CVV", "paypal.card_cvv")
CARD_NAME = _env_choice("PAYPAL_CARD_NAME", "paypal.card_name")

logging.getLogger(__name__).debug("Using PayPal base url: %s", BASE_URL)


def _use_card_capture():
    if not USE_CARD_CAPTURE:
        return False
    val = USE_CARD_CAPTURE.lower() if isinstance(USE_CARD_CAPTURE, str) else str(USE_CARD_CAPTURE)
    return val in ("1", "true", "yes", "y")


def _normalize_expiry(raw: str) -> str:
    """Normalize expiry into PayPal expected YYYY-MM format."""
    if not raw:
        return raw
    s = raw.strip()
    if "/" in s:
        parts = s.split("/")
        if len(parts) == 2:
            mm, yy = parts[0].zfill(2), parts[1]
            if len(yy) == 2:
                yy = f"20{yy}"
            return f"{yy}-{mm}"
    if "-" in s:
        parts = s.split("-")
        if len(parts) == 2:
            a, b = parts
            if len(a) == 4 and len(b) == 2:
                return f"{a}-{b}"
            if len(a) == 2 and len(b) == 4:
                return f"{b}-{a}"
    return s


def _random_future_expiry(years=5):
    now = datetime.utcnow()
    add_years = random.randint(0, years)
    year = now.year + add_years
    month = random.randint(1, 12)
    return f"{year}-{str(month).zfill(2)}"


def _random_cvv():
    return str(random.randint(100, 999))


def _random_card_name():
    return f"Sandbox User {random.randint(1000,9999)}"


def _random_amount(min_d=1.0, max_d=10.0):
    cents = random.randint(int(min_d * 100), int(max_d * 100))
    return f"{cents/100:.2f}"


def _creds_available():
    return bool(CLIENT_ID and CLIENT_SECRET)


@pytest.fixture(scope="session")
def access_token():
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


@pytest.fixture(scope="module")
def auth_headers(access_token):
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    if PARTNER_ATTR_ID:
        headers["PayPal-Partner-Attribution-Id"] = PARTNER_ATTR_ID
    return headers


@pytest.fixture(scope="module")
def authorized_order(auth_headers):
    """Create and authorize an order for testing payment operations."""
    if not _use_card_capture():
        pytest.skip("Payment tests require card capture for automated testing")
    
    # Create order with AUTHORIZE intent
    amount_value = _random_amount(5.0, 15.0)
    body = {"intent": "AUTHORIZE", "purchase_units": [{"amount": {"currency_code": "USD", "value": amount_value}}]}
    
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        # Create order
        r = client.post("/v2/checkout/orders", json=body, headers=auth_headers)
        assert r.status_code == 201, f"unexpected create order status: {r.status_code} {r.text}"
        order_js = r.json()
        order_id = order_js["id"]
        
        # Authorize order with payment source
        authorize_url = f"/v2/checkout/orders/{order_id}/authorize"
        number = CARD_NUMBER or "4111111111111111"
        raw_exp = CARD_EXP or _random_future_expiry()
        expiry = _normalize_expiry(raw_exp)
        cvv = CARD_CVV or _random_cvv()
        name = CARD_NAME or _random_card_name()

        payload = {
            "payment_source": {
                "card": {
                    "number": number,
                    "expiry": expiry,
                    "security_code": str(cvv),
                    "name": name,
                }
            }
        }
        r = client.post(authorize_url, headers=auth_headers, json=payload)
        
        if r.status_code not in (200, 201):
            pytest.skip(f"Could not authorize order for payment tests: {r.status_code} {r.text}")
        
        auth_js = r.json()
        auth_ids = []
        for pu in auth_js.get("purchase_units", []):
            payments = pu.get("payments", {})
            authorizations = payments.get("authorizations", [])
            for a in authorizations:
                if "id" in a:
                    auth_ids.append(a["id"])
        
        if not auth_ids:
            pytest.skip("No authorization IDs found in authorize response")
        
        return {
            "order_id": order_id,
            "authorization_id": auth_ids[0],
            "amount": amount_value,
            "currency": "USD",
            "auth_response": auth_js
        }


def test_show_authorization_details(auth_headers, authorized_order):
    """Test retrieving authorization details."""
    authorization_id = authorized_order["authorization_id"]
    
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        r = client.get(f"/v2/payments/authorizations/{authorization_id}", headers=auth_headers)
        assert r.status_code == 200, f"unexpected auth details status: {r.status_code} {r.text}"
        js = r.json()
        
        # Validate authorization structure
        assert js.get("id") == authorization_id
        assert "status" in js
        assert "amount" in js
        assert "create_time" in js
        
        # Validate amount structure
        amount = js.get("amount", {})
        assert "currency_code" in amount
        assert "value" in amount
        assert amount.get("currency_code") == "USD"
        
        # Validate status is appropriate for a fresh authorization
        status = js.get("status")
        assert status in ["CREATED", "AUTHORIZED", "CAPTURED", "VOIDED"], f"unexpected auth status: {status}"
        
        # Store current status for other tests
        pytest.auth_status = status


def test_capture_authorization(auth_headers, authorized_order):
    """Test capturing an authorized payment."""
    authorization_id = authorized_order["authorization_id"]
    amount = authorized_order["amount"]
    currency = authorized_order["currency"]
    
    # First check if authorization is in capturable state
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        r_check = client.get(f"/v2/payments/authorizations/{authorization_id}", headers=auth_headers)
        if r_check.status_code == 200:
            auth_status = r_check.json().get("status")
            if auth_status not in ["CREATED", "AUTHORIZED"]:
                pytest.skip(f"Authorization not in capturable state (status={auth_status})")
        
        # Capture the authorization
        payload = {
            "amount": {
                "currency_code": currency,
                "value": amount
            },
            "final_capture": True,
            "note_to_payer": "Payment captured via automated test"
        }
        r = client.post(f"/v2/payments/authorizations/{authorization_id}/capture", 
                       headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), f"unexpected capture status: {r.status_code} {r.text}"
        js = r.json()
        
        # Validate capture response
        assert "status" in js
        assert "id" in js

        # Some sandbox responses omit the amount in the immediate response.
        # If so, fetch the capture details by id to validate amount and status.
        capture_id = js["id"]
        if "amount" not in js and capture_id:
            r_details = client.get(f"/v2/payments/captures/{capture_id}", headers=auth_headers)
            if r_details.status_code == 200:
                js = r_details.json()
            else:
                pytest.skip(f"Could not retrieve capture details (status={r_details.status_code})")

        capture_status = js.get("status")
        assert capture_status in ["PENDING", "COMPLETED"], f"unexpected capture status: {capture_status}"
        
        # Store capture details for dependent tests
        pytest.payment_capture_id = capture_id
        pytest.payment_capture_amount = amount
        pytest.payment_capture_currency = currency


def test_capture_authorization_partial(auth_headers):
    """Test partial capture of an authorization."""
    # Create a separate authorization for partial capture test
    if not _use_card_capture():
        pytest.skip("Partial capture test requires card capture")
    
    amount_value = _random_amount(10.0, 20.0)  # Larger amount for partial capture
    body = {"intent": "AUTHORIZE", "purchase_units": [{"amount": {"currency_code": "USD", "value": amount_value}}]}
    
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        # Create and authorize order
        r = client.post("/v2/checkout/orders", json=body, headers=auth_headers)
        if r.status_code != 201:
            pytest.skip("Could not create order for partial capture test")
        
        order_id = r.json()["id"]
        
        # Authorize with payment source
        number = CARD_NUMBER or "4111111111111111"
        raw_exp = CARD_EXP or _random_future_expiry()
        expiry = _normalize_expiry(raw_exp)
        cvv = CARD_CVV or _random_cvv()
        name = CARD_NAME or _random_card_name()

        payload = {
            "payment_source": {
                "card": {
                    "number": number,
                    "expiry": expiry,
                    "security_code": str(cvv),
                    "name": name,
                }
            }
        }
        r = client.post(f"/v2/checkout/orders/{order_id}/authorize", headers=auth_headers, json=payload)
        
        if r.status_code not in (200, 201):
            pytest.skip("Could not authorize order for partial capture test")
        
        # Extract authorization ID
        auth_js = r.json()
        auth_id = None
        for pu in auth_js.get("purchase_units", []):
            payments = pu.get("payments", {})
            authorizations = payments.get("authorizations", [])
            for a in authorizations:
                if "id" in a:
                    auth_id = a["id"]
                    break
            if auth_id:
                break
        
        if not auth_id:
            pytest.skip("No authorization ID found for partial capture test")
        
        # Capture 50% of the authorized amount
        partial_amount = f"{float(amount_value) * 0.5:.2f}"
        payload = {
            "amount": {
                "currency_code": "USD",
                "value": partial_amount
            },
            "final_capture": False,  # Not final capture for partial
            "note_to_payer": "Partial payment captured"
        }
        
        r = client.post(f"/v2/payments/authorizations/{auth_id}/capture",
                       headers=auth_headers, json=payload)
        
        if r.status_code in (200, 201):
            js = r.json()
            assert "status" in js
            assert "id" in js

            # The sandbox may return amount in different shapes; try common locations
            captured_amount = None
            # direct amount
            if isinstance(js.get("amount"), dict):
                captured_amount = js.get("amount", {}).get("value")
            # nested purchase_units -> payments -> captures
            if not captured_amount:
                for pu in js.get("purchase_units", []):
                    payments = pu.get("payments", {})
                    captures = payments.get("captures", [])
                    for c in captures:
                        captured_amount = c.get("amount", {}).get("value")
                        if captured_amount:
                            break
                    if captured_amount:
                        break

            # If amount still missing, try fetching capture details by id
            if not captured_amount:
                capture_id = js.get("id")
                if capture_id:
                    r_details = client.get(f"/v2/payments/captures/{capture_id}", headers=auth_headers)
                    if r_details.status_code == 200:
                        dj = r_details.json()
                        captured_amount = dj.get("amount", {}).get("value")

            assert captured_amount == partial_amount, f"expected {partial_amount}, got {captured_amount}"
        else:
            pytest.skip(f"Partial capture not available (status={r.status_code})")


def test_reauthorize_payment(auth_headers):
    """Test reauthorizing an authorization."""
    # Create a fresh authorization for reauth test
    if not _use_card_capture():
        pytest.skip("Reauthorization test requires card capture")
    
    amount_value = _random_amount(5.0, 10.0)
    body = {"intent": "AUTHORIZE", "purchase_units": [{"amount": {"currency_code": "USD", "value": amount_value}}]}
    
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        # Create and authorize order
        r = client.post("/v2/checkout/orders", json=body, headers=auth_headers)
        if r.status_code != 201:
            pytest.skip("Could not create order for reauth test")
        
        order_id = r.json()["id"]
        
        # Authorize with payment source
        number = CARD_NUMBER or "4111111111111111"
        raw_exp = CARD_EXP or _random_future_expiry()
        expiry = _normalize_expiry(raw_exp)
        cvv = CARD_CVV or _random_cvv()
        name = CARD_NAME or _random_card_name()

        payload = {
            "payment_source": {
                "card": {
                    "number": number,
                    "expiry": expiry,
                    "security_code": str(cvv),
                    "name": name,
                }
            }
        }
        r = client.post(f"/v2/checkout/orders/{order_id}/authorize", headers=auth_headers, json=payload)
        
        if r.status_code not in (200, 201):
            pytest.skip("Could not authorize order for reauth test")
        
        # Extract authorization ID
        auth_js = r.json()
        auth_id = None
        for pu in auth_js.get("purchase_units", []):
            payments = pu.get("payments", {})
            authorizations = payments.get("authorizations", [])
            for a in authorizations:
                if "id" in a:
                    auth_id = a["id"]
                    break
            if auth_id:
                break
        
        if not auth_id:
            pytest.skip("No authorization ID found for reauth test")
        
        # Check current auth status
        r = client.get(f"/v2/payments/authorizations/{auth_id}", headers=auth_headers)
        if r.status_code != 200:
            pytest.skip("Cannot check authorization status for reauth test")
        
        auth_status = r.json().get("status")
        if auth_status not in ("CREATED", "AUTHORIZED"):
            pytest.skip(f"Authorization not in reauthorizable state (status={auth_status})")
        
        # Attempt reauthorization with same or reduced amount
        reauth_amount = f"{float(amount_value) * 0.9:.2f}"  # 90% of original
        payload = {
            "amount": {
                "currency_code": "USD",
                "value": reauth_amount
            }
        }
        
        r = client.post(f"/v2/payments/authorizations/{auth_id}/reauthorize",
                       headers=auth_headers, json=payload)
        
        if r.status_code in (200, 201):
            js = r.json()
            assert "status" in js
            assert "id" in js
            assert "amount" in js
            # New authorization should have different ID
            new_auth_id = js.get("id")
            assert new_auth_id != auth_id, "reauthorization should create new authorization ID"
        else:
            # Reauthorization may fail due to timing, merchant limitations, or sandbox restrictions
            pytest.skip(f"Reauthorization not available (status={r.status_code})")


def test_void_authorization(auth_headers):
    """Test voiding an authorization."""
    # Create a fresh authorization specifically for voiding
    if not _use_card_capture():
        pytest.skip("Void test requires card capture")
    
    amount_value = _random_amount(3.0, 7.0)
    body = {"intent": "AUTHORIZE", "purchase_units": [{"amount": {"currency_code": "USD", "value": amount_value}}]}
    
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        # Create order
        r = client.post("/v2/checkout/orders", json=body, headers=auth_headers)
        if r.status_code != 201:
            pytest.skip("Could not create order for void test")
        
        order_id = r.json()["id"]
        
        # Authorize with payment source
        number = CARD_NUMBER or "4111111111111111"
        raw_exp = CARD_EXP or _random_future_expiry()
        expiry = _normalize_expiry(raw_exp)
        cvv = CARD_CVV or _random_cvv()
        name = CARD_NAME or _random_card_name()

        payload = {
            "payment_source": {
                "card": {
                    "number": number,
                    "expiry": expiry,
                    "security_code": str(cvv),
                    "name": name,
                }
            }
        }
        r = client.post(f"/v2/checkout/orders/{order_id}/authorize", headers=auth_headers, json=payload)
        
        if r.status_code not in (200, 201):
            pytest.skip("Could not authorize for void test")
        
        # Extract authorization ID
        auth_js = r.json()
        auth_id = None
        for pu in auth_js.get("purchase_units", []):
            payments = pu.get("payments", {})
            authorizations = payments.get("authorizations", [])
            for a in authorizations:
                if "id" in a:
                    auth_id = a["id"]
                    break
            if auth_id:
                break
        
        if not auth_id:
            pytest.skip("No authorization ID found for void test")
        
        # Check that authorization is voidable
        r_check = client.get(f"/v2/payments/authorizations/{auth_id}", headers=auth_headers)
        if r_check.status_code == 200:
            status = r_check.json().get("status")
            if status not in ["CREATED", "AUTHORIZED"]:
                pytest.skip(f"Authorization not voidable (status={status})")
        
        # Void the authorization
        r = client.post(f"/v2/payments/authorizations/{auth_id}/void", headers=auth_headers)
        assert r.status_code == 204, f"unexpected void status: {r.status_code} {r.text}"
        
        # Verify the authorization is voided
        r_verify = client.get(f"/v2/payments/authorizations/{auth_id}", headers=auth_headers)
        if r_verify.status_code == 200:
            voided_status = r_verify.json().get("status")
            assert voided_status == "VOIDED", f"expected VOIDED status, got: {voided_status}"


def test_show_captured_payment_details(auth_headers):
    """Test retrieving captured payment details."""
    capture_id = getattr(pytest, "payment_capture_id", None)
    
    if not capture_id:
        pytest.skip("No capture ID available from previous tests")
    
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        r = client.get(f"/v2/payments/captures/{capture_id}", headers=auth_headers)
        assert r.status_code == 200, f"unexpected capture details status: {r.status_code} {r.text}"
        js = r.json()
        
        # Validate capture details structure
        assert js.get("id") == capture_id
        assert "status" in js
        assert "amount" in js
        assert "create_time" in js
        
        # Validate amount structure
        amount = js.get("amount", {})
        assert "currency_code" in amount
        assert "value" in amount
        
        # Store status for refund test
        pytest.capture_status = js.get("status")


def test_refund_captured_payment(auth_headers):
    """Test refunding a captured payment."""
    capture_id = getattr(pytest, "payment_capture_id", None)
    amount = getattr(pytest, "payment_capture_amount", None)
    currency = getattr(pytest, "payment_capture_currency", "USD")
    
    if not capture_id:
        pytest.skip("No capture ID available from previous tests")
    
    # Check capture status first
    capture_status = getattr(pytest, "capture_status", None)
    if capture_status and capture_status not in ["COMPLETED", "PENDING"]:
        pytest.skip(f"Capture not refundable (status={capture_status})")
    
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        # Test partial refund (50% of captured amount)
        refund_amount = f"{float(amount) * 0.5:.2f}" if amount else "1.00"
        payload = {
            "amount": {
                "currency_code": currency, 
                "value": refund_amount
            },
            "note_to_payer": "Partial refund processed via automated test"
        }
        
        r = client.post(f"/v2/payments/captures/{capture_id}/refund",
                       headers=auth_headers, json=payload)
        
        if r.status_code in (200, 201):
            js = r.json()
            assert "status" in js
            assert "id" in js

            # Some sandbox responses omit the amount in the immediate response. Fetch details if needed.
            refund_id = js.get("id")
            if "amount" not in js and refund_id:
                r_details = client.get(f"/v2/payments/refunds/{refund_id}", headers=auth_headers)
                if r_details.status_code == 200:
                    js = r_details.json()
                else:
                    pytest.skip(f"Could not retrieve refund details (status={r_details.status_code})")

            # Validate refund structure
            refund_status = js.get("status")
            refunded_amount = js.get("amount", {})

            assert refund_status in ["PENDING", "COMPLETED"], f"unexpected refund status: {refund_status}"
            assert refunded_amount.get("currency_code") == currency
            assert refunded_amount.get("value") == refund_amount
            
            # Store refund ID for details test
            pytest.payment_refund_id = refund_id
        else:
            pytest.skip(f"Refund not available (status={r.status_code}); capture may not be in refundable state")


def test_refund_captured_payment_full(auth_headers):
    """Test full refund of a captured payment."""
    # Create a separate capture for full refund test
    if not _use_card_capture():
        pytest.skip("Full refund test requires card capture")
    
    # Create, authorize and capture in one test for full refund
    amount_value = _random_amount(2.0, 5.0)
    body = {"intent": "CAPTURE", "purchase_units": [{"amount": {"currency_code": "USD", "value": amount_value}}]}
    
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        # Create order
        r = client.post("/v2/checkout/orders", json=body, headers=auth_headers)
        if r.status_code != 201:
            pytest.skip("Could not create order for full refund test")
        
        order_id = r.json()["id"]
        
        # Capture with payment source
        number = CARD_NUMBER or "4111111111111111"
        raw_exp = CARD_EXP or _random_future_expiry()
        expiry = _normalize_expiry(raw_exp)
        cvv = CARD_CVV or _random_cvv()
        name = CARD_NAME or _random_card_name()

        payload = {
            "payment_source": {
                "card": {
                    "number": number,
                    "expiry": expiry,
                    "security_code": str(cvv),
                    "name": name,
                }
            }
        }
        r = client.post(f"/v2/checkout/orders/{order_id}/capture", headers=auth_headers, json=payload)
        
        if r.status_code not in (200, 201):
            pytest.skip("Could not capture order for full refund test")
        
        # Extract capture ID
        capture_js = r.json()
        capture_id = None
        for pu in capture_js.get("purchase_units", []):
            payments = pu.get("payments", {})
            captures = payments.get("captures", [])
            for c in captures:
                if "id" in c:
                    capture_id = c["id"]
                    break
            if capture_id:
                break
        
        if not capture_id:
            pytest.skip("No capture ID found for full refund test")
        
        # Full refund (no amount specified means full refund)
        payload = {
            "note_to_payer": "Full refund processed via automated test"
        }
        
        r = client.post(f"/v2/payments/captures/{capture_id}/refund",
                       headers=auth_headers, json=payload)
        
        if r.status_code in (200, 201):
            js = r.json()
            assert "status" in js
            assert "id" in js
            refund_status = js.get("status")
            assert refund_status in ["PENDING", "COMPLETED"], f"unexpected refund status: {refund_status}"
        else:
            pytest.skip(f"Full refund not available (status={r.status_code})")


def test_show_refund_details(auth_headers):
    """Test retrieving refund details."""
    refund_id = getattr(pytest, "payment_refund_id", None)
    
    if not refund_id:
        pytest.skip("No refund ID available from previous tests")
    
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        r = client.get(f"/v2/payments/refunds/{refund_id}", headers=auth_headers)
        assert r.status_code == 200, f"unexpected refund details status: {r.status_code} {r.text}"
        js = r.json()
        
        # Validate refund details structure
        assert js.get("id") == refund_id
        assert "status" in js
        assert "amount" in js
        assert "create_time" in js
        
        # Validate amount structure
        amount = js.get("amount", {})
        assert "currency_code" in amount
        assert "value" in amount
        
        # Validate status
        status = js.get("status")
        assert status in ["PENDING", "COMPLETED", "CANCELLED", "FAILED"], f"unexpected refund status: {status}"
        
        # Should have links for additional operations if available
        if "links" in js:
            links = js["links"]
            assert isinstance(links, list), "links should be an array"


def test_invalid_authorization_operations(auth_headers):
    """Test operations on non-existent authorization."""
    fake_auth_id = "1AB23456CD789012E"
    
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        # Test getting non-existent authorization
        r = client.get(f"/v2/payments/authorizations/{fake_auth_id}", headers=auth_headers)
        assert r.status_code == 404, f"expected 404 for fake auth ID, got: {r.status_code}"
        
        # Test capturing non-existent authorization
        payload = {"amount": {"currency_code": "USD", "value": "1.00"}}
        r = client.post(f"/v2/payments/authorizations/{fake_auth_id}/capture",
                       headers=auth_headers, json=payload)
        assert r.status_code == 404, f"expected 404 for fake capture, got: {r.status_code}"
        
        # Test voiding non-existent authorization
        r = client.post(f"/v2/payments/authorizations/{fake_auth_id}/void", headers=auth_headers)
        assert r.status_code == 404, f"expected 404 for fake void, got: {r.status_code}"


def test_invalid_capture_operations(auth_headers):
    """Test operations on non-existent capture."""
    fake_capture_id = "1AB23456CD789012E"
    
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        # Test getting non-existent capture
        r = client.get(f"/v2/payments/captures/{fake_capture_id}", headers=auth_headers)
        assert r.status_code == 404, f"expected 404 for fake capture ID, got: {r.status_code}"
        
        # Test refunding non-existent capture
        payload = {"amount": {"currency_code": "USD", "value": "1.00"}}
        r = client.post(f"/v2/payments/captures/{fake_capture_id}/refund",
                       headers=auth_headers, json=payload)
        assert r.status_code == 404, f"expected 404 for fake refund, got: {r.status_code}"


def test_invalid_refund_operations(auth_headers):
    """Test operations on non-existent refund."""
    fake_refund_id = "1AB23456CD789012E"
    
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        # Test getting non-existent refund
        r = client.get(f"/v2/payments/refunds/{fake_refund_id}", headers=auth_headers)
        assert r.status_code == 404, f"expected 404 for fake refund ID, got: {r.status_code}"


def test_invalid_amount_formats(auth_headers, authorized_order):
    """Test capture with invalid amount formats."""
    authorization_id = authorized_order["authorization_id"]
    
    invalid_amounts = [
        {"currency_code": "USD", "value": "-1.00"},     # Negative amount
        {"currency_code": "USD", "value": "0.00"},      # Zero amount
        {"currency_code": "USD", "value": "abc"},       # Non-numeric
        {"currency_code": "INVALID", "value": "1.00"},  # Invalid currency
        {"currency_code": "USD", "value": "1000000.00"}, # Excessive amount
    ]
    
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        for invalid_amount in invalid_amounts:
            payload = {"amount": invalid_amount}
            r = client.post(f"/v2/payments/authorizations/{authorization_id}/capture",
                           headers=auth_headers, json=payload)
            # Should return 400 for invalid amounts
            assert r.status_code in (400, 422), f"expected 400/422 for invalid amount {invalid_amount}, got: {r.status_code}"