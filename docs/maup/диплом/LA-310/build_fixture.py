"""Generate synthetic LA-310 merchandise and balanced movements through a Kyiv date."""
import argparse
from collections import Counter
from datetime import date, timedelta
import json
from pathlib import Path
from random import Random

BRANDS = (
    "Chrome Hearts", "Affliction", "Amiri", "Philipp Plein", "Elvis Jesus",
    "Ed Hardy", "Christian Audigier", "Rebel Spirit", "Roar", "Daemon Design",
    "AllSaints", "John Varvatos", "True Religion", "Rock Revival", "Robin's Jean",
    "Von Dutch", "Saint Laurent", "Balmain", "Alexander McQueen", "Rick Owens",
    "Enfants Riches Déprimés", "Gallery Dept.", "Rhude", "Fear of God", "Ksubi",
    "Dsquared2", "Dom Rebel", "Sullen Art Collective", "Zadig & Voltaire", "The Great Frog",
)
CATEGORIES = (
    ("Футболки", "T-Shirts", 2800), ("Худі", "Hoodies", 5600),
    ("Світшоти", "Sweatshirts", 4900), ("Лонгсліви", "Long Sleeves", 3400),
    ("Майки", "Tank Tops", 2300), ("Джинси", "Jeans", 7000),
    ("Шкіряні куртки", "Leather Jackets", 20500), ("Куртки та бомбери", "Jackets & Bombers", 9900),
    ("Сорочки", "Shirts", 4700), ("Штани карго", "Cargo Pants", 5500),
    ("Шорти", "Shorts", 3600), ("Спортивні штани", "Joggers", 4500),
    ("Кросівки", "Sneakers", 8600), ("Черевики", "Boots", 11100),
    ("Кепки", "Caps", 1900), ("Шапки", "Beanies", 1800), ("Ремені", "Belts", 3500),
    ("Каблучки", "Rings", 5300), ("Браслети", "Bracelets", 4900),
    ("Ланцюжки та підвіски", "Chains & Pendants", 6600),
)
CHANNELS = (38, 68, 78, 79)
START = date(2025, 1, 1)


def days(first, last):
    return (first + timedelta(days=i) for i in range((last - first).days + 1))


def build(end):
    random = Random(310)
    products, events, receipts = [], [], []
    for index in range(310):
        number = index + 1
        brand_no = index % len(BRANDS)
        uk, en, base = CATEGORIES[(index // 20 * 3 + index) % len(CATEGORIES)]
        brand = BRANDS[brand_no]
        sku = f"LA-310-{number:03d}"
        color = ("чорний", "графіт", "молочний", "сірий", "бордо")[index % 5]
        supplier = f"LA310-SUP-{brand_no // 5 + 1}"
        price = (base * random.randint(85, 160) // 100 // 50) * 50
        cost = max(50, price * random.randint(42, 60) // 100 // 10 * 10)
        product = {
            "pid": sku, "sku": sku, "brand": brand, "category": f"{uk} — {en}",
            "name": f"{brand} · {uk} · {color} · {number:03d}", "supplier": supplier,
            "color": color, "price": price, "cost": cost,
            "ownership": "CONSIGNMENT" if brand_no % 6 == 5 else "OWN",
        }
        products.append(product)
        available = 0
        profile = index % 7
        first = START + timedelta(days=index % 8)
        recent_ref = None
        for day in days(first, end):
            age = (day - first).days
            shortage_delivery = profile == 0 and day == date(end.year, 10, 1)
            if age == 0 or shortage_delivery or (age % 91 == 0 and profile not in (0, 1, 2)):
                if shortage_delivery:
                    qty = 1
                elif profile == 0:
                    qty = 5
                elif profile == 6:
                    qty = 11 + index % 5
                else:
                    qty = 27 + index % 17
                available += qty
                receipts.append({"id": f"{sku}-R-{day}", "pid": sku, "sku": sku,
                                 "date": str(day), "qty": qty, "cost": cost})
            if recent_ref and (day - date.fromisoformat(recent_ref["date"])).days == 4:
                sale = recent_ref
                events.append({**sale, "id": f"{sku}-X-{day}", "lineId": f"{sku}-XL-{day}",
                               "date": str(day), "qty": 1, "status": 7, "ref": sale["id"]})
                recent_ref = None
                available += 1
            interval = (34, 100, 51, 18, 13, 25, 9)[profile]
            if available and age % interval == (index // 7) % interval:
                qty = min(available, 1 + (profile in (4, 6) and age % 3 == 0))
                discount = (0, 0, 0, 10, 15)[(age + index) % 5]
                sale = {"id": f"{sku}-O-{day}", "lineId": f"{sku}-L-{day}",
                        "date": str(day), "pid": sku, "sku": sku, "qty": qty,
                        "unit": price * (100 - discount) // 100, "cost": cost,
                        "status": 5, "channel": CHANNELS[(age // 3 + index) % 4]}
                events.append(sale)
                if (age + index) % 19 == 0:
                    recent_ref = sale
                available -= qty
        product["stock"] = available

    assert set(p["brand"] for p in products) == set(BRANDS)
    assert len({p["category"] for p in products}) == len(CATEGORIES)
    assert len({p["sku"] for p in products}) == 310
    assert len({e["id"] for e in events}) == len(events)
    assert len({r["id"] for r in receipts}) == len(receipts)
    stock = Counter()
    originals = {e["id"]: e for e in events if e["status"] == 5}
    for row in sorted(receipts + events, key=lambda row: (row["date"], row.get("status", 0) == 5)):
        if row.get("status") == 7:
            original = originals[row["ref"]]
            assert original["sku"] == row["sku"] and original["date"] < row["date"]
        stock[row["sku"]] += row["qty"] * (-1 if row.get("status") == 5 else 1)
        assert stock[row["sku"]] >= 0
    assert all(stock[p["sku"]] == p["stock"] for p in products)
    current = [e for e in events if e["date"] >= str(end.replace(day=1))]
    metrics = {"revenue": 0, "units": 0, "stockUnits": sum(stock.values()),
               "stockCost": sum(p["stock"] * p["cost"] for p in products),
               "coveredGrossProfit": 0}
    by_sku = {p["sku"]: p for p in products}
    for event in current:
        qty = event["qty"] * (1 if event["status"] == 5 else -1)
        revenue = qty * event["unit"]
        metrics["revenue"] += revenue
        metrics["units"] += qty
        metrics["coveredGrossProfit"] += (
            revenue * 40 if by_sku[event["sku"]]["ownership"] == "CONSIGNMENT"
            else (revenue - qty * event["cost"]) * 100
        )
    metrics["coveredGrossProfit"] = str(metrics["coveredGrossProfit"] / 100)
    suppliers = [
        [f"LA310-SUP-{i}", f"LA-310 · демопостачальник {i}", 5 + i * 2, 42, 3]
        for i in range(1, 7)
    ]
    return {"version": "LA-310", "asof": str(end), "synthetic": True, "products": products,
            "events": events, "receipts": receipts, "suppliers": suppliers, "controls": metrics}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--end", type=date.fromisoformat, required=True)
    args = parser.parse_args()
    if args.end < date(2026, 1, 1):
        parser.error("--end must be in 2026 or later")
    fixture = build(args.end)
    path = Path(__file__).with_name("LA-310.json")
    path.write_text(json.dumps(fixture, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({"asof": fixture["asof"], "products": len(fixture["products"]),
                      "events": len(fixture["events"]), "receipts": len(fixture["receipts"]),
                      **fixture["controls"]}, ensure_ascii=False))
