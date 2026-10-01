import httpx
import pytest

from cases.sources import (
    DEFAULT_SOURCE_URLS,
    FetchError,
    Source,
    candidate_links,
    fetch_document,
    iter_documents,
    load_file,
    parse_source_spec,
    sources_from_env,
)


def test_parse_source_spec():
    assert parse_source_spec("list:https://a.example/topic") == Source(
        "list", "https://a.example/topic"
    )
    assert parse_source_spec("https://a.example/x") == Source("page", "https://a.example/x")
    assert parse_source_spec(" page:https://a.example/x ") == Source("page", "https://a.example/x")


def test_sources_from_env():
    assert len(sources_from_env({})) == len(DEFAULT_SOURCE_URLS)
    got = sources_from_env({"CASES_SOURCE_URLS": "https://a.example/1, list:https://b.example/2"})
    dghs = frozenset({"dghs.gov.bd"})  # default allow-list
    assert got == [
        Source("page", "https://a.example/1", dghs),
        Source("list", "https://b.example/2", dghs),
    ]
    got = sources_from_env(
        {"CASES_SOURCE_URLS": "list:https://b.example/2", "CASES_ALLOWED_HOSTS": " Www.C.example ,"}
    )
    assert got[0].hosts == {"b.example", "c.example"}
    assert sources_from_env({"CASES_ALLOWED_HOSTS": ""})[0].allowed_hosts == frozenset()


def test_candidate_links(read_fixture):
    links = candidate_links(read_fixture("listing.html"), "https://bdnews24.com/topic/dengue", 5)
    assert links == [
        "https://bdnews24.com/bangladesh/yd4u29kltc",
        "https://bdnews24.com/bangladesh/older123",
        "https://bdnews24.com/files/press-release-29-09-2026.pdf",
    ]


def test_iter_documents_follows_listing_and_survives_errors(read_fixture):
    article = read_fixture("en_news_article.html")
    listing = read_fixture("listing.html")

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if request.url.host == "down.example":
            return httpx.Response(503)
        if path == "/topic/dengue":
            return httpx.Response(200, text=listing, headers={"content-type": "text/html"})
        if path == "/bangladesh/yd4u29kltc":
            return httpx.Response(200, text=article, headers={"content-type": "text/html"})
        return httpx.Response(404)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    docs = list(
        iter_documents(
            client,
            [
                Source("page", "https://down.example/x"),
                Source("list", "https://bdnews24.com/topic/dengue"),
            ],
            max_links=3,
        )
    )
    assert [d.url for d in docs] == ["https://bdnews24.com/bangladesh/yd4u29kltc"]
    assert docs[0].is_html


def test_load_file_text(fixture_path):
    doc = load_file(fixture_path("bn_dghs_press_release.txt"), "https://dghs.gov.bd/pr")
    assert doc.url == "https://dghs.gov.bd/pr"
    assert not doc.is_html
    assert "ঢাকা" in doc.content


# --- fetch restrictions: host allow-list, redirects, size cap -------------------------------

OFFSITE_LISTING = """<html><body><ul>
<li><a href="https://evil.example/dengue-bulletin.pdf">Dengue press release (PDF)</a></li>
<li><a href="http://169.254.169.254/latest/dengue.pdf">Dengue bulletin</a></li>
<li><a href="https://dghs.gov.bd/files/dengue-press-release.pdf">Dengue press release</a></li>
<li><a href="/news/dengue-deaths">Dengue: 2 deaths, 500 hospitalised</a></li>
</ul></body></html>"""


def test_candidate_links_drop_offsite_links_including_pdfs():
    base = "https://news.example/topic/dengue"
    assert candidate_links(OFFSITE_LISTING, base, 5) == ["https://news.example/news/dengue-deaths"]
    assert candidate_links(OFFSITE_LISTING, base, 5, {"dghs.gov.bd"}) == [
        "https://dghs.gov.bd/files/dengue-press-release.pdf",
        "https://news.example/news/dengue-deaths",
    ]


def test_list_source_never_fetches_offsite_hosts():
    hits = []

    def handler(request: httpx.Request) -> httpx.Response:
        hits.append(str(request.url))
        if request.url.path == "/topic/dengue":
            return httpx.Response(200, text=OFFSITE_LISTING, headers={"content-type": "text/html"})
        return httpx.Response(200, text="ok", headers={"content-type": "text/plain"})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    src = Source("list", "https://news.example/topic/dengue")
    list(iter_documents(client, [src]))
    assert {httpx.URL(u).host for u in hits} == {"news.example"}


def _redirecting(location_for):
    def handler(request: httpx.Request) -> httpx.Response:
        loc = location_for(request.url)
        if loc:
            return httpx.Response(302, headers={"location": loc})
        return httpx.Response(
            200, text="<html>figures</html>", headers={"content-type": "text/html"}
        )

    return httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=True)


def test_redirect_to_other_host_is_refused():
    client = _redirecting(lambda u: "http://127.0.0.1:5432/" if u.host == "a.example" else None)
    with pytest.raises(FetchError, match="off-site"):
        fetch_document(client, "https://a.example/x")


def test_same_host_redirects_are_followed_and_capped():
    client = _redirecting(lambda u: "/final" if u.path == "/x" else None)
    doc = fetch_document(client, "https://www.a.example/x", {"a.example"})
    assert doc.url == "https://www.a.example/final" and doc.is_html
    loop = _redirecting(lambda u: "/again")
    with pytest.raises(FetchError, match="too many redirects"):
        fetch_document(loop, "https://a.example/x")


def test_oversized_responses_are_refused():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/declared":
            return httpx.Response(200, headers={"content-length": "999999999"}, content=b"x")
        return httpx.Response(200, content=iter([b"x" * 600, b"x" * 600]))  # no length

    client = httpx.Client(transport=httpx.MockTransport(handler))
    with pytest.raises(FetchError, match="exceeds"):
        fetch_document(client, "https://a.example/declared", max_bytes=1000)
    with pytest.raises(FetchError, match="exceeds"):
        fetch_document(client, "https://a.example/streamed", max_bytes=1000)
    assert fetch_document(client, "https://a.example/streamed", max_bytes=2000).content
