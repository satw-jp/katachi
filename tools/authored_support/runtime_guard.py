"""Process-local offline and frozen-source enforcement for normal CLI runs."""
from contextlib import contextmanager
from pathlib import Path
import sys

from .contracts import ContractError

_active = []
_installed = False


def _audit(event, args):
    for policy in _active:
        # gethostname reads local OS state (used by platform.system during the
        # pinned trimesh import); it performs neither DNS nor network traffic.
        if (event.startswith('socket.') and event != 'socket.gethostname') or event in {'subprocess.Popen', 'os.system', 'os.posix_spawn'}:
            policy['blocked_external_events'] += 1
            raise ContractError('normal authored-support runtime blocked external event: ' + event)
        if event != 'open' or not args or not isinstance(args[0], (str, bytes)):
            continue
        path = Path(args[0].decode() if isinstance(args[0], bytes) else args[0]).resolve(strict=False)
        key = str(path).casefold()
        if policy['generation'] and (path.suffix.casefold() in {'.3mf', '.stl', '.gcode'} or
           any(path == root or root in path.parents for root in policy['forbidden'])):
            raise ContractError('generation attempted a hidden reference read: ' + str(path))
        if path.name.casefold() == 'golden.json' and policy['generation']:
            raise ContractError('generation cannot read GOLDEN')
        source = policy['source']
        if source is not None and (path == source or source in path.parents):
            mode = args[1] or ''
            flags = args[2] if len(args) > 2 else 0
            import os
            if any(c in mode for c in 'wax+') or (flags and flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC)):
                raise ContractError('frozen source write attempted')
            if policy['generation'] and key not in policy['allowed']:
                raise ContractError('generation attempted an unpinned source read: ' + str(path))
            policy['source_reads'].add(key)


@contextmanager
def offline(*, generation=False, source=None, allowed=(), forbidden_roots=()):
    global _installed
    if not _installed:
        sys.addaudithook(_audit)
        _installed = True
    policy = dict(generation=generation, source=Path(source).resolve() if source else None,
                  forbidden=[Path(p).resolve() for p in forbidden_roots],
                  allowed={str(Path(p).resolve()).casefold() for p in allowed},
                  blocked_external_events=0, source_reads=set())
    _active.append(policy)
    try:
        yield policy
    finally:
        _active.remove(policy)
