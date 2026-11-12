
import json
import requests

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "llama3.2:latest"

# Temporary in-memory conversation storage
conversations = {}


def recommend_products(query: str, products: list, session_id="default"):

    history = conversations.get(session_id, [])

    catalog = json.dumps(products, indent=2)

    system_prompt = f"""
You are CartMind, an intelligent AI shopping assistant.

Available products:
{catalog}

Rules:
- Recommend only products from the catalog.
- Never invent products or prices.
- Remember the user's previous preferences.
- Respect their budget and requirements.
- Return at most three recommendations.
- If no product matches, explain why.

Return valid JSON:
{{
  "mode": "ollama",
  "message": "Friendly response",
  "recommendations": [
    {{
      "product_id": "laptop-001",
      "reason": "Reason for recommendation",
      "pros": ["Advantage"],
      "cons": ["Disadvantage"],
      "score": 90
    }}
  ]
}}
"""

    messages = [
        {"role": "system", "content": system_prompt}
    ]

    messages.extend(history[-8:])

    messages.append({
        "role": "user",
        "content": query
    })

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL,
                "messages": messages,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.2}
            },
            timeout=180
        )

        response.raise_for_status()

        result = response.json()
        content = result["message"]["content"]
        ai_result = json.loads(content)

        product_lookup = {
            p["id"]: p for p in products
        }

        recommendations = []

        for item in ai_result.get("recommendations", []):
            product = product_lookup.get(item.get("product_id"))

            if product:
                recommendations.append({
                    "product": product,
                    "reason": item.get("reason", ""),
                    "pros": item.get("pros", []),
                    "cons": item.get("cons", []),
                    "score": max(
                        0,
                        min(100, int(item.get("score", 70)))
                    )
                })

        # Store conversation after a successful response
        conversations[session_id] = (
            history + [
                {"role": "user", "content": query},
                {"role": "assistant", "content": content}
            ]
        )[-10:]

        return {
            "mode": "ollama",
            "message": ai_result.get("message", ""),
            "recommendations": recommendations
        }

    except requests.exceptions.RequestException as error:
        return {
            "mode": "error",
            "message": f"Ollama connection error: {error}",
            "recommendations": []
        }

    except (ValueError, KeyError, TypeError) as error:
        return {
            "mode": "error",
            "message": f"Invalid AI response: {error}",
            "recommendations": []
        }
