def test_stream_endpoint_is_registered():
    from app.main import app

    paths = {route.path for route in app.routes}
    assert "/api/tasks/{task_id}/stream" in paths
