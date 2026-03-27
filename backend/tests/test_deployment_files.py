from pathlib import Path


def test_dockerfile_installs_c_compiler_for_triton_runtime():
    dockerfile = Path(__file__).resolve().parents[2] / "Dockerfile"
    content = dockerfile.read_text(encoding="utf-8")

    assert "apt-get install -y --no-install-recommends" in content
    assert (
        "build-essential" in content
        or ("gcc" in content and "g++" in content)
    )


def test_compose_sets_large_shared_memory_for_training_workers():
    compose_file = Path(__file__).resolve().parents[2] / "docker-compose.yml"
    content = compose_file.read_text(encoding="utf-8")

    assert 'shm_size: "128gb"' in content
