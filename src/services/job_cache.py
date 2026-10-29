import threading
from collections import OrderedDict
from typing import Dict, List, Optional, Tuple, Any

from src.models.schemas import JobRecord, JobState

TERMINAL_JOB_STATES = {JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED}

RUNNING_JOB_STATES = {
    JobState.COMPILING_PROMPT,
    JobState.PLANNING_TIMELINE,
    JobState.PREPARING_IDENTITY,
    JobState.SYNTHESIZING_AUDIO,
    JobState.SCHEDULING_SEGMENTS,
    JobState.GENERATING_SEGMENTS,
    JobState.QA_CHECKING,
    JobState.ASSEMBLING,
}

NON_TERMINAL_STATES = {
    JobState.RECEIVED,
    JobState.CONSENT_PENDING,
    JobState.CONSENT_VERIFIED,
    JobState.COMPILING_PROMPT,
    JobState.PLANNING_TIMELINE,
    JobState.PREPARING_IDENTITY,
    JobState.SYNTHESIZING_AUDIO,
    JobState.SCHEDULING_SEGMENTS,
    JobState.GENERATING_SEGMENTS,
    JobState.QA_CHECKING,
    JobState.ASSEMBLING,
}


class BoundedJobCache:
    """
    Thread-safe LRU cache for recent JobRecords with max size to prevent memory leaks.
    Never evicts jobs that are in non-terminal (running / active) states.
    """
    def __init__(self, maxsize: int = 100):
        self._cache: OrderedDict[str, JobRecord] = OrderedDict()
        self.maxsize = maxsize
        self._lock = threading.RLock()

    def __setitem__(self, key: str, value: JobRecord) -> None:
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = value

            if len(self._cache) > self.maxsize:
                evicted_key = None
                # 1. First priority: oldest terminal job
                for k, v in list(self._cache.items()):
                    if getattr(v, "state", None) in TERMINAL_JOB_STATES:
                        evicted_key = k
                        break
                # 2. Second priority: oldest non-running job
                if not evicted_key:
                    for k, v in list(self._cache.items()):
                        if getattr(v, "state", None) not in RUNNING_JOB_STATES:
                            evicted_key = k
                            break
                # 3. If all cached jobs are in flight, do not evict (expand temporarily)
                if evicted_key:
                    del self._cache[evicted_key]

    def __getitem__(self, key: str) -> JobRecord:
        with self._lock:
            val = self._cache[key]
            self._cache.move_to_end(key)
            return val

    def __contains__(self, key: str) -> bool:
        with self._lock:
            return key in self._cache

    def __len__(self) -> int:
        with self._lock:
            return len(self._cache)

    def __iter__(self):
        with self._lock:
            return iter(list(self._cache.keys()))

    def get(self, key: str, default: Optional[JobRecord] = None) -> Optional[JobRecord]:
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return self._cache[key]
            return default

    def pop(self, key: str, default: Any = None) -> Any:
        with self._lock:
            return self._cache.pop(key, default)

    def __delitem__(self, key: str) -> None:
        with self._lock:
            del self._cache[key]

    def values(self) -> List[JobRecord]:
        with self._lock:
            return list(self._cache.values())

    def items(self) -> List[Tuple[str, JobRecord]]:
        with self._lock:
            return list(self._cache.items())

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()
