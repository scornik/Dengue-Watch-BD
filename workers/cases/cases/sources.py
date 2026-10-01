"""Pluggable document sources for the daily dengue figures.

Configure with ``CASES_SOURCE_URLS`` (comma-separated, tried in order). Each entry is
``[kind:]url`` where ``kind`` is:

* ``page`` (default) - the URL itself is the bulletin (HTML page, PDF or plain text).
* ``list`` - the URL is a listing/topic page; the newest links that look like a daily dengue
  update (English or Bangla) are followed, up to ``CASES_MAX_LINKS`` per listing.

Every fetched URL, every followed link (PDFs included) and every redirect hop must be on the
source's own host or on ``CASES_ALLOWED_HOSTS`` (comma-separated host names; default
``dghs.gov.bd``, whose PDFs news sites link to). A leading ``www.`` is ignored when comparing.
Responses larger than ``MAX_BYTES`` are dropped.

New kinds can be registered in ``FETCHERS``. The defaults below are best-effort starting
points; DGHS and newspaper URLs change often, so verify them before deploying and override the
list via the environment rather than editing code.
"""

from __future__ import annotations

import io
import logging
import os
import re
from collections.abc import Callable, Collection, Iterator, Mapping
from dataclasses import dataclass, field
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

# Hosts any source may link to, besides its own (official bulletins hosted off-site).
DEFAULT_ALLOWED_HOSTS: tuple[str, ...] = ("dghs.gov.bd",)
MAX_BYTES = 20 * 1024 * 1024  # largest bulletin we download (PDF scans are a few MB)
MAX_REDIRECTS = 5

USER_AGENT = "DengueWatchBD-cases/0.1 (civic dengue dashboard; AGPL-3.0)"

_LINK_TOPIC = re.compile(normalize_text(r"dengue|ডেঙ্গু"), re.IGNORECASE)
_LINK_DAILY = re.compile(
    normalize_text(
        r"hospitali[sz]|admit|death|died|patients|cases|24\s*hours|bulletin|press\s*release"
        r"|ভর্তি|মৃত্যু|মারা|রোগী|২৪\s*ঘণ্টা|প্রেস\s*বিজ্ঞপ্তি"
    ),
    re.IGNORECASE,
)


class FetchError(Exception):
    """A URL or response we refuse: off-site host, too many redirects, too large."""


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def _norm_hosts(hosts: Collection[str]) -> frozenset[str]:
    return frozenset(h.strip().lower().removeprefix("www.") for h in hosts if h.strip())


@dataclass(frozen=True, slots=True)
class Source:
    kind: str
    url: str
    allowed_hosts: frozenset[str] = field(default=frozenset())  # besides the source's own

    @property
    def hosts(self) -> frozenset[str]:
        """Hosts this source may fetch from: its own plus the configured allow-list."""
        return _norm_hosts({_host(self.url), *self.allowed_hosts})


@dataclass(frozen=True, slots=True)
class Document:
    url: str
    content: str
    is_html: bool


def parse_source_spec(spec: str, allowed_hosts: frozenset[str] = frozenset()) -> Source:
    spec = spec.strip()
    kind, sep, rest = spec.partition(":")
    if sep and kind in FETCHERS and not rest.startswith("//"):
        return Source(kind, rest.strip(), allowed_hosts)
    return Source("page", spec, allowed_hosts)


def allowed_hosts_from_env(env: Mapping[str, str] | None = None) -> frozenset[str]:
    env = os.environ if env is None else env
    raw = env.get("CASES_ALLOWED_HOSTS")
    return _norm_hosts(raw.split(",") if raw is not None else DEFAULT_ALLOWED_HOSTS)


def sources_from_env(env: Mapping[str, str] | None = None) -> list[Source]:
    env = os.environ if env is None else env
    raw = env.get("CASES_SOURCE_URLS", "").strip()
    specs = [s for s in raw.split(",") if s.strip()] if raw else list(DEFAULT_SOURCE_URLS)
    allowed = allowed_hosts_from_env(env)
    return [parse_source_spec(s, allowed) for s in specs]


def make_client(timeout: float = 30.0) -> httpx.Client:
    return httpx.Client(
        timeout=timeout,
        follow_redirects=False,  # fetch_document follows them itself, checking each hop
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


def _check_url(url: str, hosts: frozenset[str]) -> None:
    if urlparse(url).scheme not in {"http", "https"} or _host(url) not in hosts:
        raise FetchError(f"refusing off-site or non-HTTP URL {url}")


def _read_capped(resp: httpx.Response, max_bytes: int) -> bytes:
    declared = resp.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > max_bytes:
        raise FetchError(f"{resp.url}: {declared} bytes exceeds {max_bytes}")
    buf = bytearray()
    for chunk in resp.iter_bytes():  # decoded bytes, so a gzip bomb is capped as well
        buf += chunk
        if len(buf) > max_bytes:
            raise FetchError(f"{resp.url}: response exceeds {max_bytes} bytes")
    return bytes(buf)


def fetch_document(
    client: httpx.Client,
    url: str,
    hosts: Collection[str] | None = None,
    max_bytes: int = MAX_BYTES,
) -> Document:
    """GET `url`, following redirects only while every hop stays on `hosts`.

    `hosts` defaults to the URL's own host. Raises FetchError for a refused URL or response
    and httpx.HTTPError for network/status errors.
    """
    allowed = _norm_hosts(hosts) if hosts is not None else _norm_hosts({_host(url)})
    for _ in range(MAX_REDIRECTS + 1):
        _check_url(url, allowed)
        with client.stream("GET", url, follow_redirects=False) as resp:
            if resp.is_redirect:
                url = urljoin(str(resp.url), resp.headers["location"])
                continue
            resp.raise_for_status()
            data = _read_capped(resp, max_bytes)
            return _decode(str(resp.url), data, resp.headers.get("content-type", ""))
    raise FetchError(f"too many redirects from {url}")


def load_file(path: str | Path, source_url: str | None = None) -> Document:
    """Read a saved bulletin (HTML, text or PDF) for --from-file runs and tests."""
    p = Path(path)
    data = p.read_bytes()
    ct = "text/html" if p.suffix.lower() in {".html", ".htm"} else ""
    doc = _decode(source_url or p.resolve().as_uri(), data, ct)
    return doc


def candidate_links(
    html: str, base_url: str, max_links: int, allowed_hosts: Collection[str] = ()
) -> list[str]:
    """Newest-first links on a listing page that look like a daily dengue update.

    Only links on the listing's own host or on `allowed_hosts` are returned (PDFs included).
    """
    soup = BeautifulSoup(html, "html.parser")
    hosts = _norm_hosts({_host(base_url), *allowed_hosts})
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
        if _host(href) not in hosts:
            continue  # skip ads / off-site links: never fetch arbitrary hosts
        seen.add(href)
        out.append(href)
        if len(out) >= max_links:
            break
    return out


def _fetch_page(client: httpx.Client, source: Source, max_links: int) -> Iterator[Document]:
    yield fetch_document(client, source.url, source.hosts)


def _fetch_list(client: httpx.Client, source: Source, max_links: int) -> Iterator[Document]:
    listing = fetch_document(client, source.url, source.hosts)
    links = (
        candidate_links(listing.content, listing.url, max_links, source.hosts)
        if listing.is_html
        else []
    )
    if not links:
        log.warning("no candidate links found on listing %s", source.url)
    for link in links:
        try:
            yield fetch_document(client, link, source.hosts)
        except (httpx.HTTPError, FetchError) as exc:
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
        except (httpx.HTTPError, FetchError) as exc:
            log.warning("source %s failed: %s", source.url, exc)
