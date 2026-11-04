"""Structured runtime diagnostics; durable audit history uses separate JSONL files."""
import json
import logging
import os
import sys
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler

__all__ = ["JsonFormatter", "config_logging"]

class JsonFormatter(logging.Formatter):
  def __init__(self, service: str = "database info") -> None:
    super().__init__()
    self.service = service

  def format(self, record: logging.LogRecord) -> str:
    # Copy extras so formatting one handler does not mutate another handler's data.
    raw_extra = getattr(record, 'extra', None)
    if isinstance(raw_extra, dict):
      extra = dict(raw_extra)
    elif raw_extra is None:
      extra = {}
    else:
      extra = {'value': raw_extra}
    if record.exc_info:
      extra['stack'] = self.formatException(record.exc_info)
    payload = {
      'timestamp': datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(
        timespec='milliseconds').replace('+00:00', 'Z'),
      'level': record.levelname,
      'service': self.service,
      'logger': record.name,
      'message': record.getMessage(),
      'extra': extra or None,
    }
    return json.dumps(payload, ensure_ascii=False, default=str)


def config_logging(
  log_file: str | os.PathLike | None = None,
  level: int = logging.INFO,
  service: str = "database",
  max_bytes: int = 100 * 1024 * 1024,
  backup_count: int = 50,
  console: bool = True) -> None:
  """Configure diagnostic handlers for database without changing Python root logging."""
  pkg_logger = logging.getLogger('database')
  pkg_logger.setLevel(level)
  pkg_logger.propagate = False
  for handler in list(pkg_logger.handlers):
    pkg_logger.removeHandler(handler)
    handler.close()
  formatter = JsonFormatter(service=service)
  if console:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    pkg_logger.addHandler(handler)
  if log_file is not None:
    path = os.fspath(log_file)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    handler = RotatingFileHandler(path, maxBytes=max_bytes,
                                  backupCount=backup_count, encoding='utf-8')
    handler.setFormatter(formatter)
    pkg_logger.addHandler(handler)
