import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Instagram, MapPin, Menu as MenuIcon, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { brand } from "./brand";

type MenuItem = {
  _id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  price: number;
  imageUrl: string;
  dietary: string[];
  sizes: { name: string; price: number }[];
  addOns: { name: string; price: number }[];
  stock: number;
};
type CartEntry = { item: MenuItem; quantity: number; size: string; addOns: string[] };
const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: brand.currency });

function createTrackingToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function App() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [menuError, setMenuError] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);
  const [reservationBusy, setReservationBusy] = useState(false);
  const [communityBusy, setCommunityBusy] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});
  const [selectedAddOns, setSelectedAddOns] = useState<Record<string, string[]>>({});
  const [lastOrder, setLastOrder] = useState<{ id: string; token: string; status: string } | null>(null);
  const orderKey = useRef(crypto.randomUUID());
  const trackingToken = useRef(createTrackingToken());

  async function refreshOrderStatus() {
    if (!lastOrder) return;
    try {
      const response = await fetch(`/api/v1/orders/${lastOrder.id}?token=${encodeURIComponent(lastOrder.token)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Order status is unavailable.");
      setLastOrder((old: { id: string; token: string; status: string } | null) => old ? { ...old, status: result.data.status } : old);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Order status is unavailable.");
    }
  }

  useEffect(() => {
    document.title = `${brand.name} — A neighborhood café`;
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/v1/menu")
      .then((response) => {
        if (!response.ok) throw new Error("Menu is temporarily unavailable. Please try again shortly.");
        return response.json();
      })
      .then((body) => { if (active) setItems(body.data); })
      .catch((error: unknown) => { if (active) setMenuError(error instanceof Error ? error.message : "Menu is temporarily unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const categories = useMemo(() => ["All", ...new Set(items.map((item) => item.category))], [items]);
  const shownItems = useMemo(() => items.filter((item) =>
    (category === "All" || item.category === category) &&
    `${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase())
  ), [category, items, search]);
  const count = cart.reduce((sum, entry) => sum + entry.quantity, 0);
  const subtotal = cart.reduce((sum, entry) => {
    const selected = entry.item.sizes.find((size) => size.name === entry.size);
    const addOnTotal = entry.item.addOns.filter((addOn) => entry.addOns.includes(addOn.name)).reduce((sum, addOn) => sum + addOn.price, 0);
    return sum + ((selected?.price ?? entry.item.price) + addOnTotal) * entry.quantity;
  }, 0);

  function addItem(item: MenuItem) {
    const size = selectedSizes[item._id] ?? item.sizes[0]?.name ?? "";
    const addOns = selectedAddOns[item._id] ?? [];
    setCart((old) => {
      const existing = old.find((entry) => entry.item._id === item._id && entry.size === size && entry.addOns.join("|") === addOns.join("|"));
      return existing
        ? old.map((entry) => entry === existing ? { ...entry, quantity: entry.quantity + 1 } : entry)
        : [...old, { item, quantity: 1, size, addOns }];
    });
    setStatus(`${item.name} added to your bag.`);
    window.setTimeout(() => setStatus(""), 2500);
  }

  function changeQuantity(itemId: string, size: string, addOns: string[], delta: number) {
    setCart((old) => old
      .map((entry) => entry.item._id === itemId && entry.size === size && entry.addOns.join("|") === addOns.join("|") ? { ...entry, quantity: entry.quantity + delta } : entry)
      .filter((entry) => entry.quantity > 0));
  }

  async function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOrderBusy(true);
    setStatus("");
    const form = new FormData(event.currentTarget);
    const lines = cart.map(({ item, quantity, size, addOns }) => ({ itemId: item._id, quantity, size: size || undefined, addOns }));
    try {
      const response = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": orderKey.current },
        body: JSON.stringify({
          customerName: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          fulfillment: "pickup",
          trackingToken: trackingToken.current,
          lines
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "We could not place your order.");
      setCart([]);
      setLastOrder({ id: result.data.id, token: result.trackingToken, status: result.data.status });
      orderKey.current = crypto.randomUUID();
      trackingToken.current = createTrackingToken();
      setStatus(`Order request ${result.data.id.slice(-6).toUpperCase()} received. The café will confirm pickup details; email notifications are not configured yet.`);
      setCartOpen(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Order could not be placed.");
    } finally {
      setOrderBusy(false);
    }
  }

  async function submitReservation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReservationBusy(true);
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      date: String(form.get("date") ?? ""),
      time: String(form.get("time") ?? ""),
      partySize: Number(form.get("partySize")),
      requests: String(form.get("requests") ?? "")
    };
    try {
      const response = await fetch("/api/v1/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Reservation request failed.");
      setStatus(result.message);
      event.currentTarget.reset();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Reservation request failed.");
    } finally {
      setReservationBusy(false);
    }
  }

  async function submitCommunityPost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommunityBusy(true);
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      kind: String(form.get("kind") ?? "review"),
      rating: Number(form.get("rating") ?? 5),
      message: String(form.get("message") ?? ""),
      consent: form.get("consent") === "on"
    };
    try {
      const response = await fetch("/api/v1/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Your note could not be sent.");
      setStatus(result.message);
      event.currentTarget.reset();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Your note could not be sent.");
    } finally {
      setCommunityBusy(false);
    }
  }

  return (
    <>
      <div className="announcement">A little slower, a little lovelier. Open daily from 7:30.</div>
      <header className="site-header">
        <a className="brand" href="#" aria-label={`${brand.name} home`}><span className="brand-mark">m</span><span>{brand.name.toUpperCase()}</span></a>
        <button className="mobile-toggle icon-button" aria-label={mobileMenu ? "Close menu" : "Open menu"} onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X /> : <MenuIcon />}</button>
        <nav className={mobileMenu ? "nav-links open" : "nav-links"} aria-label="Main navigation">
          <a href="#menu" onClick={() => setMobileMenu(false)}>Menu</a>
          <a href="#story" onClick={() => setMobileMenu(false)}>Our story</a>
          <a href="#visit" onClick={() => setMobileMenu(false)}>Visit</a>
          <a href="#community" onClick={() => setMobileMenu(false)}>Community</a>
        </nav>
        <button className="bag-button" onClick={() => setCartOpen(true)} aria-label={`Open bag, ${count} items`}>
          <ShoppingBag size={18} /><span>Order</span><span className="bag-count">{count}</span>
        </button>
      </header>
      {lastOrder && <div className="order-tracking"><span>Order {lastOrder.id.slice(-6).toUpperCase()} · <strong>{lastOrder.status.replace(/_/g, " ")}</strong></span><button onClick={() => void refreshOrderStatus()}>Refresh status <ArrowRight size={14} /></button></div>}

      <main>
        <section className="hero">
          <img className="hero-image" src="https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=2200&q=85" alt="Sunlit neighborhood café with a warm wooden counter" />
          <div className="hero-shade" />
          <div className="hero-copy">
            <p className="eyebrow light">YOUR NEIGHBORHOOD, A LITTLE SLOWER</p>
            <h1>Make room<br />for <em>good things.</em></h1>
            <p className="hero-subtitle">Coffee, seasonal plates, and the kind of morning you wish would last a little longer.</p>
            <div className="hero-actions">
              <a className="button button-light" href="#menu">Order something lovely <ArrowRight size={16} /></a>
              <a className="text-link light-link" href="#visit">Come find us <ArrowDown size={15} /></a>
            </div>
          </div>
          <span className="hero-caption">EST. WITH CARE · NEIGHBORHOOD, CITY</span>
        </section>

        <div className="ticker" aria-label="Café highlights">
          <span>GOOD COFFEE, GENTLY MADE</span><i>✳</i><span>SEASONAL BY NATURE</span><i>✳</i><span>ALWAYS ROOM FOR ONE MORE</span><i>✳</i><span>GOOD COFFEE, GENTLY MADE</span>
        </div>

        <section className="intro section-wrap" id="story">
          <div className="intro-label"><span className="eyebrow">A PLACE TO LAND</span><span className="line" /></div>
          <div className="intro-content">
            <h2>We believe the best days begin with <em>being here.</em></h2>
            <div className="intro-bottom"><p>At {brand.name}, the coffee is thoughtful, the ingredients are close to home, and there’s never a rush to finish your cup. Pull up a chair. We saved you the sunny one.</p><a className="text-link" href="#visit">A little about us <ArrowRight size={16} /></a></div>
          </div>
          <div className="intro-stamp">M<br /><small>&</small><br />M</div>
        </section>

        <section className="menu-section" id="menu">
          <div className="section-heading">
            <div><p className="eyebrow">MADE FRESH, MADE WITH CARE</p><h2>A few <em>favorites.</em></h2></div>
            <p>From first pour to last bite,<br />there’s something for this moment.</p>
          </div>
          <div className="menu-controls">
            <div className="category-list" role="tablist" aria-label="Menu categories">
              {categories.map((item) => <button role="tab" aria-selected={category === item} className={category === item ? "category active" : "category"} key={item} onClick={() => setCategory(item)}>{item}</button>)}
            </div>
            <label className="search-box"><span className="sr-only">Search the menu</span><input type="search" placeholder="Find your favorite..." value={search} onChange={(event) => setSearch(event.target.value)} /><span>⌕</span></label>
          </div>
          {loading && <p className="inline-message">Warming up the menu…</p>}
          {menuError && <p className="inline-message" role="alert">{menuError}</p>}
          {!loading && shownItems.length === 0 && <p className="inline-message">Nothing on the menu matches yet. Try another search.</p>}
          <div className="menu-grid">
            {shownItems.slice(0, 6).map((item, index) => (
              <article className="menu-card" key={item._id} style={{ animationDelay: `${index * 70}ms` }}>
                <div className="menu-image-wrap"><img src={item.imageUrl} alt={item.name} loading="lazy" /><span className="menu-tag">{item.category}</span><button className="quick-add" onClick={() => addItem(item)} aria-label={`Add ${item.name} to bag`}><Plus size={18} /></button></div>
                <div className="menu-card-copy"><div className="menu-card-details"><h3>{item.name}</h3><p>{item.description}</p>
                  {item.sizes.length > 0 && <label className="item-option">Size<select aria-label={`${item.name} size`} value={selectedSizes[item._id] ?? item.sizes[0].name} onChange={(event) => setSelectedSizes((old) => ({ ...old, [item._id]: event.target.value }))}>{item.sizes.map((size) => <option key={size.name} value={size.name}>{size.name} · {currency.format(size.price)}</option>)}</select></label>}
                  {item.addOns.length > 0 && <fieldset className="addon-options"><legend>Add a little extra</legend>{item.addOns.map((addOn) => <label key={addOn.name}><input type="checkbox" checked={(selectedAddOns[item._id] ?? []).includes(addOn.name)} onChange={(event) => setSelectedAddOns((old) => ({ ...old, [item._id]: event.target.checked ? [...(old[item._id] ?? []), addOn.name] : (old[item._id] ?? []).filter((name) => name !== addOn.name) }))} />{addOn.name} +{currency.format(addOn.price)}</label>)}</fieldset>}
                  <div className="dietary">{item.dietary.map((tag) => <span key={tag}>{tag}</span>)}</div></div><strong>{currency.format((item.sizes.find((size) => size.name === selectedSizes[item._id])?.price ?? item.price) + item.addOns.filter((addOn) => (selectedAddOns[item._id] ?? []).includes(addOn.name)).reduce((sum, addOn) => sum + addOn.price, 0))}</strong></div>
              </article>
            ))}
          </div>
          <div className="menu-foot"><span>Our menu changes with the season. Ask us about today’s specials.</span><a href="#menu" className="text-link">Full menu <ArrowRight size={16} /></a></div>
        </section>

        <section className="feature">
          <div className="feature-image"><img src="https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1400&q=85" alt="Barista pouring fresh coffee into a ceramic cup" loading="lazy" /></div>
          <div className="feature-copy"><p className="eyebrow light">THE MORNING RITUAL</p><h2>Good things<br />take <em>their time.</em></h2><p>Small-batch beans, patient pours, and a little space to breathe. Our baristas know your usual — and are always happy to help you find a new one.</p><a className="button button-outline" href="#menu">Meet your new usual <ArrowRight size={16} /></a></div>
        </section>

        <section className="reservation section-wrap" id="visit">
          <div className="reservation-info"><p className="eyebrow">SAVE YOURSELF A SEAT</p><h2>There’s room<br />at our <em>table.</em></h2><p>Planning a slow brunch or a catch-up that deserves a little more time? Leave the details and we’ll be in touch to confirm.</p><div className="hours"><div><span>MON – FRI</span><strong>7:30 am — 6:00 pm</strong></div><div><span>SAT – SUN</span><strong>8:00 am — 5:00 pm</strong></div></div><a className="map-link" href={`https://maps.google.com/?q=${encodeURIComponent(brand.address)}`} target="_blank" rel="noreferrer"><MapPin size={17} /> {brand.address} <ArrowRight size={15} /></a><a className="contact-link" href={`tel:${brand.phone}`}>{brand.phone}</a></div>
          <form className="reservation-form" onSubmit={submitReservation}>
            <p className="eyebrow">A TABLE FOR YOU</p><h3>Let’s make a plan.</h3>
            <div className="form-row"><label>Your name<input name="name" required autoComplete="name" /></label><label>Email address<input name="email" type="email" required autoComplete="email" /></label></div>
            <div className="form-row"><label>Phone number<input name="phone" type="tel" required autoComplete="tel" /></label><label>How many?<select name="partySize" defaultValue="2">{[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} {n === 1 ? "guest" : "guests"}</option>)}</select></label></div>
            <div className="form-row"><label>Date<input name="date" type="date" min={new Date().toISOString().slice(0, 10)} required /></label><label>Time<select name="time" defaultValue="10:00">{["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00"].map(time => <option key={time}>{time}</option>)}</select></label></div>
            <label>A note for us <span className="optional">OPTIONAL</span><textarea name="requests" rows={2} maxLength={500} placeholder="A birthday, a high chair, your favorite window..." /></label>
            <button className="button button-dark full-button" disabled={reservationBusy}>{reservationBusy ? "Sending…" : "Request a table"} <ArrowRight size={16} /></button>
            <small>We’ll confirm your reservation by email or phone.</small>
          </form>
        </section>

        <section className="community" id="community"><div className="community-head"><div><p className="eyebrow">A LITTLE LOVE FROM AROUND HERE</p><h2>Good things are <em>better shared.</em></h2></div><a className="social-link" href="https://instagram.com" target="_blank" rel="noreferrer"><Instagram size={17} /> Follow along <ArrowRight size={15} /></a></div><div className="photo-grid">{[
          ["photo-1495474472287-4d71bcdd2085","Coffee, in its own time"],
          ["photo-1442512595331-e89e73853f31","A window seat kind of day"],
          ["photo-1501339847302-ac426a4a7cbb","Your neighborhood corner"],
          ["photo-1509042239860-f550ce710b93","Made for the little pause"]
        ].map(([photo, alt]) => <div className="photo-tile" key={photo}><img loading="lazy" src={`https://images.unsplash.com/${photo}?auto=format&fit=crop&w=700&q=75`} alt={alt} /><span>#{brand.hashtag}</span></div>)}</div><form className="community-form" onSubmit={submitCommunityPost}><div><p className="eyebrow">LEAVE A LITTLE NOTE</p><h3>Tell us how it felt.</h3></div><div className="community-form-fields"><div className="form-row"><label>Your name<input name="name" required maxLength={80} /></label><label>Email address<input name="email" type="email" required /></label></div><div className="form-row"><label>What would you like to share?<select name="kind" defaultValue="review"><option value="review">A review</option><option value="feedback">Feedback</option></select></label><label>Rating<select name="rating" defaultValue="5">{[5,4,3,2,1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}</select></label></div><label>Your note<textarea name="message" required maxLength={1200} rows={3} /></label><label className="consent"><input type="checkbox" name="consent" required /> I agree that the café team may review this submission. It will not be published unless approved.</label><button className="button button-dark" disabled={communityBusy}>{communityBusy ? "Sending…" : "Send for review"} <ArrowRight size={16} /></button><small>Photo/video uploads are not enabled yet. Share text feedback or reviews here.</small></div></form></section>
      </main>

      <footer className="footer"><div className="footer-top"><a className="brand footer-brand" href="#"><span className="brand-mark">m</span><span>{brand.name.toUpperCase()}</span></a><p>{brand.tagline}<br />See you around the corner.</p><a className="button button-light" href="#menu">Come on in <ArrowRight size={16} /></a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} {brand.name} Café</span><div><a href={`mailto:${brand.email}`}>Say hello</a><a href="#visit">Find us</a><a href="#community">Instagram</a></div><span>Made with a little extra care.</span></div></footer>

      {status && <div className="toast" role="status">{status}<button aria-label="Dismiss" onClick={() => setStatus("")}><X size={15} /></button></div>}

      {cartOpen && <div className="drawer-backdrop" onClick={() => setCartOpen(false)}><aside className="cart-drawer" onClick={(event) => event.stopPropagation()} aria-label="Your order" role="dialog" aria-modal="true"><div className="drawer-heading"><div><p className="eyebrow">A LITTLE SOMETHING FOR YOU</p><h2>Your bag <span>({count})</span></h2></div><button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Close bag"><X /></button></div>
        {cart.length === 0 ? <div className="empty-cart"><ShoppingBag size={30} /><h3>Your bag is taking a breather.</h3><p>Find something lovely on the menu.</p><button className="button button-dark" onClick={() => setCartOpen(false)}>Explore the menu <ArrowRight size={16} /></button></div> : <>
          <div className="cart-lines">{cart.map(({ item, quantity, size, addOns }) => { const unitPrice = (item.sizes.find((s) => s.name === size)?.price ?? item.price) + item.addOns.filter((addOn) => addOns.includes(addOn.name)).reduce((sum, addOn) => sum + addOn.price, 0); return <div className="cart-line" key={`${item._id}-${size}-${addOns.join("-")}`}><img src={item.imageUrl} alt="" /><div className="cart-line-info"><strong>{item.name}</strong><span>{size || item.category}{addOns.length ? ` · ${addOns.join(", ")}` : ""} · {currency.format(unitPrice)}</span><div className="quantity-control"><button aria-label={`Remove one ${item.name}`} onClick={() => changeQuantity(item._id, size, addOns, -1)}><Minus size={14} /></button><span>{quantity}</span><button aria-label={`Add one ${item.name}`} onClick={() => changeQuantity(item._id, size, addOns, 1)}><Plus size={14} /></button></div></div><strong>{currency.format(quantity * unitPrice)}</strong></div>; })}</div>
          <form className="checkout-form" onSubmit={submitOrder}><p className="eyebrow">PICKUP ORDER</p><label>Your name<input name="name" required autoComplete="name" /></label><label>Email address<input name="email" type="email" required autoComplete="email" /></label><label>Phone number<input name="phone" type="tel" required autoComplete="tel" /></label><div className="subtotal"><span>Subtotal</span><strong>{currency.format(subtotal)}</strong></div><small>Tax is calculated securely at checkout. Pickup only; payment is arranged with the café.</small><button className="button button-dark full-button" disabled={orderBusy}>{orderBusy ? "Placing order…" : "Place pickup order"} <ArrowRight size={16} /></button></form>
        </>}</aside></div>}
    </>
  );
}
