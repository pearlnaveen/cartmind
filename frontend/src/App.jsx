
import { useEffect, useState } from "react";
import axios from "axios";
import {
  Search,
  ShoppingBag,
  Sparkles,
  Bot,
  ArrowRight,
  LoaderCircle,
  Cpu,
  Battery,
  ShoppingCart,
  GitCompareArrows,
  Wallet,
  X,
  PackageCheck,
  History,
  CheckCircle2,
  ArrowLeft
} from "lucide-react";

import "./App.css";

const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function App() {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [recommendations, setRecommendations] = useState([]);

  const [message, setMessage] = useState(
    "Hi! I'm CartMind. Tell me what you're looking for, and I'll help you find the right product."
  );

  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("");
  const [error, setError] = useState("");

  const [cart, setCart] = useState(() => {
    try {
      const savedCart = sessionStorage.getItem("cartmind_checkout_cart");
      return savedCart ? JSON.parse(savedCart) : [];
    } catch {
      return [];
    }
  });
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [activePage, setActivePage] = useState("shop");
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");

  // Comparison
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // Budget optimizer
  const [budget, setBudget] = useState("900");
  const [category, setCategory] = useState("Laptop");
  const [budgetResults, setBudgetResults] = useState(null);
  const [budgetLoading, setBudgetLoading] = useState(false);

  useEffect(() => {
    axios.get(`${API}/api/products`)
      .then((response) => setProducts(response.data))
      .catch(() => setError("Could not connect to the backend."));
  }, []);

  // Handle the buyer's return from PayPal and capture the approved order.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment");
    const orderId = params.get("token");

    const cleanPaymentQuery = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      url.searchParams.delete("token");
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    };

    if (paymentStatus === "cancel") {
      try {
        const savedCart = sessionStorage.getItem("cartmind_checkout_cart");
        if (savedCart) setCart(JSON.parse(savedCart));
      } catch {
        // Keep the current cart if the saved checkout cart cannot be restored.
      }
      sessionStorage.removeItem("cartmind_checkout_cart");
      setPaymentMessage("Payment was cancelled. Your cart is still available.");
      cleanPaymentQuery();
      return;
    }

    if (paymentStatus !== "success") return;

    if (!orderId) {
      setPaymentError("PayPal returned without an order ID. Please contact support before retrying.");
      cleanPaymentQuery();
      return;
    }

    let cancelled = false;

    const capturePayment = async () => {
      setPaymentLoading(true);
      setPaymentError("");
      setPaymentMessage("Payment approved. Confirming your payment with PayPal...");

      try {
        const response = await axios.post(
          `${API}/api/payments/capture-order/${encodeURIComponent(orderId)}`
        );

        if (cancelled) return;

        if (response.data.status === "COMPLETED") {
          setCart([]);
          sessionStorage.removeItem("cartmind_checkout_cart");

          let savedOrder = {
            paypal_order_id: response.data.order_id || orderId,
            status: "COMPLETED"
          };

          try {
            const orderResponse = await axios.get(
              `${API}/api/orders/${encodeURIComponent(orderId)}`
            );
            savedOrder = orderResponse.data;
          } catch {
            // Keep a basic confirmation if order-history retrieval temporarily fails.
          }

          if (cancelled) return;
          setConfirmedOrder(savedOrder);
          setPaymentMessage("Payment completed successfully! Your CartMind order is confirmed.");
          setActivePage("confirmation");
        } else {
          setPaymentMessage("");
          setPaymentError(
            response.data.message || "PayPal has not confirmed the payment yet."
          );
        }
      } catch (err) {
        if (cancelled) return;
        setPaymentMessage("");
        setPaymentError(
          err.response?.data?.detail ||
          "We couldn't confirm the payment. Please check the PayPal order status before trying again."
        );
      } finally {
        if (!cancelled) {
          setPaymentLoading(false);
          cleanPaymentQuery();
        }
      }
    };

    capturePayment();

    return () => {
      cancelled = true;
    };
  }, []);

  // AI product recommendations
  const searchProducts = async (searchQuery = query) => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError("");
    setRecommendations([]);
    setQuery(searchQuery);

    try {
      const response = await axios.post(
  `${API}/api/recommend`,
  { query: searchQuery },
  {
    headers: {
      session_id: "cartmind-user-1"
    }
  }
);

      setMessage(response.data.message);
      setRecommendations(response.data.recommendations || []);
      setMode(response.data.mode);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Something went wrong. Check your backend."
      );
    } finally {
      setLoading(false);
    }
  };

  // Create a PayPal Sandbox order using the backend-calculated cart total.
  const checkoutWithPayPal = async () => {
    if (cart.length === 0 || paymentLoading) return;

    setPaymentLoading(true);
    setPaymentError("");
    setPaymentMessage("");

    try {
      sessionStorage.setItem("cartmind_checkout_cart", JSON.stringify(cart));

      const response = await axios.post(`${API}/api/payments/create-order`, {
        items: cart.map((item) => ({
          product_id: item.id,
          quantity: item.quantity
        }))
      });

      if (!response.data.approval_url) {
        throw new Error("PayPal did not return an approval URL.");
      }

      window.location.assign(response.data.approval_url);
    } catch (err) {
      sessionStorage.removeItem("cartmind_checkout_cart");
      setPaymentError(
        err.response?.data?.detail ||
        err.message ||
        "Unable to start PayPal checkout. Please try again."
      );
      setPaymentLoading(false);
    }
  };

  // Add product to cart
  const addToCart = (product) => {
    setCart((current) => {
      const existing = current.find(
        (item) => item.id === product.id
      );

      if (existing) {
        return current.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...current, { ...product, quantity: 1 }];
    });
  };

  // Select products for comparison
  const toggleCompare = (productId) => {
    setSelectedProducts((current) => {
      if (current.includes(productId)) {
        return current.filter((id) => id !== productId);
      }

      if (current.length >= 3) {
        setError("You can compare a maximum of 3 products.");
        return current;
      }

      setError("");
      return [...current, productId];
    });
  };

  // Compare selected products
  const compareProducts = async () => {
    if (selectedProducts.length < 2) {
      setError("Select at least 2 products to compare.");
      return;
    }

    setCompareLoading(true);
    setError("");
    setComparison(null);

    try {
      const response = await axios.post(
        `${API}/api/compare`,
        { product_ids: selectedProducts }
      );

      setComparison(response.data);
      document.getElementById("comparison")?.scrollIntoView({
        behavior: "smooth"
      });
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to compare products."
      );
    } finally {
      setCompareLoading(false);
    }
  };

  // Budget optimization
  const optimizeBudget = async (event) => {
    event.preventDefault();

    if (!budget || Number(budget) <= 0) {
      setError("Enter a valid budget.");
      return;
    }

    setBudgetLoading(true);
    setError("");
    setBudgetResults(null);

    try {
      const response = await axios.post(
        `${API}/api/budget`,
        {
          budget: Number(budget),
          category: category || null
        }
      );

      setBudgetResults(response.data);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Budget optimization failed."
      );
    } finally {
      setBudgetLoading(false);
    }
  };

  const openOrderHistory = async () => {
    setActivePage("history");
    setOrdersLoading(true);
    setOrdersError("");

    try {
      const response = await axios.get(`${API}/api/orders`);
      setOrders(response.data.orders || []);
    } catch (err) {
      setOrdersError(
        err.response?.data?.detail ||
        "Unable to load payment history. Please check that the backend is running."
      );
    } finally {
      setOrdersLoading(false);
    }
  };

  const openOrderDetails = async (orderId) => {
    setOrdersLoading(true);
    setOrdersError("");

    try {
      const response = await axios.get(
        `${API}/api/orders/${encodeURIComponent(orderId)}`
      );
      setConfirmedOrder(response.data);
      setActivePage("confirmation");
    } catch (err) {
      setOrdersError(
        err.response?.data?.detail || "Unable to load this order."
      );
    } finally {
      setOrdersLoading(false);
    }
  };

  const formatOrderDate = (value) => {
    if (!value) return "Date unavailable";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  };

  const cartCount = cart.reduce(
    (total, item) => total + item.quantity,
    0
  );

  const cartTotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  return (
    <div className="app">

      {/* NAVBAR */}
      <header className="navbar">
        <div className="brand">
          <div className="brand-icon">
            <ShoppingBag size={22} />
          </div>
          <span>CartMind<span className="brand-ai"> AI</span></span>
        </div>

        <nav>
          <a href="#home">Home</a>
          <a href="#assistant">AI Shopping</a>
          <a href="#budget">Budget</a>
          <a href="#catalog" onClick={() => setActivePage("shop")}>Products</a>
          <button
            type="button"
            className="small-button"
            onClick={openOrderHistory}
            style={{ marginLeft: "12px" }}
          >
            <History size={15} /> Payment history
          </button>
        </nav>

        <div className="cart-indicator">
          <ShoppingCart size={19} />
          <span>{cartCount}</span>
        </div>
      </header>

      <main>
        {activePage === "shop" && (
        <>

        {/* HERO */}
        <section className="hero" id="home">
          <div className="hero-content">
            <div className="eyebrow">
              <Sparkles size={15} />
              INTELLIGENT AI SHOPPING
            </div>

            <h1>
              Shopping smarter
              <br />
              starts with <span>AI.</span>
            </h1>

            <p>
              Tell CartMind what you need. Our AI agent
              researches, compares and recommends the
              products that actually fit your needs.
            </p>

            <a href="#assistant" className="primary-button">
              Start shopping <ArrowRight size={17} />
            </a>
          </div>

          <div className="hero-visual">
            <div className="floating-card">
              <div className="floating-icon">
                <Bot size={25} />
              </div>
              <div>
                <strong>Your AI shopping agent</strong>
                <p>Powered by local Llama 3.2</p>
              </div>
              <span className="online-dot" />
            </div>

            <div className="hero-circle">
              <ShoppingBag size={90} strokeWidth={1.1} />
              <Sparkles className="hero-sparkle" size={34} />
            </div>

            <div className="floating-price">
              <span>SMARTER DECISIONS</span>
              <strong>Better value. Less effort.</strong>
            </div>
          </div>
        </section>

        {/* AI ASSISTANT */}
        <section className="assistant-section" id="assistant">
          <div className="section-heading">
            <div className="eyebrow">
              <Sparkles size={15} /> AI ASSISTANT
            </div>
            <h2>What are you looking for?</h2>
            <p>Describe your requirements naturally.</p>
          </div>

          <div className="assistant-box">

            <div className="assistant-header">
              <div className="assistant-avatar">
                <Bot size={23} />
              </div>
              <div>
                <strong>CartMind Assistant</strong>
                <p>Local Ollama · Llama 3.2</p>
              </div>
              <span className="status">ONLINE</span>
            </div>

            <div className="chat-content">

              <div className="bot-message">
                <Bot size={17} />
                <p>{message}</p>
              </div>

              {loading && (
                <div className="loading-message">
                  <LoaderCircle className="spin" size={20} />
                  Analyzing your requirements and products...
                </div>
              )}

              {error && (
                <div className="error-message">{error}</div>
              )}

              {recommendations.map((item) => (
                <div className="recommendation" key={item.product.id}>
                  <div className="recommendation-top">
                    <span>AI MATCH</span>
                    <strong>{item.score}/100</strong>
                  </div>

                  <h3>{item.product.name}</h3>

                  <div className="product-specs">
                    {Object.entries(
                      item.product.specs ||
                      item.product.specifications ||
                      {}
                    )
                      .slice(0, 4)
                      .map(([key, value]) => (
                        <span key={key}>
                          {key}: {value}
                        </span>
                      ))}
                  </div>

                  <p>{item.reason}</p>

                  <div className="product-bottom">
                    <strong>
                      {item.product.currency} {item.product.price}
                    </strong>

                    <button
                      className="small-button"
                      onClick={() => addToCart(item.product)}
                    >
                      Add to cart <ShoppingCart size={15} />
                    </button>
                  </div>

                  {item.pros?.length > 0 && (
                    <p className="pros">
                      <strong>Advantages:</strong> {item.pros.join(", ")}
                    </p>
                  )}

                  {item.cons?.length > 0 && (
                    <p className="cons">
                      <strong>Trade-offs:</strong> {item.cons.join(", ")}
                    </p>
                  )}
                </div>
              ))}

              {mode && (
                <div className="mode-label">
                  {mode === "ollama"
                    ? "Powered by local Ollama · Llama 3.2"
                    : mode}
                </div>
              )}
            </div>

            <div className="suggestions">
              <button onClick={() =>
                searchProducts(
                  "Find a laptop for programming with 16GB RAM under $900"
                )
              }>
                <Cpu size={14} /> Laptop for programming
              </button>

              <button onClick={() =>
                searchProducts(
                  "Find a laptop with good battery life under $800"
                )
              }>
                <Battery size={14} /> Long battery life
              </button>

              <button onClick={() =>
                document.getElementById("catalog")?.scrollIntoView({
                  behavior: "smooth"
                })
              }>
                <GitCompareArrows size={14} /> Compare products
              </button>
            </div>

            <form
              className="search-form"
              onSubmit={(event) => {
                event.preventDefault();
                searchProducts();
              }}
            >
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Example: Find me a laptop under $900..."
              />

              <button type="submit" disabled={loading}>
                {loading
                  ? <LoaderCircle className="spin" />
                  : <Search size={19} />}
                <span>Search</span>
              </button>
            </form>
          </div>
        </section>

        {/* BUDGET OPTIMIZER */}
        <section className="assistant-section" id="budget">
          <div className="section-heading">
            <div className="eyebrow">
              <Wallet size={15} /> SMART BUDGET OPTIMIZER
            </div>

            <h2>Shop within your budget</h2>
            <p>Find products that match your spending limit.</p>
          </div>

          <div className="assistant-box">
            <form onSubmit={optimizeBudget} className="search-form">
              <input
                type="number"
                min="1"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="Enter your budget"
              />

              <button type="submit" disabled={budgetLoading}>
                {budgetLoading
                  ? <LoaderCircle className="spin" />
                  : <Search size={19} />}
                <span>Optimize</span>
              </button>
            </form>

            <div style={{ padding: "15px 20px" }}>
              <label htmlFor="category">Product category</label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "12px",
                  marginTop: "8px",
                  borderRadius: "8px"
                }}
              >
                <option value="">All categories</option>
                <option value="Laptop">Laptop</option>
                <option value="Mouse">Mouse</option>
                <option value="Headphones">Headphones</option>
              </select>
            </div>

            {budgetResults && (
              <div style={{ padding: "20px" }}>
                <h3>{budgetResults.message}</h3>

                <p>
                  Budget: USD {budgetResults.budget}
                </p>

                {budgetResults.products.map((product) => (
                  <div
                    className="recommendation"
                    key={product.id}
                  >
                    <h3>{product.name}</h3>
                    <p>{product.description}</p>

                    <div className="product-bottom">
                      <strong>
                        {product.currency} {product.price}
                      </strong>

                      <button
                        className="small-button"
                        onClick={() => addToCart(product)}
                      >
                        Add to cart
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* PRODUCT CATALOG */}
        <section className="catalog-section" id="catalog">
          <div className="catalog-heading">
            <div>
              <div className="eyebrow">DISCOVER</div>
              <h2>Explore our catalog</h2>
            </div>
            <span>{products.length} demo products</span>
          </div>

          <p>Select 2 or 3 products to compare them.</p>

          <div className="catalog-grid">
            {products.map((product) => (
              <div className="catalog-card" key={product.id}>
                <div className="catalog-icon">
                  <ShoppingBag size={32} />
                </div>

                <span className="category">
                  {product.category}
                </span>

                <h3>{product.name}</h3>

                <p>{product.description}</p>

                <div className="catalog-price">
                  {product.currency} {product.price}
                </div>

                <button onClick={() => addToCart(product)}>
                  Add to cart <ArrowRight size={15} />
                </button>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "12px",
                    cursor: "pointer"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedProducts.includes(product.id)}
                    onChange={() => toggleCompare(product.id)}
                  />
                  Compare this product
                </label>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "25px", textAlign: "center" }}>
            <p>
              {selectedProducts.length} products selected
            </p>

            <button
              className="primary-button"
              onClick={compareProducts}
              disabled={
                selectedProducts.length < 2 || compareLoading
              }
            >
              {compareLoading
                ? <LoaderCircle className="spin" />
                : <GitCompareArrows size={17} />}
              Compare selected products
            </button>
          </div>
        </section>

        {/* COMPARISON RESULTS */}
        {comparison && (
          <section
            className="assistant-section"
            id="comparison"
          >
            <div className="section-heading">
              <div className="eyebrow">
                <GitCompareArrows size={15} /> PRODUCT COMPARISON
              </div>

              <h2>Compare your products</h2>
              <p>Review prices and specifications side by side.</p>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: "500px"
                }}
              >
                <thead>
                  <tr>
                    <th style={{ padding: "12px", textAlign: "left" }}>
                      Specification
                    </th>

                    {comparison.products.map((product) => (
                      <th
                        key={product.id}
                        style={{ padding: "12px", textAlign: "left" }}
                      >
                        {product.name}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td style={{ padding: "12px" }}>Price</td>
                    {comparison.products.map((product) => (
                      <td key={product.id} style={{ padding: "12px" }}>
                        {product.currency} {product.price}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td style={{ padding: "12px" }}>Brand</td>
                    {comparison.products.map((product) => (
                      <td key={product.id} style={{ padding: "12px" }}>
                        {product.brand}
                      </td>
                    ))}
                  </tr>

                  {[
                    ...new Set(
                      comparison.products.flatMap((product) =>
                        Object.keys(
                          product.specs ||
                          product.specifications ||
                          {}
                        )
                      )
                    )
                  ].map((spec) => (
                    <tr key={spec}>
                      <td style={{ padding: "12px" }}>
                        {spec}
                      </td>

                      {comparison.products.map((product) => {
                        const specs =
                          product.specs ||
                          product.specifications ||
                          {};

                        return (
                          <td
                            key={product.id}
                            style={{ padding: "12px" }}
                          >
                            {specs[spec] ?? "Not specified"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ textAlign: "center", margin: "20px" }}>
              <button
                className="small-button"
                onClick={() => {
                  setComparison(null);
                  setSelectedProducts([]);
                }}
              >
                <X size={15} /> Clear comparison
              </button>
            </div>
          </section>
        )}

        {/* CART */}
        <section className="cart-section">
          <h2>Your shopping cart</h2>

          {paymentMessage && (
            <div className="mode-label" role="status" style={{ marginBottom: "15px" }}>
              {paymentMessage}
            </div>
          )}

          {paymentError && (
            <div className="error-message" role="alert" style={{ marginBottom: "15px" }}>
              {paymentError}
            </div>
          )}

          {cart.length === 0 ? (
            <p>Your cart is empty. Start exploring products!</p>
          ) : (
            <>
              {cart.map((item) => (
                <div className="cart-row" key={item.id}>
                  <span>
                    {item.name} × {item.quantity}
                  </span>

                  <strong>
                    {item.currency} {item.price * item.quantity}
                  </strong>

                  <button
                    onClick={() =>
                      setCart((current) =>
                        current.filter((p) => p.id !== item.id)
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}

              <div className="cart-total">
                Total: USD {cartTotal.toFixed(2)}
              </div>

              <button
                className="primary-button"
                type="button"
                onClick={checkoutWithPayPal}
                disabled={paymentLoading}
                style={{ marginTop: "16px" }}
              >
                {paymentLoading ? (
                  <>
                    <LoaderCircle className="spin" size={17} />
                    Processing...
                  </>
                ) : (
                  <>
                    <ShoppingCart size={17} />
                    Pay with PayPal
                  </>
                )}
              </button>

              <p className="demo-note">
                Pay securely using your PayPal Sandbox buyer account. No real money is charged.
              </p>
            </>
          )}
        </section>

        </>
        )}

        {activePage === "confirmation" && (
          <section className="assistant-section" style={{ maxWidth: "900px", margin: "50px auto" }}>
            <div className="assistant-box" style={{ padding: "clamp(22px, 5vw, 48px)" }}>
              <div style={{ textAlign: "center", marginBottom: "28px" }}>
                <CheckCircle2 size={64} color="#16a34a" />
                <div className="eyebrow" style={{ justifyContent: "center", marginTop: "16px" }}>
                  PAYMENT CONFIRMED
                </div>
                <h1 style={{ margin: "12px 0" }}>Thank you for your order!</h1>
                <p>Your payment was successfully captured by PayPal.</p>
                <span className="status">COMPLETED</span>
              </div>

              {confirmedOrder ? (
                <>
                  <div style={{ padding: "16px", borderRadius: "12px", background: "rgba(128,128,128,0.08)", marginBottom: "22px" }}>
                    <p><strong>Order ID:</strong> {confirmedOrder.paypal_order_id || confirmedOrder.order_id}</p>
                    <p><strong>Order date:</strong> {formatOrderDate(confirmedOrder.created_at)}</p>
                    <p><strong>Payment status:</strong> {confirmedOrder.status || "COMPLETED"}</p>
                    <p><strong>Total paid:</strong> {confirmedOrder.currency || "USD"} {confirmedOrder.amount || ""}</p>
                  </div>

                  <h2>Ordered products</h2>
                  {(confirmedOrder.items || []).length > 0 ? (
                    confirmedOrder.items.map((item, index) => (
                      <div className="cart-row" key={`${item.product_id}-${index}`}>
                        <span>
                          <strong>{item.name}</strong>
                          <br />
                          Quantity: {item.quantity} · Unit price: USD {item.unit_price}
                        </span>
                        <strong>USD {item.line_total}</strong>
                      </div>
                    ))
                  ) : (
                    <p>Order details are not available right now. You can try opening this order from payment history.</p>
                  )}
                </>
              ) : (
                <p>Payment completed. Order details are being retrieved.</p>
              )}

              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "28px" }}>
                <button className="primary-button" onClick={() => setActivePage("shop")}>
                  <ArrowLeft size={16} /> Continue shopping
                </button>
                <button className="small-button" onClick={openOrderHistory}>
                  <History size={16} /> View payment history
                </button>
              </div>
            </div>
          </section>
        )}

        {activePage === "history" && (
          <section className="assistant-section" style={{ maxWidth: "1000px", margin: "50px auto" }}>
            <div className="section-heading">
              <div className="eyebrow"><History size={15} /> PAYMENT HISTORY</div>
              <h2>Your orders</h2>
              <p>Review your previous purchases and payment statuses.</p>
            </div>

            <div className="assistant-box" style={{ padding: "24px" }}>
              <button className="small-button" onClick={() => setActivePage("shop")} style={{ marginBottom: "20px" }}>
                <ArrowLeft size={15} /> Back to shopping
              </button>

              {ordersLoading && <p><LoaderCircle className="spin" size={18} /> Loading orders...</p>}
              {ordersError && <div className="error-message">{ordersError}</div>}

              {!ordersLoading && !ordersError && orders.length === 0 && (
                <p>No orders found yet. Your completed purchases will appear here.</p>
              )}

              {orders.map((order) => (
                <div className="recommendation" key={order.paypal_order_id}>
                  <div className="recommendation-top">
                    <span>ORDER {order.paypal_order_id}</span>
                    <strong>{order.status}</strong>
                  </div>
                  <p>{formatOrderDate(order.created_at)}</p>
                  <p><strong>{order.currency} {order.amount}</strong> · {(order.items || []).length} product line(s)</p>
                  <button className="small-button" onClick={() => openOrderDetails(order.paypal_order_id)}>
                    <PackageCheck size={15} /> View ordered products
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>

      <footer>
        <div className="brand">
          <ShoppingBag size={20} />
          CartMind AI
        </div>
        <p>Think smarter. Shop better. Pay securely.</p>
      </footer>

    </div>
  );
}

export default App;
