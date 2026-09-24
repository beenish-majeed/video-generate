from src.services.duration_parser import parse_duration_seconds


def test_parse_seconds():
    assert parse_duration_seconds("Create a 5-second video.") == 5.0
    assert parse_duration_seconds("Create a 30 second video.") == 30.0


def test_parse_minutes():
    assert parse_duration_seconds("Create a 2-minute video.") == 120.0
    assert parse_duration_seconds("Create a 5 minutes video.") == 300.0


def test_parse_written_minutes():
    assert parse_duration_seconds("Create a two minute video.") == 120.0


def test_parse_colon():
    assert parse_duration_seconds("Create a 1:30 video.") == 90.0


def test_aspect_ratio_is_not_duration():
    assert parse_duration_seconds("Create a 30-second vertical 9:16 video.") == 30.0


def test_no_duration():
    assert parse_duration_seconds("Make a nice talking video.") is None