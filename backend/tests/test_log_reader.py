from pathlib import Path

from app.api.tasks import read_log_text


def test_read_log_text_tolerates_non_utf8_bytes(tmp_path):
    log_path = tmp_path / "bad.log"
    log_path.write_bytes("ok ".encode("cp936") + bytes([0xA5]))

    content = read_log_text(log_path)

    assert "ok" in content
