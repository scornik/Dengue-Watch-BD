"""Pluggable document sources for the daily dengue figures.

Configure with ``CASES_SOURCE_URLS`` (comma-separated, tried in order). Each entry is
``[kind:]url`` where ``kind`` is:

* ``page`` (default) - the URL itself is the bulletin (HTML page, PDF or plain text).
* ``list`` - the URL is a listing/topic page; the newest links that look like a daily dengue
  update (English or Bangla) are followed, up to ``CASES_MAX_LINKS`` per listing.

New kinds can be registered in ``FETCHERS``. The defaults below are best-effort starting
points; DGHS and newspaper URLs change often, so verify them before deploying and override the
list via the environment rather than editing code.
"""

from __future__ import annotations

import io
import logging
import os
import re
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from .parse import normalize_text

log = logging.getLogger(__name__)

DEFAULT_SOURCE_URLS: tuple[str, ...] = (
    # DGHS Health Emergency Operation Centre dengue page (press releases / daily status).
    "list:https://dghs.gov.bd/pages/heoc_dengue_v1.php",
    # News outlets that republish the DGHS figures daily.
    "list:https://bdnews24.com/topic/dengue",
    "list:https://www.thedailystar.net/tags/dengue",
)

USER_AGENT = "DengueWatchBD-cases/0.1 (civic dengue dashboard; AGPL-3.0)"

_LINK_TOPIC = re.compile(normalize_text(r"dengue|ডেঙ্গু"), re.IGNORECASE)
_LINK_DAILY = re.compile(
    normalize_text(
        r"hospitali[sz]|admit|death|died|patients|cases|24\s*hours|bulletin|press\s*release"
        r"|ভর্তি|মৃত্যু|মারা|রোগী|২৪\s*ঘণ্টা|প্রেস\s*বিজ্ঞপ্তি"
    ),
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class Source:
    kind: str
    url: str


@dataclass(frozen=True, slots=True)
class Document:
    url: str
    content: str
    is_html: bool


def parse_source_spec(spec: str) -> Source:
    spec = spec.strip()
    kind, sep, rest = spec.partition(":")
    if sep and kind in FETCHERS and not rest.startswith("//"):
        return Source(kind, rest.strip())
    return Source("page", spec)


def sources_from_env(env: Mapping[str, str] | None = None) -> list[Source]:
    env = os.environ if env is None else env
    raw = env.get("CASES_SOURCE_URLS", "").strip()
    specs = [s for s in raw.split(",") if s.strip()] if raw else list(DEFAULT_SOURCE_URLS)
    return [parse_source_spec(s) for s in specs]


def make_client(timeout: float = 30.0) -> httpx.Client:
    return httpx.Client(
        timeout=timeout,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en,bn;q=0.8"},
    )


def pdf_to_text(data: bytes) -> str:
    """Extract text from a PDF (works for Unicode PDFs; legacy Bijoy-font PDFs will not parse)."""
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _decode(url: str, data: bytes, content_type: str) -> Document:
    ct = content_type.lower()
    if "pdf" in ct or url.lower().endswith(".pdf") or data[:5] == b"%PDF-":
        return Document(url, pdf_to_text(data), is_html=False)
    text = data.decode("utf-8", errors="replace")
    is_html = "html" in ct or "<html" in text[:2000].lower() or "<table" in text[:5000].lower()
    return Document(url, text, is_html=is_html)


def fetch_document(client: httpx.Client, url: str) -> Document:
    resp = client.get(url)
    resp.raise_for_status()
    return _decode(str(resp.url), resp.content, resp.headers.get("content-type", ""))


def load_file(path: str | Path, source_url: str | None = None) -> Document:
    """Read a saved bulletin (HTML, text or PDF) for --from-file runs and tests."""
    p = Path(path)
    data = p.read_bytes()
    ct = "text/html" if p.suffix.lower() in {".html", ".htm"} else ""
    doc = _decode(source_url or p.resolve().as_uri(), data, ct)
    return doc


def candidate_links(html: str, base_url: str, max_links: int) -> list[str]:
    """Newest-first links on a listing page that look like a daily dengue update."""
    soup = BeautifulSoup(html, "html.parser")
    base_host = urlparse(base_url).netloc
    seen: set[str] = set()
    out: list[str] = []
    for a in soup.find_all("a", href=True):
        text = normalize_text(a.get_text(" ", strip=True) + " " + str(a.get("title", "")))
        href = urljoin(base_url, str(a["href"]))
        if urlparse(href).scheme not in {"http", "https"} or href in seen:
            continue
        is_pdf = href.lower().endswith(".pdf")
        # Topic pages only contain dengue stories, so accept a "daily" keyword alone there;
        # otherwise require both the topic and a daily-figures keyword.
        if not _LINK_DAILY.search(text) and not is_pdf:
            continue
        if not (
            _LINK_TOPIC.search(text) or _LINK_TOPIC.search(href) or _LINK_TOPIC.search(base_url)
        ):
            continue
        if urlparse(href).netloc != base_host and not is_pdf:
            continue  # skip ads / off-site links
        seen.add(href)
        out.append(href)
        if len(out) >= max_links:
            break
    return out


def _fetch_page(client: httpx.Client, source: Source, max_links: int) -> Iterator[Document]:
    yield fetch_document(client, source.url)


def _fetch_list(client: httpx.Client, source: Source, max_links: int) -> Iterator[Document]:
    listing = fetch_document(client, source.url)
    links = candidate_links(listing.content, listing.url, max_links) if listing.is_html else []
    if not links:
        log.warning("no candidate links found on listing %s", source.url)
    for link in links:
        try:
            yield fetch_document(client, link)
        except httpx.HTTPError as exc:
            log.warning("failed to fetch %s: %s", link, exc)


FETCHERS: dict[str, Callable[[httpx.Client, Source, int], Iterator[Document]]] = {
    "page": _fetch_page,
    "list": _fetch_list,
}


def iter_documents(
    client: httpx.Client, sources: list[Source], max_links: int = 3
) -> Iterator[Document]:
    """Yield candidate documents from every source, logging (not raising) network errors."""
    for source in sources:
        fetcher = FETCHERS.get(source.kind)
        if fetcher is None:
            log.error("unknown source kind %r for %s", source.kind, source.url)
            continue
        try:
            yield from fetcher(client, source, max_links)
        except httpx.HTTPError as exc:
            log.warning("source %s failed: %s", source.url, exc)
