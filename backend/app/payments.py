
import os
import requests
from dotenv import load_dotenv

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

PAYPAL_CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID")
PAYPAL_CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET")
PAYPAL_BASE_URL = os.getenv(
    "PAYPAL_BASE_URL",
    "https://api-m.sandbox.paypal.com"
)


def get_paypal_access_token():
    if not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET:
        raise RuntimeError("PayPal credentials are missing from backend/.env")

    response = requests.post(
        f"{PAYPAL_BASE_URL}/v1/oauth2/token",
        auth=(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET),
        headers={"Accept": "application/json"},
        data={"grant_type": "client_credentials"},
        timeout=30
    )
    response.raise_for_status()
    return response.json()["access_token"]


def create_paypal_order(amount: str):
    token = get_paypal_access_token()

    response = requests.post(
        f"{PAYPAL_BASE_URL}/v2/checkout/orders",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        json={
            "intent": "CAPTURE",
            "purchase_units": [{
                "amount": {
                    "currency_code": "USD",
                    "value": amount
                }
            }],
            "payment_source": {
                "paypal": {
                    "experience_context": {
                        "brand_name": "CartMind AI",
                        "user_action": "PAY_NOW",
                        "return_url": "http://localhost:5173/?payment=success",
                        "cancel_url": "http://localhost:5173/?payment=cancel"
                    }
                }
            }
        },
        timeout=30
    )
    response.raise_for_status()
    return response.json()


def capture_paypal_order(order_id: str):
    token = get_paypal_access_token()

    response = requests.post(
        f"{PAYPAL_BASE_URL}/v2/checkout/orders/{order_id}/capture",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        json={},
        timeout=30
    )
    response.raise_for_status()
    return response.json()
