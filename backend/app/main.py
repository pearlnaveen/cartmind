
import json
import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from decimal import Decimal

import requests

from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.payments import create_paypal_order, capture_paypal_order
from app.products import PRODUCTS
from app.ai_service import recommend_products


# ----------------------------------
# APP CONFIGURATION
# ----------------------------------

app = FastAPI(
    title="CartMind AI",
    description="AI-powered shopping assistant using local Ollama",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# ----------------------------------
# DATABASE CONFIGURATION
# ----------------------------------

DB_PATH = Path(__file__).resolve().parent.parent / "cartmind.db"


def get_timestamp():
    return datetime.now(timezone.utc).isoformat()


def init_db():
    connection = sqlite3.connect(DB_PATH)

    try:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                paypal_order_id TEXT PRIMARY KEY,
                amount TEXT NOT NULL,
                currency TEXT NOT NULL,
                status TEXT NOT NULL,
                items_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        connection.commit()

    finally:
        connection.close()


def save_order(order_id, amount, currency, items):
    connection = sqlite3.connect(DB_PATH)

    try:
        timestamp = get_timestamp()

        connection.execute("""
            INSERT INTO orders (
                paypal_order_id,
                amount,
                currency,
                status,
                items_json,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            order_id,
            amount,
            currency,
            "CREATED",
            json.dumps(items),
            timestamp,
            timestamp
        ))

        connection.commit()

    finally:
        connection.close()


def update_order_status(order_id, status):
    connection = sqlite3.connect(DB_PATH)

    try:
        cursor = connection.execute("""
            UPDATE orders
            SET status = ?, updated_at = ?
            WHERE paypal_order_id = ?
        """, (status, get_timestamp(), order_id))

        connection.commit()
        return cursor.rowcount > 0

    finally:
        connection.close()


def get_order_from_db(order_id):
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row

    try:
        row = connection.execute("""
            SELECT * FROM orders
            WHERE paypal_order_id = ?
        """, (order_id,)).fetchone()

        if not row:
            return None

        order = dict(row)
        order["items"] = json.loads(order.pop("items_json"))

        return order

    finally:
        connection.close()


def get_all_orders(limit):
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row

    try:
        rows = connection.execute("""
            SELECT * FROM orders
            ORDER BY created_at DESC
            LIMIT ?
        """, (limit,)).fetchall()

        orders = []

        for row in rows:
            order = dict(row)
            order["items"] = json.loads(order.pop("items_json"))
            orders.append(order)

        return orders

    finally:
        connection.close()


# Create database and table when the app starts.
init_db()


# ----------------------------------
# REQUEST MODELS
# ----------------------------------

class ShoppingRequest(BaseModel):
    query: str = Field(min_length=3, max_length=2000)


class CompareRequest(BaseModel):
    product_ids: list[str] = Field(min_length=2, max_length=3)


class BudgetRequest(BaseModel):
    budget: float = Field(gt=0)
    category: str | None = None


class CheckoutItem(BaseModel):
    product_id: str
    quantity: int = Field(ge=1, le=10)


class CheckoutRequest(BaseModel):
    items: list[CheckoutItem] = Field(min_length=1)


# ----------------------------------
# BASIC ROUTES
# ----------------------------------

@app.get("/")
def home():
    return {
        "message": "Welcome to CartMind AI",
        "status": "running"
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "ai_engine": "Ollama",
        "model": "llama3.2:latest",
        "database": "SQLite"
    }


@app.get("/api/products")
def get_products():
    return PRODUCTS


@app.get("/api/products/{product_id}")
def get_product(product_id: str):
    for product in PRODUCTS:
        if product["id"] == product_id:
            return product

    raise HTTPException(
        status_code=404,
        detail="Product not found"
    )


# ----------------------------------
# AI RECOMMENDATIONS
# ----------------------------------

@app.post("/api/recommend")
def recommend(
    request: ShoppingRequest,
    session_id: str = Header(default="default")
):
    return recommend_products(
        request.query,
        PRODUCTS,
        session_id
    )


# ----------------------------------
# PRODUCT COMPARISON
# ----------------------------------

@app.post("/api/compare")
def compare_products(request: CompareRequest):
    selected = [
        product for product in PRODUCTS
        if product["id"] in request.product_ids
    ]

    if len(selected) != len(set(request.product_ids)):
        raise HTTPException(
            status_code=404,
            detail="One or more products were not found"
        )

    return {
        "count": len(selected),
        "products": selected
    }


# ----------------------------------
# BUDGET OPTIMIZER
# ----------------------------------

@app.post("/api/budget")
def optimize_budget(request: BudgetRequest):

    matching_products = [
        product for product in PRODUCTS
        if product["price"] <= request.budget
        and (
            not request.category
            or product["category"].lower() == request.category.lower()
        )
    ]

    matching_products.sort(key=lambda p: p["price"])

    return {
        "budget": request.budget,
        "count": len(matching_products),
        "products": matching_products,
        "message": (
            f"Found {len(matching_products)} products within your budget."
            if matching_products
            else "No products found within your budget."
        )
    }


# ----------------------------------
# PAYPAL CREATE ORDER
# ----------------------------------

@app.post("/api/payments/create-order")
def create_order(request: CheckoutRequest):

    try:
        total = Decimal("0.00")
        order_items = []

        for item in request.items:

            product = next(
                (p for p in PRODUCTS if p["id"] == item.product_id),
                None
            )

            if not product:
                raise HTTPException(
                    status_code=404,
                    detail=f"Product not found: {item.product_id}"
                )

            unit_price = Decimal(str(product["price"]))
            line_total = unit_price * item.quantity

            total += line_total

            order_items.append({
                "product_id": product["id"],
                "name": product["name"],
                "unit_price": str(unit_price),
                "quantity": item.quantity,
                "line_total": str(line_total)
            })

        total = total.quantize(Decimal("0.01"))

        order = create_paypal_order(str(total))

        approval_url = next(
            (
                link["href"]
                for link in order.get("links", [])
                if link.get("rel") in ("approve", "payer-action")
            ),
            None
        )

        if not approval_url:
            raise HTTPException(
                status_code=502,
                detail="PayPal did not return an approval URL"
            )

        # Save the order in SQLite.
        save_order(
            order["id"],
            str(total),
            "USD",
            order_items
        )

        return {
            "order_id": order["id"],
            "approval_url": approval_url,
            "amount": str(total),
            "currency": "USD",
            "status": "CREATED"
        }

    except HTTPException:
        raise

    except requests.exceptions.RequestException as error:
        raise HTTPException(
            status_code=502,
            detail=f"PayPal request failed: {str(error)}"
        )

    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error))


# ----------------------------------
# PAYPAL CAPTURE ORDER
# ----------------------------------

@app.post("/api/payments/capture-order/{order_id}")
def capture_order(order_id: str):

    try:
        result = capture_paypal_order(order_id)

        status = result.get("status", "UNKNOWN")

        # Update SQLite only if the order exists.
        if status == "COMPLETED":
            update_order_status(order_id, "COMPLETED")

        return {
            "order_id": result.get("id"),
            "status": status,
            "message": (
                "Payment completed successfully."
                if status == "COMPLETED"
                else "PayPal returned a non-completed payment status."
            )
        }

    except requests.exceptions.RequestException as error:
        raise HTTPException(
            status_code=502,
            detail=f"PayPal capture failed: {str(error)}"
        )

    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error))


# ----------------------------------
# ORDER HISTORY
# ----------------------------------

@app.get("/api/orders")
def order_history(
    limit: int = Query(default=20, ge=1, le=100)
):
    orders = get_all_orders(limit)

    return {
        "count": len(orders),
        "orders": orders
    }


# ----------------------------------
# SINGLE ORDER DETAILS
# ----------------------------------

@app.get("/api/orders/{order_id}")
def order_details(order_id: str):

    order = get_order_from_db(order_id)

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    return order
