#!/usr/bin/env python3
import html
import json
import re
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse


CATALOG_URL = "https://us.rosco.com/en/products/catalog/gobos?type=67&search=&sort_by=title&sort_order=ASC&items_per_page=24&page={page}"
SITE_ROOT = "https://us.rosco.com"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = PROJECT_ROOT / "frontend" / "public" / "gobos"
IMAGE_ROOT = PUBLIC_ROOT / "images"
CATALOG_PATH = PUBLIC_ROOT / "catalog.json"


def fetch_text(url: str) -> str:
    for attempt in range(3):
        try:
            proc = subprocess.run(
                ["curl", "-L", "-sS", url],
                check=True,
                capture_output=True,
            )
            return proc.stdout.decode("utf-8", errors="replace")
        except subprocess.CalledProcessError:
            if attempt == 2:
                raise
            time.sleep(0.2 * (attempt + 1))


def fetch_bytes(url: str) -> bytes:
    for attempt in range(3):
        try:
            proc = subprocess.run(
                ["curl", "-L", "-sS", url],
                check=True,
                capture_output=True,
            )
            return proc.stdout
        except subprocess.CalledProcessError:
            if attempt == 2:
                raise
            time.sleep(0.2 * (attempt + 1))
    return b""


def clean_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", "", value)
    value = html.unescape(value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def parse_last_page(html_text: str) -> int:
    match = re.search(r'pager__item--last.*?href="[^"]*page=(\d+)"', html_text, re.S)
    if not match:
        return 0
    return int(match.group(1))


def parse_products(html_text: str):
    product_blocks = re.findall(r'<div class="product-item">(.*?)</div>\s*</div>', html_text, re.S)
    for block in product_blocks:
        img_match = re.search(r'<img src="([^"]+)"', block)
        code_match = re.search(r'<span class="name"><a [^>]+>([^<]+)</a></span>', block)
        text_match = re.search(r'<span class="text-box">\s*(.*?)<br>', block, re.S)
        if not img_match or not code_match:
            continue
        image_url = urljoin(SITE_ROOT, html.unescape(img_match.group(1).strip()))
        code = clean_text(code_match.group(1))
        name = clean_text(text_match.group(1)) if text_match else code
        yield {"code": code, "name": name, "image_url": image_url}


def safe_filename(code: str, image_url: str) -> str:
    parsed = urlparse(image_url)
    ext = Path(parsed.path).suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        ext = ".jpg"
    normalized = re.sub(r"[^a-zA-Z0-9_-]+", "_", code).strip("_")
    if not normalized:
        normalized = f"gobo_{int(time.time() * 1000)}"
    return f"{normalized}{ext}"


def main() -> None:
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    IMAGE_ROOT.mkdir(parents=True, exist_ok=True)

    first_page = fetch_text(CATALOG_URL.format(page=0))
    last_page = parse_last_page(first_page)
    print(f"Detected pages: 0..{last_page}", flush=True)

    all_products_map = {}

    for page in range(last_page + 1):
        html_text = first_page if page == 0 else fetch_text(CATALOG_URL.format(page=page))
        products = list(parse_products(html_text))
        print(f"Page {page}: {len(products)} products", flush=True)
        for product in products:
            code = product["code"]
            if code in all_products_map:
                continue
            filename = safe_filename(code, product["image_url"])
            all_products_map[code] = {
                "code": code,
                "name": product["name"],
                "image_url": product["image_url"],
                "filename": filename,
            }
        time.sleep(0.05)

    all_products = list(all_products_map.values())
    print(f"Unique gobos found: {len(all_products)}", flush=True)

    def download_product(product: dict) -> tuple[str, bool]:
        local_path = IMAGE_ROOT / product["filename"]
        if local_path.exists():
            return product["code"], True
        try:
            image_bytes = fetch_bytes(product["image_url"])
            local_path.write_bytes(image_bytes)
            return product["code"], True
        except Exception:  # noqa: BLE001
            return product["code"], False

    downloaded = 0
    failed_codes = []
    with ThreadPoolExecutor(max_workers=16) as executor:
        futures = [executor.submit(download_product, product) for product in all_products]
        for idx, future in enumerate(as_completed(futures), start=1):
            code, ok = future.result()
            if ok:
                downloaded += 1
            else:
                failed_codes.append(code)
            if idx % 100 == 0 or idx == len(futures):
                print(f"Downloaded {idx}/{len(futures)}", flush=True)

    final_products = [
        {
            "code": product["code"],
            "name": product["name"],
            "image": f"/gobos/images/{product['filename']}",
        }
        for product in all_products
        if product["code"] not in failed_codes
    ]

    final_products.sort(key=lambda item: item["code"])
    CATALOG_PATH.write_text(json.dumps(final_products, indent=2), encoding="utf-8")
    print(f"Saved {len(final_products)} gobos to {CATALOG_PATH}", flush=True)
    if failed_codes:
        print(f"Failed downloads: {len(failed_codes)}", flush=True)


if __name__ == "__main__":
    main()
