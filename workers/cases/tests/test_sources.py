import httpx

from cases.sources import (
    DEFAULT_SOURCE_URLS,
    Source,
    candidate_links,
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
    assert got == [Source("page", "https://a.example/1"), Source("list", "https://b.example/2")]


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
