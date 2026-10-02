import pytest
from src.models.schemas import ConsentRequest, JobCreate, JobRecord, JobState
from src.services.jobs import BoundedJobCache, JOBS, save_job_record, load_job_record


def test_bounded_job_cache_lru_eviction():
    cache = BoundedJobCache(maxsize=3)
    consent = ConsentRequest(
        authorized=True,
        statement="I authorize this video generation and own all rights.",
        face_rights_attested=True,
        voice_rights_attested=True,
    )
    req = JobCreate(
        photo_asset_id="photo_1",
        voice_asset_id="voice_1",
        script="Test script",
        prompt="Test prompt",
        consent=consent,
    )

    for i in range(5):
        j_id = f"job_mem_{i}"
        rec = JobRecord(
            job_id=j_id,
            state=JobState.RECEIVED,
            request=req,
            photo_path="storage/assets/p1.jpg",
            voice_path="storage/assets/v1.wav",
        )
        cache[j_id] = rec

    # Cache should contain at most 3 items
    assert len(cache) == 3
    # First two inserted items (job_mem_0, job_mem_1) should be evicted
    assert "job_mem_0" not in cache
    assert "job_mem_1" not in cache
    assert "job_mem_2" in cache
    assert "job_mem_3" in cache
    assert "job_mem_4" in cache
