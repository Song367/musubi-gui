from pathlib import Path


def test_dockerfile_installs_c_compiler_for_triton_runtime():
    dockerfile = Path(__file__).resolve().parents[2] / "Dockerfile"
    content = dockerfile.read_text(encoding="utf-8")

    assert "apt-get install -y --no-install-recommends" in content
    assert (
        "build-essential" in content
        or ("gcc" in content and "g++" in content)
    )
